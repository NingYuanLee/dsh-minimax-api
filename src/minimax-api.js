// MiniMax 媒体接口层：把官方 HTTP 接口包成不依赖插件运行时的纯函数，便于测试替换 fetch。
// 端点与字段依据官方文档（platform.minimax.io/docs）：
//   生图   POST /v1/image_generation（image-01 系）
//          POST /v1/images/generations、POST /v1/images/edits（H3 Image 系）
//   视频   POST /v1/video_generation（Hailuo 系）、POST /v2/video_generation（H3 系）
//   查询   GET  /v1/query/video_generation?task_id=...、GET /v2/query/video_generation/{task_id}
//   取文件 GET  /v1/files/retrieve?file_id=...
//   语音   POST /v1/t2a_v2
//   音乐   POST /v1/music_generation
//   转写   POST /v1/speech_to_text（multipart/form-data）
export const DEFAULT_API_ROOT = 'https://api.minimax.io';

// 官方文档给出的图片宽高比。
export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'];
export const H3_IMAGE_MODELS = ['MiniMax-H3-Image', 'MiniMax-H3-Image-Highspeed'];
export const H3_IMAGE_AREAS = ['1K', '2K', '4K'];
export const H3_IMAGE_FORMATS = ['png', 'jpeg', 'jpg', 'webp'];
export const H3_IMAGE_MAX_BYTES = 64 * 1024 * 1024;
export const H3_IMAGE_TIMEOUT_MS = 600000;
// v1（Hailuo 系）视频分辨率与时长。
export const VIDEO_RESOLUTIONS_V1 = ['720P', '768P', '1080P'];
export const VIDEO_DURATIONS_V1 = [6, 10];
// v2（H3 系）视频分辨率、时长与画幅。
export const VIDEO_RESOLUTIONS_V2 = ['480P', '768P', '2K'];
export const VIDEO_DURATIONS_V2 = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const VIDEO_RATIOS_V2 = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
// 官方文档给出的语音输出格式。
export const AUDIO_FORMATS = ['mp3', 'pcm', 'flac', 'wav', 'pcmu_raw', 'pcmu_wav', 'opus'];
// 生图画风，仅 image-01-live 支持。
export const IMAGE_STYLE_TYPES = ['漫画', '元气', '中世纪', '水彩'];
// v2 视频的提示词扩展模式，仅 MiniMax-H3-Max 支持。
export const PROMPT_EXPANSION_MODES = ['disabled', 'balanced', 'quality'];
// v2 视频的四个模型。
export const VIDEO_V2_MODELS = ['MiniMax-H3', 'MiniMax-H3-Highspeed', 'MiniMax-H3-Lite', 'MiniMax-H3-Max'];
// M Plan 额度查询端点固定在 www 主机上（官方 FAQ 的 curl 就是这么写的），与 API 主机不同。
export const QUOTA_HOSTS = { 'api.minimax.io': 'www.minimax.io', 'api.minimax.cn': 'www.minimax.cn', 'api.minimaxi.com': 'www.minimaxi.com' };
// 官方文档给出的语音音色情绪。
export const VOICE_EMOTIONS = ['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent', 'whisper'];
// 转写接口的输入与时长上限。
export const ASR_MAX_BYTES = 50 * 1024 * 1024;
export const ASR_MAX_SECONDS = 500;

const HEX_ONLY = /^[0-9a-fA-F]+$/;
const AUDIO_MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', pcm: 'audio/L16',
  pcmu_raw: 'audio/basic', pcmu_wav: 'audio/wav', opus: 'audio/ogg', ogg: 'audio/ogg',
};

export class MiniMaxError extends Error {
  constructor(message, { status, statusCode } = {}) {
    super(message);
    this.name = 'MiniMaxError';
    this.status = status;
    this.statusCode = statusCode;
  }
}

// apiRoot 可能带着 /v1 或 /anthropic 结尾，统一剥掉，媒体路径自己带版本段。
export function normalizeApiRoot(root) {
  const value = String(root || '').trim().replace(/\/+$/, '');
  if (!value) return DEFAULT_API_ROOT;
  return value.replace(/\/(v1|v2|anthropic)$/, '');
}

// H3 系走 v2 接口，其余（Hailuo 系）走 v1 接口。
export function isVideoV2(model) {
  return /^MiniMax-H3/i.test(String(model || ''));
}

export function isH3Image(model) {
  return H3_IMAGE_MODELS.includes(String(model || ''));
}

export function audioMime(format) {
  return AUDIO_MIME[String(format || 'mp3').toLowerCase()] || 'audio/mpeg';
}

// 官方文档里语音与音乐返回的是 hex 字符串；个别环境给 base64，两种都兼容。
export function decodeAudio(value, expectedBytes) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const candidates = [];
  if (HEX_ONLY.test(text) && text.length % 2 === 0) candidates.push(Buffer.from(text, 'hex'));
  candidates.push(Buffer.from(text, 'base64'));
  const matched = candidates.find(bytes => Number.isInteger(expectedBytes) && bytes.length === expectedBytes);
  return matched || candidates[0] || null;
}

// v1 的 Preparing/Queueing/Processing 与 v2 的 queued/running 归一成同一组状态。
export function normalizeVideoStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['success', 'succeeded', 'completed', 'done'].includes(key)) return 'success';
  if (['fail', 'failed', 'error', 'expired', 'cancelled', 'canceled'].includes(key)) return 'failed';
  return 'processing';
}

function toStringList(value) {
  if (Array.isArray(value)) return value.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

// 生图结果在 data.image_urls / data.image_base64，个别文档写成两层，两种都兼容。
function pickList(payload, key) {
  const data = payload?.data;
  const direct = toStringList(data?.[key]);
  if (direct.length) return direct;
  return toStringList(data?.data?.[key]);
}

function apiUrl(apiRoot, path, query) {
  const url = new URL(normalizeApiRoot(apiRoot) + path);
  if (query) for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.href;
}

async function readBody(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const parts = []; let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.length;
      if (count > limit) throw new MiniMaxError('MiniMax 响应超过大小限制');
      parts.push(value);
    }
  } finally { try { await reader.cancel(); } catch { /* 已读完 */ } reader.releaseLock(); }
  return Buffer.concat(parts, count).toString('utf8');
}

// MiniMax 有三种错误体：老接口的 base_resp、OpenAI 风格的 error、Anthropic 风格的 error。
function raiseFromPayload(payload, status) {
  const base = payload?.base_resp;
  const code = base?.status_code;
  if (code !== undefined && code !== null && Number(code) !== 0) {
    throw new MiniMaxError('MiniMax 返回错误 ' + code + '：' + (base.status_msg || '未知原因'), { status, statusCode: Number(code) });
  }
  const detail = payload?.error;
  if (detail) {
    const message = typeof detail === 'string' ? detail : detail.message || detail.type;
    const httpCode = detail.http_code ? Number(detail.http_code) : undefined;
    throw new MiniMaxError('MiniMax 返回错误：' + (message || '未知原因'), { status, statusCode: httpCode });
  }
  if (payload?.type === 'error' && payload?.message) {
    throw new MiniMaxError('MiniMax 返回错误：' + payload.message, { status });
  }
}

export async function requestJson({ apiRoot, apiKey, fetchImpl = fetch, signal, method = 'GET', path, query, body, maxResponseBytes = 32 * 1024 * 1024 }) {
  const response = await fetchImpl(apiUrl(apiRoot, path, query), {
    method,
    headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal,
  });
  const text = await readBody(response, maxResponseBytes);
  let payload = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
  if (!response.ok) {
    raiseFromPayload(payload, response.status);
    throw new MiniMaxError('MiniMax 接口返回 HTTP ' + response.status, { status: response.status });
  }
  raiseFromPayload(payload, response.status);
  return payload;
}

// 文生图与图生图共用一个端点：图生图多传 subject_reference。
export async function createImage({ apiRoot, apiKey, fetchImpl, signal, model = 'image-01', prompt, aspect_ratio, width, height, n, seed, prompt_optimizer, response_format = 'url', subject_reference, style, aigc_watermark }) {
  const body = { model, prompt };
  if (aspect_ratio) body.aspect_ratio = aspect_ratio;
  if (Number.isInteger(width)) body.width = width;
  if (Number.isInteger(height)) body.height = height;
  if (Number.isInteger(n)) body.n = n;
  if (Number.isInteger(seed)) body.seed = seed;
  if (typeof prompt_optimizer === 'boolean') body.prompt_optimizer = prompt_optimizer;
  if (response_format) body.response_format = response_format;
  if (Array.isArray(subject_reference) && subject_reference.length) body.subject_reference = subject_reference;
  // 画风只对 image-01-live 生效，校验在 media.js 里做。
  if (style && typeof style === 'object' && style.style_type) {
    body.style = { style_type: style.style_type };
    if (Number.isFinite(style.style_weight)) body.style.style_weight = style.style_weight;
  }
  if (typeof aigc_watermark === 'boolean') body.aigc_watermark = aigc_watermark;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/image_generation', body });
  const urls = pickList(payload, 'image_urls');
  const base64 = pickList(payload, 'image_base64');
  return {
    images: [...urls.map(url => ({ url })), ...base64.map(value => ({ base64: value }))],
    urls,
    requestId: typeof payload?.id === 'string' ? payload.id : undefined,
  };
}

// H3 Image 的非流式响应是逐张对象：成功项含 url/b64_json，失败项含 error。
function normalizeH3Images(payload) {
  const images = [], failures = [];
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  rows.forEach((row, imageIndex) => {
    if (row?.error) {
      failures.push({ imageIndex, code: String(row.error.code ?? ''), message: String(row.error.message || '图片生成失败') });
      return;
    }
    const url = typeof row?.url === 'string' && row.url.trim() ? row.url.trim() : undefined;
    const base64 = typeof row?.b64_json === 'string' && row.b64_json ? row.b64_json : undefined;
    if (!url && !base64) return;
    images.push({
      url, base64, imageIndex,
      dimensions: typeof row.size === 'string' ? row.size : undefined,
      revisedPrompt: typeof row.revised_prompt === 'string' ? row.revised_prompt : undefined,
    });
  });
  if (!images.length) throw new MiniMaxError('MiniMax H3 Image 没有返回可保存的图片');
  return {
    images, failures,
    usage: payload?.usage && typeof payload.usage === 'object' ? payload.usage : undefined,
    requestId: typeof payload?.request_id === 'string' ? payload.request_id : undefined,
  };
}

// SSE 的完成顺序不是张序，必须按 image_index 归位；completed 之前断流属于结果未知。
async function readH3ImageStream(response, { n, editing }) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('MiniMax H3 Image 流式响应为空');
  const prefix = editing ? 'image_edit' : 'image_generation';
  const decoder = new TextDecoder();
  const images = new Map(), failures = new Map();
  let buffer = '', completed;
  const consume = block => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); } catch { throw new MiniMaxError('MiniMax H3 Image 返回了无效 SSE 数据'); }
    const type = event?.type;
    if (type === 'error') {
      raiseFromPayload(event, Number(event.error?.http_code) || 200);
      throw new MiniMaxError('MiniMax H3 Image 流式生成失败');
    }
    if (type === prefix + '.completed') {
      if (completed) throw new MiniMaxError('MiniMax H3 Image 重复返回完成事件');
      completed = event; return;
    }
    if (type !== prefix + '.partial_succeeded' && type !== prefix + '.partial_failed') {
      throw new MiniMaxError('MiniMax H3 Image 返回了未知 SSE 事件');
    }
    const index = event.image_index;
    if (!Number.isInteger(index) || index < 0 || index >= n) throw new MiniMaxError('MiniMax H3 Image 返回了无效图片序号');
    if (type.endsWith('.partial_succeeded')) {
      if (images.has(index) || failures.has(index) || typeof event.url !== 'string' || !event.url.trim()) {
        throw new MiniMaxError('MiniMax H3 Image 返回了重复或无效的图片事件');
      }
      images.set(index, {
        url: event.url.trim(), imageIndex: index,
        dimensions: typeof event.size === 'string' ? event.size : undefined,
        revisedPrompt: typeof event.revised_prompt === 'string' ? event.revised_prompt : undefined,
      });
    } else {
      if (failures.has(index) || images.has(index)) throw new MiniMaxError('MiniMax H3 Image 返回了重复图片事件');
      failures.set(index, { imageIndex: index, code: String(event.code ?? ''), message: String(event.message || '图片生成失败') });
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        consume(block);
      }
      if (buffer.length > 4 * 1024 * 1024) throw new MiniMaxError('MiniMax H3 Image SSE 事件超过大小限制');
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    try { await reader.cancel(); } catch { /* 已读完 */ }
    reader.releaseLock();
  }
  if (!completed) throw new Error('MiniMax H3 Image 流式响应在完成事件前中断');
  const orderedImages = [...images.values()].sort((a, b) => a.imageIndex - b.imageIndex);
  if (!orderedImages.length) throw new MiniMaxError('MiniMax H3 Image 完成事件中没有成功图片');
  return {
    images: orderedImages,
    failures: [...failures.values()].sort((a, b) => a.imageIndex - b.imageIndex),
    usage: completed.usage && typeof completed.usage === 'object' ? completed.usage : undefined,
    requestId: typeof completed.request_id === 'string' ? completed.request_id : undefined,
  };
}

// H3 Image 文生图与编辑分端点，参数名称和响应结构均不同于 image-01 系。
export async function createH3Image({
  apiRoot, apiKey, fetchImpl = fetch, signal, model, prompt, images,
  n = 1, size, aspect_ratio, area, output_format = 'jpeg', response_format = 'url',
  stream = false, output_compression, disable_prompt_enhanced, aigc_watermark,
}) {
  if (!isH3Image(model)) throw new MiniMaxError('不支持的 H3 图片模型：' + model);
  const editing = images !== undefined;
  if (stream && response_format !== 'url') throw new MiniMaxError('H3 Image 流式输出仅支持 response_format=url');
  const body = { model, prompt, n, output_format, response_format, stream };
  if (size) body.size = size;
  if (aspect_ratio) body.aspect_ratio = aspect_ratio;
  if (area) body.area = area;
  if (Number.isInteger(output_compression)) body.output_compression = output_compression;
  if (!editing && typeof disable_prompt_enhanced === 'boolean') body.disable_prompt_enhanced = disable_prompt_enhanced;
  if (typeof aigc_watermark === 'boolean') body.aigc_watermark = aigc_watermark;
  if (editing) body.images = images.map(image_url => ({ image_url }));
  const serialized = JSON.stringify(body);
  if (editing && Buffer.byteLength(serialized) > H3_IMAGE_MAX_BYTES) {
    throw new MiniMaxError('H3 Image 编辑请求体不能超过 64MiB，请改用公网 URL 或 mm_file:// 参考图');
  }
  const path = editing ? '/v1/images/edits' : '/v1/images/generations';
  if (!stream) {
    const payload = await requestJson({
      apiRoot, apiKey, fetchImpl, signal, method: 'POST', path, body,
      // b64_json 的最大合法输出明显超过旧接口的 32MiB 响应上限。
      maxResponseBytes: 160 * 1024 * 1024,
    });
    return normalizeH3Images(payload);
  }
  const response = await fetchImpl(apiUrl(apiRoot, path), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + apiKey, accept: 'text/event-stream', 'content-type': 'application/json' },
    body: serialized, redirect: 'error', signal,
  });
  if (!response.ok) {
    const text = await readBody(response, 32 * 1024 * 1024);
    let payload = null;
    if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
    raiseFromPayload(payload, response.status);
    throw new MiniMaxError('MiniMax H3 Image 接口返回 HTTP ' + response.status, { status: response.status });
  }
  return readH3ImageStream(response, { n, editing });
}

// v1 视频（Hailuo 系）：文生视频用 prompt，图生视频用 first_frame_image。
export async function createVideoV1({ apiRoot, apiKey, fetchImpl, signal, model, prompt, duration, resolution, prompt_optimizer, fast_pretreatment, first_frame_image }) {
  const body = { model, prompt };
  if (Number.isInteger(duration)) body.duration = duration;
  if (resolution) body.resolution = resolution;
  if (typeof prompt_optimizer === 'boolean') body.prompt_optimizer = prompt_optimizer;
  if (typeof fast_pretreatment === 'boolean') body.fast_pretreatment = fast_pretreatment;
  if (first_frame_image) body.first_frame_image = first_frame_image;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/video_generation', body });
  const taskId = typeof payload?.task_id === 'string' ? payload.task_id : '';
  if (!taskId) throw new MiniMaxError('MiniMax 视频接口没有返回任务 ID');
  return { taskId };
}

// v2 视频（H3 系）：多模态 content 数组，resolution 与 duration 必填。
export async function createVideoV2({ apiRoot, apiKey, fetchImpl, signal, model, content, resolution, duration, ratio, extra, aigc_watermark }) {
  const body = {
    model,
    content: Array.isArray(content) && content.length ? content : [{ type: 'text', text: '' }],
    resolution,
    duration,
  };
  if (ratio) body.ratio = ratio;
  // extra 是封闭对象，只有 prompt_expansion_mode 一个键。
  if (extra && typeof extra === 'object' && extra.prompt_expansion_mode) {
    body.extra = { prompt_expansion_mode: extra.prompt_expansion_mode };
  }
  if (typeof aigc_watermark === 'boolean') body.aigc_watermark = aigc_watermark;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v2/video_generation', body });
  const taskId = typeof payload?.task_id === 'string' ? payload.task_id : '';
  if (!taskId) throw new MiniMaxError('MiniMax 视频接口没有返回任务 ID');
  return { taskId };
}

export async function queryVideoV1({ apiRoot, apiKey, fetchImpl, signal, taskId }) {
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'GET', path: '/v1/query/video_generation', query: { task_id: taskId } });
  return {
    status: normalizeVideoStatus(payload?.status),
    taskId: typeof payload?.task_id === 'string' ? payload.task_id : taskId,
    fileId: typeof payload?.file_id === 'string' && payload.file_id ? payload.file_id : undefined,
    width: payload?.video_width,
    height: payload?.video_height,
  };
}

// v2 成片地址直接放在 task.content.url，没有 file_id 这一步。
export async function queryVideoV2({ apiRoot, apiKey, fetchImpl, signal, taskId }) {
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'GET', path: '/v2/query/video_generation/' + encodeURIComponent(taskId) });
  const task = payload?.task || {};
  return {
    status: normalizeVideoStatus(task.status),
    taskId: typeof task.id === 'string' ? task.id : taskId,
    downloadUrl: typeof task.content?.url === 'string' && task.content.url ? task.content.url : undefined,
    error: typeof task.error?.message === 'string' ? task.error.message : undefined,
    duration: task.duration,
    resolution: task.resolution,
  };
}

// 取下载地址：v1 视频成功后用 file_id 换 download_url（有效期约 1 小时）。
export async function retrieveFile({ apiRoot, apiKey, fetchImpl, signal, fileId }) {
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'GET', path: '/v1/files/retrieve', query: { file_id: fileId } });
  const file = payload?.file || {};
  const downloadUrl = typeof file.download_url === 'string' ? file.download_url.trim() : '';
  if (!downloadUrl) throw new MiniMaxError('MiniMax 文件接口没有返回下载地址');
  return { downloadUrl, fileId: typeof file.file_id === 'string' ? file.file_id : fileId, filename: file.filename, bytes: file.bytes };
}

export async function synthesizeSpeech({ apiRoot, apiKey, fetchImpl, signal, model, text, voice_setting, audio_setting, language_boost, output_format = 'hex' }) {
  const body = { model, text, stream: false, output_format };
  if (voice_setting && Object.keys(voice_setting).length) body.voice_setting = voice_setting;
  if (audio_setting && Object.keys(audio_setting).length) body.audio_setting = audio_setting;
  if (language_boost) body.language_boost = language_boost;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/t2a_v2', body });
  const data = payload?.data;
  if (!data || typeof data.audio !== 'string' || !data.audio.trim()) throw new MiniMaxError('MiniMax 语音接口没有返回音频');
  if (typeof data.status === 'number' && data.status !== 2) throw new MiniMaxError('MiniMax 语音合成尚未完成（status ' + data.status + '）');
  const expected = Number.isInteger(payload?.extra_info?.audio_size) ? payload.extra_info.audio_size : undefined;
  const bytes = decodeAudio(data.audio, expected);
  if (!bytes?.length) throw new MiniMaxError('MiniMax 语音接口返回的音频无法解码');
  const format = payload?.extra_info?.audio_format || audio_setting?.format || 'mp3';
  return { audioBytes: bytes, mime: audioMime(format), format, sampleRate: payload?.extra_info?.audio_sample_rate };
}

export async function generateMusic({ apiRoot, apiKey, fetchImpl, signal, model, prompt, lyrics, is_instrumental, lyrics_optimizer, audio_setting, output_format = 'hex' }) {
  const body = { model, prompt, output_format };
  if (typeof lyrics === 'string' && lyrics.trim()) body.lyrics = lyrics;
  if (typeof is_instrumental === 'boolean') body.is_instrumental = is_instrumental;
  if (typeof lyrics_optimizer === 'boolean') body.lyrics_optimizer = lyrics_optimizer;
  if (audio_setting && Object.keys(audio_setting).length) body.audio_setting = audio_setting;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/music_generation', body });
  const data = payload?.data;
  if (!data || typeof data.audio !== 'string' || !data.audio.trim()) throw new MiniMaxError('MiniMax 音乐接口没有返回音频');
  if (typeof data.status === 'number' && data.status !== 2) throw new MiniMaxError('MiniMax 音乐生成尚未完成（status ' + data.status + '）');
  const expected = Number.isInteger(payload?.extra_info?.music_size) ? payload.extra_info.music_size : undefined;
  const bytes = decodeAudio(data.audio, expected);
  if (!bytes?.length) throw new MiniMaxError('MiniMax 音乐接口返回的音频无法解码');
  const format = payload?.extra_info?.audio_format || audio_setting?.format || 'mp3';
  return { audioBytes: bytes, mime: audioMime(format), format, duration: payload?.extra_info?.music_duration };
}

// 查询当前账号可用的音色：系统音色、快速复刻音色与文生音色。
// 端点 POST /v1/get_voice，voice_type ∈ system | voice_cloning | voice_generation | all。
export async function listVoices({ apiRoot, apiKey, fetchImpl, signal, voiceType = 'system' }) {
  const allowed = ['system', 'voice_cloning', 'voice_generation', 'all'];
  if (!allowed.includes(voiceType)) throw new MiniMaxError('音色类型必须为 ' + allowed.join(' / '));
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/get_voice', body: { voice_type: voiceType } });
  const normalize = row => ({
    voice_id: typeof row?.voice_id === 'string' ? row.voice_id : '',
    voice_name: typeof row?.voice_name === 'string' ? row.voice_name : '',
    description: toStringList(row?.description),
    created_time: typeof row?.created_time === 'string' ? row.created_time : undefined,
  });
  return {
    system: (Array.isArray(payload?.system_voice) ? payload.system_voice : []).map(normalize).filter(row => row.voice_id),
    cloning: (Array.isArray(payload?.voice_cloning) ? payload.voice_cloning : []).map(normalize).filter(row => row.voice_id),
    generation: (Array.isArray(payload?.voice_generation) ? payload.voice_generation : []).map(normalize).filter(row => row.voice_id),
  };
}

// 异步长文本语音合成：创建任务后返回 task_id，查询成功后用 file_id 走文件接口下载。
// 音频设置在这里用 audio_sample_rate（同步接口用的是 sample_rate）。
export async function createSpeechAsync({ apiRoot, apiKey, fetchImpl, signal, model, text, voice_setting, audio_setting, language_boost }) {
  const body = { model, text };
  if (voice_setting && Object.keys(voice_setting).length) body.voice_setting = voice_setting;
  if (audio_setting && Object.keys(audio_setting).length) body.audio_setting = audio_setting;
  if (language_boost) body.language_boost = language_boost;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/t2a_async_v2', body });
  const taskId = payload?.task_id;
  if (taskId === undefined || taskId === null || String(taskId) === '') throw new MiniMaxError('MiniMax 异步语音接口没有返回任务 ID');
  return {
    taskId: String(taskId),
    fileId: payload?.file_id !== undefined && payload?.file_id !== null ? String(payload.file_id) : undefined,
    usageCharacters: Number.isFinite(payload?.usage_characters) ? payload.usage_characters : undefined,
  };
}

export async function querySpeechAsync({ apiRoot, apiKey, fetchImpl, signal, taskId }) {
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'GET', path: '/v1/query/t2a_async_query_v2', query: { task_id: taskId } });
  const status = String(payload?.status || '').trim().toLowerCase();
  return {
    status: status === 'success' ? 'success' : status === 'failed' || status === 'expired' ? 'failed' : 'processing',
    taskId: payload?.task_id !== undefined && payload?.task_id !== null ? String(payload.task_id) : String(taskId),
    fileId: payload?.file_id !== undefined && payload?.file_id !== null ? String(payload.file_id) : undefined,
    error: status === 'expired' ? '异步语音任务已过期（下载链接只有 9 小时有效期）' : undefined,
  };
}

// 语音转文字：multipart/form-data，响应文本或 JSON。
export async function transcribeAudio({ apiRoot, apiKey, fetchImpl = fetch, signal, model = 'asr-1.0', bytes, filename = 'audio', response_format = 'json', timestamp_level, language }) {
  if (!bytes?.length) throw new MiniMaxError('转写音频为空');
  if (bytes.length > ASR_MAX_BYTES) throw new MiniMaxError('转写音频不能超过 50MB');
  const form = new FormData();
  form.append('model', model);
  form.append('file', new Blob([bytes]), filename);
  if (response_format) form.append('response_format', response_format);
  if (timestamp_level !== undefined) form.append('timestamp_level', timestamp_level);
  const headers = { authorization: 'Bearer ' + apiKey };
  if (language) headers.language = language;
  const response = await fetchImpl(apiUrl(apiRoot, '/v1/speech_to_text'), { method: 'POST', headers, body: form, redirect: 'error', signal });
  const text = await readBody(response, 32 * 1024 * 1024);
  let payload = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
  if (!response.ok) {
    raiseFromPayload(payload, response.status);
    throw new MiniMaxError('MiniMax 转写接口返回 HTTP ' + response.status, { status: response.status });
  }
  raiseFromPayload(payload, response.status);
  if (!payload) return { text: text.trim() };
  return {
    text: typeof payload.text === 'string' ? payload.text : text.trim(),
    duration: payload.duration,
    nSpeakers: payload.n_speakers,
    segments: payload.segments,
    traceId: payload.trace_id,
  };
}

// ── M Plan 额度 ────────────────────────────────────────────────────────────
// 官方端点：GET https://www.minimax.io/v1/token_plan/remains（国内 www.minimax.cn），
// 必须用订阅 Key；按量付费 Key 会被拒绝。官方文档没有公开返回字段表。
//
// 实测（2026-11，sk-cp 订阅 Key）返回的结构是：
//   { model_remains: [ { model_name: "general",
//       current_interval_total_count: 0, current_interval_usage_count: 0,
//       current_interval_remaining_percent: 90,
//       current_weekly_total_count: 0, current_weekly_usage_count: 0,
//       current_weekly_remaining_percent: 7,
//       end_time: <epoch ms>, weekly_end_time: <epoch ms>,
//       remains_time: <ms>, weekly_remains_time: <ms> } ],
//     base_resp: { status_code: 0, status_msg: "success" } }
// 也就是：窗口数据在 model_remains[] 里（每项一个模型），百分比由 *_remaining_percent 直接给出，
// 计数（total/usage）在这种格式下是 0。早期版本按「计数在顶层、usage 是剩余」解析，
// 那种形状现在仍作为回退保留，但没有它时必须用百分比，否则界面只能显示「暂无数据」。

export function quotaHostFor(apiRoot) {
  const host = new URL(normalizeApiRoot(apiRoot)).hostname;
  return QUOTA_HOSTS[host] || null;
}

function quotaWindow(total, usage, resetAt) {
  const t = Number(total), u = Number(usage);
  const reset = resetAt === undefined || resetAt === null ? undefined : resetAt;
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(u) || u < 0) return { total: undefined, remaining: undefined, used: undefined, percentRemaining: undefined, resetAt: reset };
  // usage_count 语义：官方未公开字段表，早期实测为「剩余」；若它大于 total（不可能剩余），
  // 则按「已用」解读，此时剩余记 0。
  const remaining = u <= t ? u : 0;
  const used = u <= t ? t - u : u;
  return {
    total: t,
    remaining,
    used,
    percentRemaining: Math.round((remaining / t) * 1000) / 10,
    resetAt: reset,
  };
}

/**
 * epoch 毫秒转 ISO 时间串；解析不了就返回 undefined。
 * @param {unknown} value epoch 毫秒。
 * @returns {string|undefined} ISO 时间串。
 */
function epochToIso(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * 取一组窗口里最紧的那个：百分比取最小，重置时间取最早。
 * @param {Array<object>} rows 归一化后的模型行。
 * @param {string} percentKey 百分比字段名。
 * @param {string} resetKey 重置时间字段名。
 * @returns {object} 聚合后的百分比与重置时间。
 */
function tightest(rows, percentKey, resetKey) {
  const percents = rows.map(row => row[percentKey]).filter(value => Number.isFinite(value));
  const resets = rows.map(row => row[resetKey]).filter(value => typeof value === 'string').sort();
  return {
    percentRemaining: percents.length ? Math.min(...percents) : undefined,
    resetAt: resets.length ? resets[0] : undefined,
  };
}

export function normalizeQuota(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const data = body.data && typeof body.data === 'object' ? body.data : body;
  const pick = (...keys) => { for (const key of keys) { if (data[key] !== undefined && data[key] !== null) return data[key]; } return undefined; };
  const rows = Array.isArray(data.model_remains) ? data.model_remains : [];
  const models = rows.map(row => ({
    model: row?.model_name ?? row?.model,
    total: Number(row?.total) || undefined,
    remaining: Number(row?.remains) || undefined,
    percentRemaining: Number.isFinite(Number(row?.current_interval_remaining_percent)) ? Number(row.current_interval_remaining_percent) : undefined,
    weeklyPercentRemaining: Number.isFinite(Number(row?.current_weekly_remaining_percent)) ? Number(row.current_weekly_remaining_percent) : undefined,
    intervalResetAt: epochToIso(row?.end_time),
    weeklyResetAt: epochToIso(row?.weekly_end_time),
    intervalRemainsTimeMs: Number.isFinite(Number(row?.remains_time)) ? Number(row.remains_time) : undefined,
    weeklyRemainsTimeMs: Number.isFinite(Number(row?.weekly_remains_time)) ? Number(row.weekly_remains_time) : undefined,
  })).filter(row => typeof row.model === 'string' && row.model);
  // 顶层计数是老形状；新形状的计数在 model_remains 里且是 0，所以两者都读，谁有值用谁。
  const interval = quotaWindow(pick('current_interval_total_count'), pick('current_interval_usage_count'), pick('current_interval_reset_time'));
  const weekly = quotaWindow(pick('current_weekly_total_count'), pick('current_weekly_usage_count'), pick('current_weekly_reset_time'));
  const intervalPercent = tightest(models, 'percentRemaining', 'intervalResetAt');
  const weeklyPercent = tightest(models, 'weeklyPercentRemaining', 'weeklyResetAt');
  interval.percentRemaining = interval.percentRemaining ?? intervalPercent.percentRemaining;
  interval.resetAt = interval.resetAt ?? intervalPercent.resetAt;
  weekly.percentRemaining = weekly.percentRemaining ?? weeklyPercent.percentRemaining;
  weekly.resetAt = weekly.resetAt ?? weeklyPercent.resetAt;
  const remainsTime = Number(pick('remains_time'));
  const intervalRemains = models.map(row => row.intervalRemainsTimeMs).filter(value => Number.isFinite(value));
  return {
    interval5h: interval,
    weekly,
    // 5 小时窗口剩余毫秒数（实时倒计时，不是 token 计数）
    remainsTimeMs: Number.isFinite(remainsTime) ? remainsTime : (intervalRemains.length ? Math.min(...intervalRemains) : undefined),
    models,
  };
}

export async function fetchQuota({ apiRoot, apiKey, fetchImpl = fetch, signal, origin }) {
  const host = quotaHostFor(apiRoot);
  const base = origin || (host ? 'https://' + host : '');
  if (!base) throw new MiniMaxError('当前 API 地址不是 MiniMax 官方主机，无法查询 M Plan 额度');
  const response = await fetchImpl(base.replace(/\/+$/, '') + '/v1/token_plan/remains', {
    method: 'GET',
    headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', accept: 'application/json' },
    redirect: 'error', signal,
  });
  const text = await readBody(response, 2 * 1024 * 1024);
  let payload = null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = null; } }
  if (response.status === 401 || response.status === 403) throw new MiniMaxError('查询 M Plan 额度需要订阅 Key（按量付费 API Key 会被拒绝）', { status: response.status });
  if (!response.ok) {
    raiseFromPayload(payload, response.status);
    throw new MiniMaxError('查询 M Plan 额度失败：HTTP ' + response.status, { status: response.status });
  }
  raiseFromPayload(payload, response.status);
  return { host: host || new URL(base).hostname, ...normalizeQuota(payload), raw: payload };
}
