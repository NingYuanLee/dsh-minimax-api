import { defineTool } from '@deepseek-ai/dsh-tools';

export const name = 'MiniMax Media';
export const packageName = 'dsh-minimax-byapi';
export const inject = ['minimax-byapi', 'tools'];

const ownerOf = exec => {
  const owner = exec.agent?.session?.id;
  if (typeof owner !== 'string' || !owner) throw new Error('媒体工具需要有归属的 dsh 会话');
  return owner;
};
const jsonOutput = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }] };

export async function apply(ctx) {
  const runtime = ctx['minimax-byapi']?.runtime || ctx.get('minimax-byapi')?.runtime;
  if (!runtime) throw new Error('MiniMax Media 需要先启用 MiniMax ByAPI');
  const signalOf = exec => AbortSignal.any([exec.signal, runtime.abort?.signal].filter(Boolean));
  const disposers = [];
  const factories = [];
  // 描述里的"当前可选模型"来自最新清单，而 defineTool 会把它拍平成字符串，
  // 所以工具定义每次注册时重建；清单更新后整体换一遍。
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

  tool('minimax_generate_image', () => '用 MiniMax 生图模型生成图片并保存到本地。任何聊天模型都可以调用。用户说“画一张/生成图片/出图/做个海报/给我一张…”这类请求时用这个工具。'
    + '参数：prompt（必填）= 画面描述，最长 1500 字符；model（可选）= 图片模型 ID，当前可选：' + runtime.describeModels('image') + '，省略则用插件设置里的默认图片模型。'
    + 'image-01 与 image-01-live 都支持文生图和图生图；'
    + 'aspect_ratio（可选）= 宽高比，取值 1:1 / 16:9 / 4:3 / 3:2 / 2:3 / 3:4 / 9:16 / 21:9，其中 21:9 仅 image-01 支持，省略则服务端按 1:1；'
    + 'width 与 height（可选，仅 image-01 支持）= 指定像素宽高，必须成对同时给出、取值 512–2048 且为 8 的倍数，给出后不要再用 aspect_ratio；'
    + 'style_type 与 style_weight（可选，仅 image-01-live 支持）= 画风，style_type 取 漫画 / 元气 / 中世纪 / 水彩，style_weight 为 (0, 1] 的数字、默认 0.8；'
    + 'n（可选）= 一次生成几张，取值 1–9，默认 1；prompt_optimizer（可选）= 是否让服务端自动优化提示词，默认 false；'
    + 'seed（可选）= 随机种子，同种子同参数可复现；aigc_watermark（可选）= 是否给图片加 AIGC 水印，默认 false。'
    + '一次调用同步完成生成与保存。返回的 files[].path 是本地文件路径。status 不是 saved 时先用 minimax_media_status 查原任务，不要重新生成。'
    + '图片可在回复里用绝对路径内联：![说明](<files[].path>)。',
  { prompt: { type: 'string', required: true, description: '画面描述（主体、风格、构图、比例等），最长 1500 字符' },
    model: { type: 'string', description: '图片模型 ID，来自清单的 image 类；省略用插件默认' },
    aspect_ratio: { type: 'string', description: '宽高比：1:1 / 16:9 / 4:3 / 3:2 / 2:3 / 3:4 / 9:16 / 21:9（21:9 仅 image-01）' },
    width: { type: 'integer', description: '图片宽度像素，仅 image-01 支持，512–2048 且为 8 的倍数，必须与 height 成对' },
    height: { type: 'integer', description: '图片高度像素，仅 image-01 支持，512–2048 且为 8 的倍数，必须与 width 成对' },
    style_type: { type: 'string', description: '画风，仅 image-01-live 支持：漫画 / 元气 / 中世纪 / 水彩' },
    style_weight: { type: 'number', description: '画风权重，仅 image-01-live 支持，(0, 1] 的数字，默认 0.8' },
    n: { type: 'integer', description: '生成张数，1–9，默认 1' },
    prompt_optimizer: { type: 'boolean', description: '是否自动优化提示词，默认 false' },
    seed: { type: 'integer', description: '随机种子，同种子同参数可复现' },
    aigc_watermark: { type: 'boolean', description: '是否给图片加 AIGC 水印，默认 false' } },
  async (args, exec) => (await runtime.manager()).image({ ...args, model: modelOf(args, 'image', config().imageModel, '图片') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_edit_image', () => '用 MiniMax 图生图能力按文字说明编辑已有图片并保存。参考图用 image_url、image_urls（1–5 个 HTTPS 地址或 data URL）或已保存图片任务的 source_task_id，至少给一种。'
    + '参考图是主体参考（当前只支持人像 character），图片需为 JPG/JPEG/PNG 且小于 10MB。'
    + 'model 可选，当前图片模型：' + runtime.describeModels('image') + '；image-01 与 image-01-live 都支持图生图。'
    + 'aspect_ratio、width/height、style_type/style_weight、n、prompt_optimizer、seed、aigc_watermark 的含义与 minimax_generate_image 相同（style 仅 image-01-live、宽高仅 image-01、21:9 仅 image-01）。'
    + '一次调用完成编辑与保存。失败且 status 不是 saved 时，先查 minimax_media_status，不要重新编辑。',
  { prompt: { type: 'string', required: true, description: '要做的修改，最长 1500 字符' },
    model: { type: 'string', description: '图片模型 ID；省略用插件默认' },
    image_url: { type: 'string', description: '一张参考图的 HTTPS 地址或 data:image/...;base64,... ' },
    image_urls: { type: 'array', items: { type: 'string' }, description: '最多 5 张参考图的 HTTPS 地址' },
    source_task_id: { type: 'string', description: '已保存图片任务的 id；本地文件超过 8MB 时请改用 HTTPS 地址' },
    aspect_ratio: { type: 'string', description: '宽高比：1:1 / 16:9 / 4:3 / 3:2 / 2:3 / 3:4 / 9:16 / 21:9（21:9 仅 image-01）' },
    width: { type: 'integer', description: '图片宽度像素，仅 image-01 支持，512–2048 且为 8 的倍数，必须与 height 成对' },
    height: { type: 'integer', description: '图片高度像素，仅 image-01 支持，512–2048 且为 8 的倍数，必须与 width 成对' },
    style_type: { type: 'string', description: '画风，仅 image-01-live 支持：漫画 / 元气 / 中世纪 / 水彩' },
    style_weight: { type: 'number', description: '画风权重，仅 image-01-live 支持，(0, 1] 的数字，默认 0.8' },
    n: { type: 'integer', description: '生成张数，1–9，默认 1' },
    prompt_optimizer: { type: 'boolean', description: '是否自动优化提示词，默认 false' },
    seed: { type: 'integer', description: '随机种子，同种子同参数可复现' },
    aigc_watermark: { type: 'boolean', description: '是否给图片加 AIGC 水印，默认 false' } },
  async (args, exec) => (await runtime.manager()).editImage({ ...args, model: modelOf(args, 'image', config().imageModel, '图片') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_generate_video', () => '提交 MiniMax 视频生成任务。任何聊天模型都可以调用。用户说“生成视频/做个视频”时用这个工具。'
    + '带 image_url 或已保存图片任务的 source_task_id 时是图生视频（用这一张静帧作为首帧），只能一张。'
    + '参数：prompt（必填）= 视频内容描述，H3 系（MiniMax-H3 / H3-Highspeed / H3-Lite / H3-Max）最长 7000 字符、Hailuo 系（MiniMax-Hailuo-2.3 / 2.3-Fast / 02）最长 2000 字符，可用 [Pan left]、[Push in]、[Tracking shot] 等运镜指令；'
    + 'model（可选）当前可选：' + runtime.describeModels('video') + '；'
    + 'duration（可选）= 时长秒数，H3 / H3-Highspeed / H3-Lite 为 4–15（默认 5）、H3-Max 为 5–15、Hailuo 系只能 6 或 10（默认 6）；'
    + 'resolution（可选）= 分辨率，MiniMax-H3 为 768P / 2K，H3-Highspeed / H3-Lite / H3-Max 为 480P / 768P（不支持 2K），Hailuo 系为 720P / 768P / 1080P（1080P 只能 6 秒）；'
    + 'ratio（可选）= 画幅，仅 H3 系生效，取值 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16（文生视频必须给具体画幅，不能用 adaptive；图生视频固定 adaptive；MiniMax-H3-Lite 不支持 adaptive，要显式给具体比例）；'
    + 'prompt_expansion_mode（可选，仅 MiniMax-H3-Max 支持）= 提示词扩展模式 disabled / balanced / quality，默认 balanced；'
    + 'aigc_watermark（可选）= 是否给视频加 AIGC 水印，默认 false。'
    + '首帧图片限制：JPG/JPEG/PNG/WEBP/HEIC/HEIF，不超过 30MB，宽高 256–5760px，宽高比 0.4–2.5。'
    + '提交后插件会在后台查询，但结果卡片是快照，不会自动刷新。用 minimax_media_status(task_id) 取回，直到 saved 或 failed。status=submission-unknown 时不要重新提交。'
    + '视频不要用 Markdown 图片语法内联，由结果卡片播放器呈现。',
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

  tool('minimax_speak', () => '用 MiniMax 语音模型把文字合成语音并保存为音频文件。任何聊天模型都可以调用。用户说“念一下/读出来/配音/转成语音”时用这个工具。'
    + '参数：text（必填）= 要朗读的文本，最长 10000 字符；model（可选）当前可选：' + runtime.describeModels('speech') + '；'
    + 'voice_id（可选）= 音色 ID；speed（可选）= 语速，0.5–2，默认 1；vol（可选）= 音量，0–10，默认 1；pitch（可选）= 音高，-12–12，默认 0；'
    + 'emotion（可选）= 情绪 happy / sad / angry / fearful / disgusted / surprised / calm / fluent / whisper；format（可选）= 输出格式 mp3 / wav / flac / pcm，默认 mp3。'
    + '一次调用同步完成合成与保存，files[].path 是本地音频路径。本工具不做语音转文字，转写请用 minimax_transcribe。'
    + '音频不要用 Markdown 图片语法内联，由结果卡片播放器呈现。',
  { text: { type: 'string', required: true, description: '要朗读的文本，最长 10000 字符' },
    model: { type: 'string', description: '语音模型 ID，来自清单的 speech 类；省略用插件默认' },
    voice_id: { type: 'string', description: '音色 ID；省略用服务端默认' },
    speed: { type: 'number', description: '语速，0.5–2，默认 1' },
    vol: { type: 'number', description: '音量，0–10，默认 1' },
    pitch: { type: 'number', description: '音高，-12–12，默认 0' },
    emotion: { type: 'string', description: '情绪：happy / sad / angry / fearful / disgusted / surprised / calm / fluent / whisper' },
    format: { type: 'string', description: '输出格式：mp3 / wav / flac / pcm，默认 mp3' } },
  async (args, exec) => (await runtime.manager()).speech({ ...args, model: modelOf(args, 'speech', config().speechModel, '语音') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_generate_music', () => '用 MiniMax 音乐模型按描述与歌词生成一首歌并保存为音频文件。'
    + '注意：音乐模型（music-3.0 / music-2.6 / music-cover）已全部退役，2026-08-20 起音乐 API 不再向新用户开放，只有存量付费账号还能调用，新账号调用会失败。'
    + '参数：prompt（必填）= 曲风与情绪描述，最长 2000 字符；lyrics（可选）= 歌词，最长 3500 字符，可用 [verse]、[chorus] 段落标记；'
    + 'is_instrumental（可选）= true 表示纯器乐、不需要歌词；lyrics_optimizer（可选）= true 表示由服务端根据 prompt 自动写词；'
    + 'model（可选）当前可选：' + runtime.describeModels('music') + '，因为模型已退役，没有默认模型时必须显式指定。'
    + '一次调用同步完成生成与保存，files[].path 是本地音频路径。',
  { prompt: { type: 'string', required: true, description: '曲风、情绪、场景描述，最长 2000 字符' },
    lyrics: { type: 'string', description: '歌词，最长 3500 字符' },
    is_instrumental: { type: 'boolean', description: 'true 表示纯器乐' },
    lyrics_optimizer: { type: 'boolean', description: 'true 表示由服务端自动写词' },
    model: { type: 'string', description: '音乐模型 ID；因为模型已退役，建议显式指定' } },
  async (args, exec) => (await runtime.manager()).music({ ...args, model: modelOf(args, 'music', config().musicModel, '音乐') }, ownerOf(exec), signalOf(exec)));

  tool('minimax_transcribe', () => '用 MiniMax 把一段音频转成文字，不产生媒体文件。用户说“这段录音说了什么/转成文字/听写”时用这个工具。'
    + '参数：audio_path（本地音频文件路径）或 audio_url（音频的 HTTPS 地址或 data:audio/...;base64,... ），二者至少给一个；'
    + 'model（可选）默认 asr-1.0；response_format（可选）= json / verbose_json / srt / vtt，默认 json，verbose_json 会多给说话人数与分段时间戳；'
    + 'timestamp_level（可选）= "" / sentence / word，仅对 verbose_json、srt、vtt 生效。'
    + '音频支持 wav / aiff / flac / m4a / mp3 / aac / opus / ogg，时长不超过 500 秒、大小不超过 50MB。'
    + '返回 text 是转写文本，duration 是音频时长（秒）。',
  { audio_path: { type: 'string', description: '本地音频文件路径' },
    audio_url: { type: 'string', description: '音频的 HTTPS 地址或 data:audio/...;base64,... 地址' },
    model: { type: 'string', description: '识别模型 ID，默认 asr-1.0' },
    response_format: { type: 'string', description: '返回格式：json / verbose_json / srt / vtt，默认 json' },
    timestamp_level: { type: 'string', description: '时间戳粒度：空 / sentence / word' },
    language: { type: 'string', description: '主要语言提示（BCP-47），如 zh、en、ja；省略则自动识别' } },
  async (args, exec) => (await runtime.manager()).transcribe({ ...args, model: args.model || 'asr-1.0' }, ownerOf(exec), signalOf(exec)));

  tool('minimax_media_status', '查询某个媒体任务的状态，并在结果已生成时把它下载保存到本地。视频生成后必须用这个工具取回结果。返回 status：generating、saved、failed、submission-unknown、download-failed。不会发起新的生成、不计费。',
    idParam, async (args, exec) => (await runtime.manager()).poll(args.task_id, ownerOf(exec), signalOf(exec)));
  tool('minimax_media_retry_download', '重试下载并保存已生成的结果（status=download-failed）。不会重新生成、不计费。',
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
