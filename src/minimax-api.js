// MiniMax 媒体接口层：把官方 HTTP 接口包成不依赖插件运行时的纯函数，便于测试替换 fetch。
// 端点与字段依据官方文档（platform.minimax.io/docs）：
//   生图   POST /v1/image_generation
//   视频   POST /v1/video_generation（Hailuo 系）、POST /v2/video_generation（H3 系）
//   查询   GET  /v1/query/video_generation?task_id=...、GET /v2/query/video_generation/{task_id}
//   取文件 GET  /v1/files/retrieve?file_id=...
//   语音   POST /v1/t2a_v2
//   音乐   POST /v1/music_generation
//   转写   POST /v1/speech_to_text（multipart/form-data）
export const DEFAULT_API_ROOT = 'https://api.minimax.io';

// 官方文档给出的图片宽高比。
export const IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'];
// v1（Hailuo 系）视频分辨率与时长。
export const VIDEO_RESOLUTIONS_V1 = ['720P', '768P', '1080P'];
export const VIDEO_DURATIONS_V1 = [6, 10];
// v2（H3 系）视频分辨率、时长与画幅。
export const VIDEO_RESOLUTIONS_V2 = ['480P', '768P', '2K'];
export const VIDEO_DURATIONS_V2 = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const VIDEO_RATIOS_V2 = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
// 官方文档给出的语音输出格式。
export const AUDIO_FORMATS = ['mp3', 'pcm', 'flac', 'wav', 'pcmu_raw', 'pcmu_wav', 'opus'];
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

export async function requestJson({ apiRoot, apiKey, fetchImpl = fetch, signal, method = 'GET', path, query, body }) {
  const response = await fetchImpl(apiUrl(apiRoot, path, query), {
    method,
    headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal,
  });
  const text = await readBody(response, 32 * 1024 * 1024);
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
export async function createImage({ apiRoot, apiKey, fetchImpl, signal, model = 'image-01', prompt, aspect_ratio, width, height, n, seed, prompt_optimizer, response_format = 'url', subject_reference }) {
  const body = { model, prompt };
  if (aspect_ratio) body.aspect_ratio = aspect_ratio;
  if (Number.isInteger(width)) body.width = width;
  if (Number.isInteger(height)) body.height = height;
  if (Number.isInteger(n)) body.n = n;
  if (Number.isInteger(seed)) body.seed = seed;
  if (typeof prompt_optimizer === 'boolean') body.prompt_optimizer = prompt_optimizer;
  if (response_format) body.response_format = response_format;
  if (Array.isArray(subject_reference) && subject_reference.length) body.subject_reference = subject_reference;
  const payload = await requestJson({ apiRoot, apiKey, fetchImpl, signal, method: 'POST', path: '/v1/image_generation', body });
  const urls = pickList(payload, 'image_urls');
  const base64 = pickList(payload, 'image_base64');
  return {
    images: [...urls.map(url => ({ url })), ...base64.map(value => ({ base64: value }))],
    urls,
    requestId: typeof payload?.id === 'string' ? payload.id : undefined,
  };
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
export async function createVideoV2({ apiRoot, apiKey, fetchImpl, signal, model, content, resolution, duration, ratio, extra }) {
  const body = {
    model,
    content: Array.isArray(content) && content.length ? content : [{ type: 'text', text: '' }],
    resolution,
    duration,
  };
  if (ratio) body.ratio = ratio;
  if (extra && typeof extra === 'object') body.extra = extra;
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
