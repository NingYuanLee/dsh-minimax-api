import { mkdir, readdir, readFile, writeFile, rename, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFileLock } from './lock.js';
import {
  createImage, createVideoV1, createVideoV2, queryVideoV1, queryVideoV2, retrieveFile,
  synthesizeSpeech, generateMusic, transcribeAudio, listVoices, createSpeechAsync, querySpeechAsync,
  normalizeApiRoot, isVideoV2, MiniMaxError,
  ASR_MAX_BYTES, IMAGE_ASPECT_RATIOS, IMAGE_STYLE_TYPES, PROMPT_EXPANSION_MODES,
} from './minimax-api.js';

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const now = () => new Date().toISOString();
const mimeTypes = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/flac': '.flac', 'audio/L16': '.pcm', 'audio/basic': '.ulaw', 'audio/ogg': '.ogg',
};
// 重启后只认这些后缀，避免历史记录指向任意路径。
const FILE_PATTERN = /^result-\d+\.(png|jpg|gif|webp|mp4|mp3|wav|flac|pcm|ulaw|ogg)$/;
const INLINE_LIMIT = 8 * 1024 * 1024;
// 官方文档给出的各接口输入上限。
const IMAGE_PROMPT_MAX = 1500;
const VIDEO_PROMPT_MAX = 2000;
const VIDEO_PROMPT_MAX_V2 = 7000;
const SPEECH_TEXT_MAX = 10000;
// 异步长文本语音接口单次上限 100,000 字符（同步接口是 10,000）。
const SPEECH_ASYNC_TEXT_MAX = 100000;
const MUSIC_PROMPT_MAX = 2000;
const MUSIC_LYRICS_MAX = 3500;
const IMAGE_COUNT_MAX = 9;
const REFERENCE_MAX = 5;
// 参考图与首帧图的大小上限（官方文档：参考图 <10MB，v1 首帧 <20MB，v2 首帧 ≤30MB）。
const SUBJECT_MAX_BYTES = 10 * 1024 * 1024;
const FIRST_FRAME_MAX_BYTES_V1 = 20 * 1024 * 1024;
const FIRST_FRAME_MAX_BYTES_V2 = 30 * 1024 * 1024;

function sniff(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0,3).toString() === 'GIF') return 'image/gif';
  if (bytes.subarray(0,4).toString() === 'RIFF') return bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : bytes.subarray(8,12).toString() === 'WAVE' ? 'audio/wav' : undefined;
  if (bytes.subarray(4,8).toString() === 'ftyp') return 'video/mp4';
  if (bytes.subarray(0,3).toString() === 'ID3' || bytes[0] === 255 && (bytes[1] & 224) === 224) return 'audio/mpeg';
  if (bytes.subarray(0,4).toString() === 'fLaC') return 'audio/flac';
}
const family = mime => String(mime || '').split('/')[0];
// data URL 的近似字节数：base64 每 4 个字符还原 3 个字节。
const dataUrlBytes = url => Math.floor((url.slice(url.indexOf(',') + 1).length * 3) / 4);

async function bounded(response, limit, signal) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('响应超过大小限制'); }
  const parts = []; let count = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('响应没有内容');
  try { for (;;) { signal?.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; count += value.length; if (count > limit) throw new Error('响应超过大小限制'); parts.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(parts, count);
}
function sleep(ms, signal) {
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolvePromise(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason instanceof Error ? signal.reason : new Error('已取消')); };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
function requireText(value, label, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + '不能为空');
  if (value.length > max) throw new Error(label + '不能超过 ' + max + ' 个字符');
  return value.trim();
}

export class MediaManager {
  constructor({ apiRoot, baseURL, resolveKey, dataDir, fetchImpl = fetch, timeoutMs = 60000, maxDownloadBytes = 268435456, watchDelayMs = 2000 }) {
    // apiRoot 是 MiniMax 主机根（https://api.minimax.io），媒体路径自己带 /v1、/v2。
    this.apiRoot = normalizeApiRoot(apiRoot || baseURL);
    this.resolveKey = resolveKey; this.root = resolve(dataDir, 'tasks');
    this.fetch = fetchImpl; this.timeoutMs = timeoutMs; this.maxBytes = maxDownloadBytes; this.watchDelayMs = watchDelayMs;
    this.tasks = new Map(); this.held = new Set(); this.watchers = new Set();
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await withFileLock(join(this.root, '.init.lock'), async () => {
      for (const entry of await readdir(this.root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !ID.test(entry.name)) continue;
        try {
          const raw = await readFile(join(this.root, entry.name, 'task.json'), 'utf8');
          if (raw.length > 48 * 1024 * 1024) continue;
          const task = JSON.parse(raw);
          if (task.id !== entry.name || typeof task.owner !== 'string' || !['image','video','speech','music'].includes(task.kind)) continue;
          if (!Array.isArray(task.files) || !Array.isArray(task.sources)) continue;
          // Records never authorize arbitrary saved paths after restart.
          task.files = task.files.filter(f => typeof f.name === 'string' && FILE_PATTERN.test(f.name));
          if (task.status === 'submitting') { task.status = 'submission-unknown'; task.error = '上次提交中断，结果未知，请勿自动重新生成'; }
          if (task.status === 'downloading') { task.status = 'download-failed'; task.error = '保存中断，可重试下载已有结果'; }
          this.tasks.set(task.id, task); await this.persist(task);
        } catch { /* Corrupt records are not adopted into another session. */ }
      }
    });
    return this;
  }
  directory(task) { return join(this.root, task.id); }
  async withTaskLock(id, operation) {
    if (this.held.has(id)) return operation();
    return withFileLock(join(this.root, id + '.lock'), async () => {
      this.held.add(id);
      try { return await operation(); }
      finally { this.held.delete(id); }
    });
  }
  async persist(task) {
    return this.withTaskLock(task.id, async () => {
      task.updatedAt = now(); await mkdir(this.directory(task), { recursive: true, mode: 0o700 });
      const file = join(this.directory(task), 'task.json'); const temp = file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(task), { mode: 0o600 }); await rename(temp, file);
    });
  }
  public(task) {
    const { id, owner, kind, model, status, remoteId, fileId, progress, error, createdAt, updatedAt } = task;
    return { id, owner, kind, model, status, ...(remoteId ? { remoteId } : {}), ...(fileId ? { fileId } : {}),
      ...(Number.isFinite(progress) ? { progress } : {}), ...(error ? { error } : {}), createdAt, updatedAt,
      files: task.files.map(f => ({ path: join(this.directory(task), f.name), mime: f.mime, size: f.size })) };
  }
  lookup(id, owner) {
    const task = this.tasks.get(id);
    if (!ID.test(id) || !task || task.owner !== owner) throw new Error('任务不存在或不属于当前会话');
    return task;
  }
  get(id, owner) { return this.public(this.lookup(id, owner)); }
  list(owner) { return [...this.tasks.values()].filter(t => t.owner === owner).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(t => this.public(t)); }
  async locked(id, operation) {
    return this.withTaskLock(id, operation);
  }
  signal(signal) { return AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(this.timeoutMs)]); }
  client(apiKey, signal) {
    return { apiRoot: this.apiRoot, apiKey, fetchImpl: this.fetch, signal };
  }
  validateURL(value) {
    const url = new URL(value); const base = new URL(this.apiRoot);
    if (url.username || url.password || url.hash) throw new Error('无效媒体链接');
    const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && url.origin === base.origin)) throw new Error('媒体链接必须使用 HTTPS');
    if (local && url.origin !== base.origin) throw new Error('拒绝跨服务本机媒体链接');
    return url;
  }
  async download(url, signal) {
    let current = this.validateURL(url);
    for (let n = 0; n <= 5; n++) {
      // Intentionally no API Authorization or cookies, even on same-origin URLs.
      const response = await this.fetch(current, { redirect: 'manual', signal, credentials: 'omit' });
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location || n === 5) throw new Error('媒体重定向失败');
        current = this.validateURL(new URL(location, current).href); continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error('媒体下载失败'); }
      return { bytes: await bounded(response, this.maxBytes, signal), declared: response.headers.get('content-type')?.split(';')[0] };
    }
  }
  async inlineFile(task, mimePrefix) {
    if (task.status !== 'saved' || !task.files.length) throw new Error('只能引用已保存的媒体任务');
    const file = task.files[0];
    if (!file.mime?.startsWith(mimePrefix)) throw new Error('引用的任务不是所需的媒体类型');
    const bytes = await readFile(join(this.directory(task), file.name));
    if (!bytes.length || bytes.length > INLINE_LIMIT) throw new Error('本地文件超过 8MB，请改用 HTTPS 地址');
    return 'data:' + file.mime + ';base64,' + bytes.toString('base64');
  }
  // 图生图 / 图生视频的参考图：公网地址、data URL 或已保存图片任务。
  // 官方限制：参考图为人像主体，JPG/JPEG/PNG 且小于 10MB。
  async imageReferences(args, owner) {
    const urls = [];
    const push = value => {
      if (typeof value !== 'string' || !value.trim()) return;
      const url = value.trim();
      if (url.startsWith('data:image/')) {
        if (url.length > INLINE_LIMIT * 2) throw new Error('参考图过大');
        if (dataUrlBytes(url) > SUBJECT_MAX_BYTES) throw new Error('参考图不能超过 10MB');
        urls.push(url); return;
      }
      this.validateURL(url); urls.push(url);
    };
    if (typeof args.image_url === 'string') push(args.image_url);
    if (Array.isArray(args.image_urls)) { if (args.image_urls.length > REFERENCE_MAX) throw new Error('图片编辑最多 ' + REFERENCE_MAX + ' 张参考图'); for (const item of args.image_urls) push(item); }
    if (typeof args.source_task_id === 'string' && args.source_task_id) urls.push(await this.inlineFile(this.lookup(args.source_task_id, owner), 'image/'));
    if (urls.length < 1 || urls.length > REFERENCE_MAX) throw new Error('图片编辑需要 1 到 ' + REFERENCE_MAX + ' 张参考图（image_url、image_urls 或已保存图片任务）；参考图为人像主体参考，JPG/JPEG/PNG 且小于 10MB');
    return urls;
  }
  // 图生视频的首帧：只接受一张。
  async firstFrame(args, owner) {
    const hasUrl = typeof args.image_url === 'string' && args.image_url.trim();
    const hasTask = typeof args.source_task_id === 'string' && args.source_task_id;
    if (!hasUrl && !hasTask) return undefined;
    const references = await this.imageReferences({ image_url: args.image_url, source_task_id: args.source_task_id }, owner);
    if (references.length !== 1) throw new Error('图生视频只能带一张静帧');
    const limit = isVideoV2(args.model) ? FIRST_FRAME_MAX_BYTES_V2 : FIRST_FRAME_MAX_BYTES_V1;
    if (references[0].startsWith('data:image/') && dataUrlBytes(references[0]) > limit) {
      throw new Error('首帧图片不能超过 ' + Math.round(limit / 1024 / 1024) + 'MB');
    }
    return references[0];
  }
  async saveResults(task, signal) {
    task.status = 'downloading'; delete task.error; await this.persist(task);
    try {
      if (!task.sources.length) throw new Error('没有可保存的结果');
      for (let i = task.files.length; i < task.sources.length; i++) {
        signal?.throwIfAborted(); const source = task.sources[i];
        let bytes, declared;
        if (source.b64) { if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source.b64)) throw new Error('无效图片编码'); bytes = Buffer.from(source.b64, 'base64'); }
        else if (source.raw) { bytes = Buffer.from(source.raw, 'base64'); }
        else ({ bytes, declared } = await this.download(source.url, signal));
        if (!bytes.length || bytes.length > this.maxBytes) throw new Error('结果大小无效');
        const sniffed = sniff(bytes);
        // raw 是已经解码好的音频，声明的格式就是权威；其余仍按文件头判定。
        const mime = source.mime || sniffed;
        if (!mime || !mimeTypes[mime]) throw new Error('结果不是期望的媒体文件');
        if (sniffed && family(sniffed) !== family(mime)) throw new Error('结果不是期望的媒体文件');
        const prefix = task.kind === 'image' ? 'image/' : task.kind === 'video' ? 'video/' : 'audio/';
        if (!mime.startsWith(prefix) || declared?.includes('text/html')) throw new Error('结果不是期望的媒体文件');
        const name = 'result-' + (i+1) + mimeTypes[mime]; const path = join(this.directory(task), name); const partial = path + '.part';
        const handle = await open(partial, 'w', 0o600);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        await rename(partial, path); task.files.push({ name, mime, size: bytes.length });
        await this.persist(task);
      }
      task.status = 'saved'; delete task.error;
      // Inline media no longer needs a duplicate payload once safely saved.
      task.sources = task.sources.map(s => s.url ? { url: s.url } : {});
    } catch {
      task.status = 'download-failed'; task.error = '结果保存失败（网络、格式或文件系统限制），可重试下载；不会重新生成';
    }
    await this.persist(task); return this.public(task);
  }
  // 所有生成类请求的公共骨架：先落任务，再提交，失败时保留结果已知的任务记录。
  async create(kind, args, owner, signal, run) {
    if (typeof owner !== 'string' || !owner) throw new Error('缺少任务归属');
    const model = typeof args?.model === 'string' ? args.model.trim() : '';
    if (!model) throw new Error('缺少模型 ID');
    signal?.throwIfAborted();
    // Resolve missing credentials before creating a potentially ambiguous task.
    const apiKey = await this.resolveKey();
    const task = { id: randomUUID(), owner, kind, model, status: 'submitting', files: [], sources: [], createdAt: now(), updatedAt: now() };
    this.tasks.set(task.id, task); await this.persist(task);
    return this.locked(task.id, async () => {
      const active = this.signal(signal); let accepted = false;
      try {
        const outcome = await run(this.client(apiKey, active), args, task);
        accepted = true;
        if (outcome?.taskId) {
          task.remoteId = outcome.taskId; task.status = 'generating';
          if (outcome.apiVersion) task.apiVersion = outcome.apiVersion;
          await this.persist(task);
          const published = this.public(task);
          queueMicrotask(() => this.ensureWatch(task.id));
          return published;
        }
        task.sources = outcome?.sources || [];
        return await this.saveResults(task, active);
      } catch (error) {
        // 拿到过 HTTP 响应说明上游已经知道这次请求，按失败处理；传输层异常结果未知。
        const upstream = error instanceof MiniMaxError;
        task.status = upstream ? 'failed' : 'submission-unknown';
        task.error = upstream ? error.message
          : accepted ? '上游已接受请求，但未取得完整结果，请勿自动重复生成'
          : '提交结果未知，请检查上游记录，不要自动重新生成';
        await this.persist(task); return this.public(task);
      }
    });
  }
  // 生图参数校验：不同模型可用的字段不同，非法组合直接报错，不发请求。
  imageArgs(args) {
    const model = args.model;
    const options = { model, response_format: 'url' };
    const styleType = args.style_type;
    const styleWeight = args.style_weight;
    if (styleType !== undefined || styleWeight !== undefined) {
      if (model !== 'image-01-live') throw new Error('画风设置仅 image-01-live 支持');
      if (typeof styleType !== 'string' || !IMAGE_STYLE_TYPES.includes(styleType)) {
        throw new Error('画风类型必须为：' + IMAGE_STYLE_TYPES.join(' / '));
      }
      if (styleWeight !== undefined && (typeof styleWeight !== 'number' || !Number.isFinite(styleWeight) || styleWeight <= 0 || styleWeight > 1)) {
        throw new Error('画风权重必须是 (0, 1] 之间的数字');
      }
      options.style = { style_type: styleType };
      if (styleWeight !== undefined) options.style.style_weight = styleWeight;
    }
    if (args.aspect_ratio) {
      if (!IMAGE_ASPECT_RATIOS.includes(args.aspect_ratio)) throw new Error('宽高比必须为：' + IMAGE_ASPECT_RATIOS.join(' / '));
      if (args.aspect_ratio === '21:9' && model !== 'image-01') throw new Error('21:9 宽高比仅 image-01 支持');
      options.aspect_ratio = args.aspect_ratio;
    }
    const hasWidth = args.width !== undefined && args.width !== null;
    const hasHeight = args.height !== undefined && args.height !== null;
    if (hasWidth !== hasHeight) throw new Error('width 与 height 必须成对设置');
    if (hasWidth) {
      if (model !== 'image-01') throw new Error('width 与 height 仅 image-01 支持');
      for (const value of [args.width, args.height]) {
        if (!Number.isInteger(value) || value < 512 || value > 2048 || value % 8 !== 0) {
          throw new Error('width 与 height 必须是 512–2048 之间且为 8 的倍数');
        }
      }
      options.width = args.width; options.height = args.height;
      // 官方文档说两者同时给出时以 aspect_ratio 为准，这里反过来：给了宽高就不下发 aspect_ratio。
      delete options.aspect_ratio;
    }
    if (args.n !== undefined) options.n = args.n;
    if (Number.isInteger(args.seed)) options.seed = args.seed;
    if (typeof args.prompt_optimizer === 'boolean') options.prompt_optimizer = args.prompt_optimizer;
    if (typeof args.aigc_watermark === 'boolean') options.aigc_watermark = args.aigc_watermark;
    return options;
  }
  async image(args, owner, signal) {
    const prompt = requireText(args.prompt, '图片描述', IMAGE_PROMPT_MAX);
    const n = args.n ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > IMAGE_COUNT_MAX) throw new Error('图片数量必须为 1 到 ' + IMAGE_COUNT_MAX);
    const options = this.imageArgs(args);
    return this.create('image', args, owner, signal, async (client) => {
      const result = await createImage({ ...client, ...options, prompt });
      return { sources: result.images.map(image => image.url ? { url: image.url } : { b64: image.base64 }) };
    });
  }
  async editImage(args, owner, signal) {
    const prompt = requireText(args.prompt, '图片描述', IMAGE_PROMPT_MAX);
    const n = args.n ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > IMAGE_COUNT_MAX) throw new Error('图片数量必须为 1 到 ' + IMAGE_COUNT_MAX);
    const options = this.imageArgs(args);
    const references = await this.imageReferences(args, owner);
    return this.create('image', args, owner, signal, async (client) => {
      const result = await createImage({
        ...client, ...options, prompt,
        subject_reference: references.map(url => ({ type: 'character', image_file: url })),
      });
      return { sources: result.images.map(image => image.url ? { url: image.url } : { b64: image.base64 }) };
    });
  }
  // 视频参数按接口版本分两套：H3 系走 v2，Hailuo 系走 v1。
  videoArgs(args) {
    const model = args.model;
    if (isVideoV2(model)) {
      const prompt = requireText(args.prompt, '视频描述', VIDEO_PROMPT_MAX_V2);
      const duration = args.duration ?? 5;
      if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error(model + ' 视频时长必须为 4 到 15 秒');
      if (model === 'MiniMax-H3-Max' && duration < 5) throw new Error('MiniMax-H3-Max 视频时长必须为 5 到 15 秒');
      const resolution = args.resolution || '768P';
      if (!['480P', '768P', '2K'].includes(resolution)) throw new Error(model + ' 视频分辨率必须为 480P、768P 或 2K');
      if (model === 'MiniMax-H3' && resolution === '480P') throw new Error('MiniMax-H3 视频分辨率只支持 768P 或 2K');
      if (model !== 'MiniMax-H3' && resolution === '2K') throw new Error(model + ' 视频分辨率不支持 2K');
      const ratio = args.ratio || '16:9';
      if (!['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(ratio)) {
        throw new Error('视频画幅必须为：adaptive / 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16');
      }
      const options = { prompt, duration, resolution, ratio };
      if (args.prompt_expansion_mode !== undefined) {
        if (model !== 'MiniMax-H3-Max') throw new Error('该模型不支持 extra 生成选项');
        if (!PROMPT_EXPANSION_MODES.includes(args.prompt_expansion_mode)) {
          throw new Error('提示词扩展模式必须为：' + PROMPT_EXPANSION_MODES.join(' / '));
        }
        options.extra = { prompt_expansion_mode: args.prompt_expansion_mode };
      }
      if (typeof args.aigc_watermark === 'boolean') options.aigc_watermark = args.aigc_watermark;
      return options;
    }
    const prompt = requireText(args.prompt, '视频描述', VIDEO_PROMPT_MAX);
    const duration = args.duration ?? 6;
    if (![6, 10].includes(duration)) throw new Error('Hailuo 视频时长必须为 6 或 10 秒');
    if (args.resolution && !['720P', '768P', '1080P'].includes(args.resolution)) throw new Error('视频分辨率必须为 720P、768P 或 1080P');
    if (args.resolution === '1080P' && duration !== 6) throw new Error('1080P 只支持 6 秒');
    const options = { prompt, duration, resolution: args.resolution };
    if (typeof args.aigc_watermark === 'boolean') options.aigc_watermark = args.aigc_watermark;
    return options;
  }
  async video(args, owner, signal) {
    const options = this.videoArgs(args);
    const frame = await this.firstFrame(args, owner);
    // 文生视频必须给具体画幅；图生视频的比例由首帧决定，恒为 adaptive。
    const ratio = frame ? 'adaptive' : options.ratio;
    if (!frame && ratio === 'adaptive') throw new Error('文生视频必须指定具体画幅，不能使用 adaptive');
    return this.create('video', args, owner, signal, async (client, a, task) => {
      if (isVideoV2(a.model)) {
        // v2 用多模态 content 数组，resolution 与 duration 必填。
        const content = [{ type: 'text', text: options.prompt }];
        if (frame) content.push({ type: 'image_url', image_url: { url: frame }, role: 'first_frame' });
        const request = { model: a.model, content, resolution: options.resolution, duration: options.duration, ratio };
        if (options.extra) request.extra = options.extra;
        if (typeof options.aigc_watermark === 'boolean') request.aigc_watermark = options.aigc_watermark;
        const result = await createVideoV2({ ...client, ...request });
        task.apiVersion = 2;
        return { taskId: result.taskId, apiVersion: 2 };
      }
      const request = { model: a.model, prompt: options.prompt, duration: options.duration };
      if (options.resolution) request.resolution = options.resolution;
      if (typeof a.prompt_optimizer === 'boolean') request.prompt_optimizer = a.prompt_optimizer;
      if (typeof a.fast_pretreatment === 'boolean') request.fast_pretreatment = a.fast_pretreatment;
      if (frame) request.first_frame_image = frame;
      const result = await createVideoV1({ ...client, ...request });
      task.apiVersion = 1;
      return { taskId: result.taskId, apiVersion: 1 };
    });
  }
  async speech(args, owner, signal) {
    const text = requireText(args.text, '朗读文本', SPEECH_TEXT_MAX);
    return this.create('speech', args, owner, signal, async (client, a) => {
      const voice = {};
      if (a.voice_id) voice.voice_id = a.voice_id;
      if (a.speed !== undefined) voice.speed = a.speed;
      if (a.vol !== undefined) voice.vol = a.vol;
      if (a.pitch !== undefined) voice.pitch = a.pitch;
      if (a.emotion) voice.emotion = a.emotion;
      const format = a.format || 'mp3';
      const audio_setting = {
        sample_rate: a.sample_rate ?? 32000,
        bitrate: a.bitrate ?? 128000,
        format,
        channel: a.channel ?? 1,
      };
      const result = await synthesizeSpeech({ ...client, model: a.model, text, voice_setting: voice, audio_setting });
      return { sources: [{ raw: result.audioBytes.toString('base64'), mime: result.mime }] };
    });
  }
  // 异步长文本语音：创建任务后立刻返回 task_id，后续由 poll 查询并用 file_id 下载。
  async speakLong(args, owner, signal) {
    const text = requireText(args.text, '朗读文本', SPEECH_ASYNC_TEXT_MAX);
    return this.create('speech', args, owner, signal, async (client, a) => {
      const voice = {};
      if (a.voice_id) voice.voice_id = a.voice_id;
      if (a.speed !== undefined) voice.speed = a.speed;
      if (a.vol !== undefined) voice.vol = a.vol;
      if (a.pitch !== undefined) voice.pitch = a.pitch;
      if (a.emotion) voice.emotion = a.emotion;
      const format = a.format || 'mp3';
      // 异步接口的音频字段是 audio_sample_rate（同步接口是 sample_rate），channel 默认 2。
      const audio_setting = {
        audio_sample_rate: a.sample_rate ?? 32000,
        bitrate: a.bitrate ?? 128000,
        format,
        channel: a.channel ?? 2,
      };
      const result = await createSpeechAsync({ ...client, model: a.model, text, voice_setting: voice, audio_setting, language_boost: a.language_boost });
      return { taskId: result.taskId };
    });
  }
  // 查询可用音色：不落媒体文件、不建任务。签名与其他方法一致（args, owner, signal），owner 不使用。
  async voices(args, _owner, signal) {
    const active = this.signal(signal);
    const apiKey = await this.resolveKey();
    const voiceType = typeof args?.voice_type === 'string' && args.voice_type.trim() ? args.voice_type.trim() : 'system';
    const voices = await listVoices({ ...this.client(apiKey, active), voiceType });
    const rows = [
      ...voices.system.map(row => ({ ...row, source: 'system' })),
      ...voices.cloning.map(row => ({ ...row, source: 'cloning' })),
      ...voices.generation.map(row => ({ ...row, source: 'generation' })),
    ];
    return { voice_type: voiceType, counts: { system: voices.system.length, cloning: voices.cloning.length, generation: voices.generation.length }, voices: rows };
  }
  async music(args, owner, signal) {
    const prompt = requireText(args.prompt, '音乐描述', MUSIC_PROMPT_MAX);
    if (typeof args.lyrics === 'string' && args.lyrics.length > MUSIC_LYRICS_MAX) throw new Error('歌词不能超过 ' + MUSIC_LYRICS_MAX + ' 个字符');
    return this.create('music', args, owner, signal, async (client, a) => {
      const options = { model: a.model, prompt, output_format: 'hex' };
      if (typeof a.lyrics === 'string' && a.lyrics.trim()) options.lyrics = a.lyrics;
      if (typeof a.is_instrumental === 'boolean') options.is_instrumental = a.is_instrumental;
      if (typeof a.lyrics_optimizer === 'boolean') options.lyrics_optimizer = a.lyrics_optimizer;
      options.audio_setting = { sample_rate: 44100, bitrate: 256000, format: a.format || 'mp3' };
      const result = await generateMusic({ ...client, ...options });
      return { sources: [{ raw: result.audioBytes.toString('base64'), mime: result.mime }] };
    });
  }
  // 语音转文字不产生媒体文件，直接返回文本。
  async transcribe(args, owner, signal) {
    if (typeof owner !== 'string' || !owner) throw new Error('缺少任务归属');
    const active = this.signal(signal);
    const apiKey = await this.resolveKey();
    const { bytes, filename } = await this.audioSource(args, active);
    return transcribeAudio({
      ...this.client(apiKey, active), model: args.model || 'asr-1.0', bytes, filename,
      response_format: args.response_format || 'json', timestamp_level: args.timestamp_level, language: args.language,
    });
  }
  async audioSource(args, signal) {
    if (typeof args.audio_path === 'string' && args.audio_path.trim()) {
      const path = args.audio_path.trim();
      const bytes = await readFile(path);
      if (bytes.length > ASR_MAX_BYTES) throw new Error('转写音频不能超过 50MB');
      return { bytes, filename: path.split(/[\\/]/).pop() || 'audio' };
    }
    if (typeof args.audio_url === 'string' && args.audio_url.trim()) {
      const url = args.audio_url.trim();
      if (url.startsWith('data:audio/')) {
        const comma = url.indexOf(',');
        if (comma < 0) throw new Error('音频 data URL 格式不正确');
        return { bytes: Buffer.from(url.slice(comma + 1), 'base64'), filename: 'audio' };
      }
      const { bytes } = await this.download(url, signal);
      if (bytes.length > ASR_MAX_BYTES) throw new Error('转写音频不能超过 50MB');
      return { bytes, filename: 'audio' };
    }
    throw new Error('需要 audio_path（本地音频文件）或 audio_url（音频地址）');
  }
  async poll(id, owner, signal) {
    const task = this.lookup(id, owner);
    if (!task.remoteId || ['saved', 'failed'].includes(task.status)) return this.public(task);
    return this.locked(id, async () => {
      const active = this.signal(signal);
      try {
        const apiKey = await this.resolveKey();
        const client = this.client(apiKey, active);
        if (task.kind === 'speech') {
          // 异步长文本语音：查询任务 → Success 后取 file_id → 文件接口换下载地址。
          const state = await querySpeechAsync({ ...client, taskId: task.remoteId });
          if (state.status === 'success') {
            const fileId = state.fileId || task.fileId;
            if (!fileId) throw new MiniMaxError('MiniMax 异步语音任务没有返回文件 ID');
            task.fileId = fileId;
            const file = await retrieveFile({ ...client, fileId });
            task.sources = [{ url: file.downloadUrl }];
            return await this.saveResults(task, active);
          }
          if (state.status === 'failed') { task.status = 'failed'; task.error = state.error || '上游异步语音任务失败或已过期'; }
          else { task.status = 'generating'; delete task.error; }
        } else if (task.apiVersion === 2) {
          const state = await queryVideoV2({ ...client, taskId: task.remoteId });
          if (state.status === 'success') {
            if (!state.downloadUrl) throw new MiniMaxError('MiniMax 视频任务没有返回成片地址');
            task.sources = [{ url: state.downloadUrl }];
            return await this.saveResults(task, active);
          }
          if (state.status === 'failed') { task.status = 'failed'; task.error = state.error || '上游视频任务失败'; }
          else { task.status = 'generating'; delete task.error; }
        } else {
          const state = await queryVideoV1({ ...client, taskId: task.remoteId });
          if (state.status === 'success') {
            if (!state.fileId) throw new MiniMaxError('MiniMax 视频任务没有返回文件 ID');
            task.fileId = state.fileId;
            const file = await retrieveFile({ ...client, fileId: state.fileId });
            task.sources = [{ url: file.downloadUrl }];
            return await this.saveResults(task, active);
          }
          if (state.status === 'failed') { task.status = 'failed'; task.error = '上游视频任务失败'; }
          else { task.status = 'generating'; delete task.error; }
        }
      } catch (error) {
        task.error = error instanceof MiniMaxError ? ('暂时无法查询：' + error.message) : '暂时无法查询，保留原任务 ID，稍后可以继续查询';
      }
      await this.persist(task); return this.public(task);
    });
  }
  async retryDownload(id, owner, signal) {
    const task = this.lookup(id, owner);
    if (task.status === 'saved') return this.public(task);
    if (['video', 'speech'].includes(task.kind) && task.remoteId && !task.sources.length) return this.poll(id, owner, signal);
    if (!task.sources.length) throw new Error('该任务没有可恢复的下载结果，不能以重试下载方式重新生成');
    return this.locked(id, () => this.saveResults(task, this.signal(signal)));
  }
  // Background polling is explicit-status compatible: it never resubmits a paid
  // request. The tool card stays a snapshot until something calls poll again.
  startWatchers(signal, onUpdate) {
    this.watchSignal = signal;
    this.onUpdate = onUpdate;
    for (const task of this.tasks.values()) this.ensureWatch(task.id);
  }
  ensureWatch(id) {
    const task = this.tasks.get(id);
    if (!this.onUpdate || !task || this.watchers.has(id)) return;
    // 视频与异步长文本语音都是远端任务，需要在后台轮询。
    if (!['video', 'speech'].includes(task.kind) || !task.remoteId || task.status !== 'generating') return;
    this.watchers.add(id);
    void this.follow(id, task.owner);
  }
  async follow(id, owner) {
    let delayMs = this.watchDelayMs;
    const started = Date.now();
    try {
      while (!this.watchSignal?.aborted && Date.now() - started < 15 * 60 * 1000) {
        await sleep(delayMs, this.watchSignal);
        const task = this.tasks.get(id);
        if (!task || task.owner !== owner || task.status !== 'generating') break;
        const next = await this.poll(id, owner, this.watchSignal);
        try { this.onUpdate(next); } catch { /* A broken listener must not resubmit. */ }
        if (next.status !== 'generating') break;
        delayMs = Math.min(Math.round(delayMs * 1.5), 15000);
      }
    } catch { /* Plugin dispose aborts the wait. */ }
    finally { this.watchers.delete(id); }
  }
}
