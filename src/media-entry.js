import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'MiniMax Media';
export const packageName = 'dsh-minimax-api';
export const inject = ['minimax-api', 'tools'];

const ownerOf = exec => {
  const owner = exec.agent?.session?.id;
  if (typeof owner !== 'string' || !owner) throw new Error('媒体工具需要有归属的 dsh 会话');
  return owner;
};
const jsonOutput = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] };

export async function apply(ctx) {
  const runtime = ctx['minimax-api']?.runtime || ctx.get('minimax-api')?.runtime;
  if (!runtime) throw new Error('MiniMax Media 需要先启用 MiniMax API Access');
  const signalOf = exec => AbortSignal.any([exec.signal, runtime.abort?.signal].filter(Boolean));
  const disposers = [];
  const factories = [];
  // 工具描述保持静态，参数细节在 schema 里；清单更新时仍重建一次，
  // 避免注册表缓存旧定义。
  const tool = (toolName, description, parameters, run) => {
    factories.push(() => {
      const definition = { name: toolName, parameters, output: jsonOutput, async execute(args, exec) { return run(args, exec); } };
      Object.defineProperty(definition, 'description', { enumerable: true, get: () => (typeof description === 'function' ? description() : description) });
      return ctx.tools.register(defineTool(definition));
    });
  };
  const registerTools = () => {
    for (const dispose of disposers.splice(0)) { try { dispose(); } catch { /* 已注销 */ } }
    for (const build of factories) disposers.push(build());
  };
  const idParam = { task_id: { type: 'string', required: true, description: '任务 ID：由生成工具返回的 id 字段（UUID）' } };
  // 模型 ID 必须来自清单；音乐模型已退役，没有默认模型时必须显式指定。
  const modelOf = (args, category, fallback, label) => {
    const value = typeof args.model === 'string' && args.model.trim() ? args.model.trim() : (fallback || '');
    if (!value) {
      throw new Error(category === 'music'
        ? '音乐模型已退役且不向新账号开放，请显式指定 model（music-3.0 / music-2.6 / music-cover），只有存量付费账号可用'
        : '请指定 ' + label + '模型，或在插件设置里填好默认模型');
    }
    return runtime.requireModel(value, category);
  };
  const config = () => runtime.mediaConfig() || {};
  const imageParameters = editing => ({
    prompt: { type: 'string', required: true, description: editing ? '要做的修改；旧模型最长 1500 字符，H3 Image 最长 32000 个 Unicode 字符' : '画面描述（主体、风格、构图、比例等）；旧模型最长 1500 字符，H3 Image 最长 32000 个 Unicode 字符' },
    model: { type: 'string', description: '图片模型 ID，来自清单的 image 类；省略用插件默认' },
    ...(editing ? {
      image_url: { type: 'string', description: '一张参考图；H3 支持 HTTPS、mm_file://file_id、data:image/...;base64,...，旧模型支持 HTTPS/data URI' },
      image_urls: { type: 'array', items: { type: 'string' }, description: '参考图列表；旧模型合计最多 5 张，H3 合计最多 16 张，顺序即图 1、图 2…' },
      source_task_id: { type: 'string', description: '已保存图片任务的 id，引用其第一张图片' },
      source_task_ids: { type: 'array', items: { type: 'string' }, description: '多个已保存图片任务 id，各引用第一张图片；H3 与其他参考图合计最多 16 张（旧模型仍最多 5 张）' },
    } : {}),
    size: { type: 'string', description: '仅 H3：auto（默认）或 宽x高，如 2720x1536；面积 655360–20000000，比例 1:3–3:1；显式宽高时不能再传 aspect_ratio/area' },
    area: { type: 'string', description: '仅 H3：1K / 2K / 4K（默认），size 为 auto 或未传时可用' },
    aspect_ratio: { type: 'string', description: '旧模型：1:1 / 16:9 / 4:3 / 3:2 / 2:3 / 3:4 / 9:16 / 21:9（21:9 仅 image-01）；H3：auto 或自定义 X:Y（X/Y 为 1–300，比例 1:3–3:1）' },
    width: { type: 'integer', description: '旧模型仅 image-01：512–2048 且为 8 的倍数；H3 可替代 size 并与 height 成对使用，受总面积与比例限制' },
    height: { type: 'integer', description: '旧模型仅 image-01：512–2048 且为 8 的倍数；H3 可替代 size 并与 width 成对使用，受总面积与比例限制' },
    output_format: { type: 'string', description: '仅 H3：jpeg（默认）/ jpg / png / webp' },
    response_format: { type: 'string', description: '仅 H3：url（默认，链接 24 小时有效）/ b64_json；Base64 不支持流式，PNG 总面积≤2000 万，JPEG/WebP≤8000 万像素' },
    stream: { type: 'boolean', description: '仅 H3：true 时通过 SSE 逐张接收，默认 false；仅支持 response_format=url' },
    output_compression: { type: 'integer', description: '仅 H3：0–100，默认 95；仅 JPEG/WebP 生效' },
    ...(editing ? {} : { disable_prompt_enhanced: { type: 'boolean', description: '仅 H3 文生图：true 关闭 Prompt 增强，默认 false；关闭时必须指定显式 size 或固定 aspect_ratio' } }),
    style_type: { type: 'string', description: '画风，仅 image-01-live 支持：漫画 / 元气 / 中世纪 / 水彩' },
    style_weight: { type: 'number', description: '画风权重，仅 image-01-live 支持，(0, 1] 的数字，默认 0.8' },
    n: { type: 'integer', description: '生成张数：旧模型 1–9，H3 1–10，默认 1' },
    prompt_optimizer: { type: 'boolean', description: '仅旧模型：是否自动优化提示词，默认 false；H3 文生图改用 disable_prompt_enhanced' },
    seed: { type: 'integer', description: '仅旧模型：随机种子；H3 Image 不支持' },
    aigc_watermark: { type: 'boolean', description: '是否给图片加可见 AIGC 水印，默认 false；文件元数据中的隐式标识不受此参数控制' },
  });

  tool('minimax_generate_image', '生成图片并保存到本地。支持旧 image-01 系与 MiniMax-H3-Image / Highspeed；H3 完整支持尺寸、面积档、格式、Base64 与 SSE。省略 model 时用设置里的默认图片模型。status 不是 saved 时先查 minimax_media_status，不要重复生成。部分失败见 failures。图片用绝对路径内联。',
    imageParameters(false),
  async (args, exec) => (await runtime.manager()).image({ ...args, model: modelOf(args, 'image', config().imageModel, '图片') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_edit_image', '按参考图编辑图片并保存。H3 支持 1–16 张通用参考图（HTTPS、mm_file、data URI、已保存任务），旧模型仍为最多 5 张人像主体参考。失败时先查 minimax_media_status，不要重复编辑。部分失败见 failures。',
    imageParameters(true),
  async (args, exec) => (await runtime.manager()).editImage({ ...args, model: modelOf(args, 'image', config().imageModel, '图片') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_generate_video', '提交视频生成任务并保存成片。带 image_url 或 source_task_id 时用该静帧做首帧。H3 系 4–15 秒，Hailuo 系只能 6 或 10 秒；文生视频必须给具体 ratio，图生视频固定 adaptive，H3-Lite 不支持 adaptive。提交后用 minimax_media_status 取回；status=submission-unknown 时不要重复提交。视频由结果卡片播放，不要用 Markdown 内联。',
  { prompt: { type: 'string', required: true, description: '视频内容描述（画面、运动、镜头）；H3 系最长 7000 字符，Hailuo 系最长 2000 字符' },
    model: { type: 'string', description: '视频模型 ID，来自清单的 video 类；省略用插件默认' },
    duration: { type: 'integer', description: '时长秒数：H3 / H3-Highspeed / H3-Lite 为 4–15（默认 5），H3-Max 为 5–15，Hailuo 系 6 或 10（默认 6）' },
    resolution: { type: 'string', description: '分辨率：MiniMax-H3 为 768P / 2K，H3-Highspeed / H3-Lite / H3-Max 为 480P / 768P，Hailuo 系为 720P / 768P / 1080P' },
    ratio: { type: 'string', description: '画幅，仅 H3 系生效：21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16；文生视频不能用 adaptive' },
    prompt_expansion_mode: { type: 'string', description: '提示词扩展模式，仅 MiniMax-H3-Max 支持：disabled / balanced / quality' },
    aigc_watermark: { type: 'boolean', description: '是否给视频加 AIGC 水印，默认 false' },
    image_url: { type: 'string', description: '可选。一张首帧静帧的 HTTPS 地址或 data:image/...;base64,...，用来做图生视频' },
    source_task_id: { type: 'string', description: '可选。已保存图片任务的 id，用来做图生视频；超过 8MB 请改用 HTTPS 地址' } },
  async (args, exec) => (await runtime.manager()).video({ ...args, model: modelOf(args, 'video', config().videoModel, '视频') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_list_voices', '列出当前账号可用的音色（voice_id）。voice_type 默认 system；复刻与文生音色只有成功用于一次合成后才会出现。',
  { voice_type: { type: 'string', description: '音色类型：system / voice_cloning / voice_generation / all，默认 system' } },
  async (args, exec) => (await runtime.manager()).voices(args, ownerOf(exec), signalOf(exec)));

  tool('minimax_speak', '同步文字转语音并保存音频文件。长文本用 minimax_speak_long，转写用 minimax_transcribe。音频由结果卡片播放，不要用 Markdown 内联。',
  { text: { type: 'string', required: true, description: '要朗读的文本，最长 10000 字符' },
    model: { type: 'string', description: '语音模型 ID，来自清单的 speech 类；省略用插件默认' },
    voice_id: { type: 'string', description: '音色 ID；省略用服务端默认，可用 minimax_list_voices 查询' },
    speed: { type: 'number', description: '语速，0.5–2，默认 1' },
    vol: { type: 'number', description: '音量，0–10，默认 1' },
    pitch: { type: 'number', description: '音高，-12–12，默认 0' },
    emotion: { type: 'string', description: '情绪：happy / sad / angry / fearful / disgusted / surprised / calm / fluent / whisper' },
    format: { type: 'string', description: '输出格式：mp3 / wav / flac / pcm，默认 mp3' } },
  async (args, exec) => (await runtime.manager()).speech({ ...args, model: modelOf(args, 'speech', config().speechModel, '语音') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_speak_long', '异步长文本语音合成，返回任务 id；用 minimax_media_status 取回并保存。上游下载链接 9 小时内有效，不要重复提交。',
  { text: { type: 'string', required: true, description: '要朗读的文本，最长 100000 字符' },
    model: { type: 'string', description: '语音模型 ID，来自清单的 speech 类；省略用插件默认' },
    voice_id: { type: 'string', description: '音色 ID；省略用服务端默认，可用 minimax_list_voices 查询' },
    speed: { type: 'number', description: '语速，0.5–2，默认 1' },
    vol: { type: 'number', description: '音量，0–10，默认 1' },
    pitch: { type: 'number', description: '音高，-12–12，默认 0' },
    emotion: { type: 'string', description: '情绪：happy / sad / angry / fearful / disgusted / surprised / calm / fluent / whisper' },
    format: { type: 'string', description: '输出格式：mp3 / wav / flac / pcm，默认 mp3' },
    language_boost: { type: 'string', description: '语言提示，例如 Chinese、English、auto' } },
  async (args, exec) => (await runtime.manager()).speakLong({ ...args, model: modelOf(args, 'speech', config().speechModel, '语音') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_generate_music', '已退役：仅存量付费账号可调用，新账号会失败。model 必须显式指定。',
  { prompt: { type: 'string', required: true, description: '曲风、情绪、场景描述，最长 2000 字符' },
    lyrics: { type: 'string', description: '歌词，最长 3500 字符' },
    is_instrumental: { type: 'boolean', description: 'true 表示纯器乐' },
    lyrics_optimizer: { type: 'boolean', description: 'true 表示由服务端自动写词' },
    model: { type: 'string', description: '音乐模型 ID；因为模型已退役，建议显式指定' } },
  async (args, exec) => (await runtime.manager()).music({ ...args, model: modelOf(args, 'music', config().musicModel, '音乐') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_transcribe', '把音频转成文字，不产生媒体文件。audio_path 与 audio_url 至少给一个；音频 ≤500 秒、≤50MB。',
  { audio_path: { type: 'string', description: '本地音频文件路径' },
    audio_url: { type: 'string', description: '音频的 HTTPS 地址或 data:audio/...;base64,... 地址' },
    model: { type: 'string', description: '识别模型 ID，默认 asr-1.0' },
    response_format: { type: 'string', description: '返回格式：json / verbose_json / srt / vtt，默认 json' },
    timestamp_level: { type: 'string', description: '时间戳粒度：空 / sentence / word' },
    language: { type: 'string', description: '主要语言提示（BCP-47），如 zh、en、ja；省略则自动识别' } },
  async (args, exec) => (await runtime.manager()).transcribe({ ...args, model: args.model || 'asr-1.0' }, ownerOf(exec), signalOf(exec)));

  tool('minimax_media_status', '查询媒体任务状态，就绪时下载保存。不会重新生成、不计费。',
    idParam, async (args, exec) => (await runtime.manager()).poll(args.task_id, ownerOf(exec), signalOf(exec)));
  tool('minimax_media_retry_download', '重试失败的下载，不会重新生成、不计费。',
    idParam, async (args, exec) => (await runtime.manager()).retryDownload(args.task_id, ownerOf(exec), signalOf(exec)));
  tool('minimax_media_list', '列出本轮会话创建过的所有媒体任务。无参数。',
    {}, async (_args, exec) => (await runtime.manager()).list(ownerOf(exec)));

  registerTools();
  // 聊天行可能还没做完首轮发现就挂上了本行：清单一到就重建描述。
  const stopRefreshHook = runtime.onRefreshed?.(registerTools);
  ctx.on('dispose', () => {
    stopRefreshHook?.();
    for (const dispose of disposers.splice(0)) { try { dispose(); } catch { /* 已注销 */ } }
  });
}
