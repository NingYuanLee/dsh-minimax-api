import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { MediaManager } from '../src/media.js';

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const mp4 = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
// 一段可被文件头识别成 mp3 的字节：ID3 头 + 长度字节。
const mp3 = Buffer.from([0x49,0x44,0x33,0x04,0x00]);
const hexOf = bytes => bytes.toString('hex');

async function fixture(t, handler) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-minimax-test-'));
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(dir.split(/[\\/]/).pop().startsWith('dsh-minimax-test-')); await rm(dir, { recursive: true }); });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const options = { apiRoot: baseURL, resolveKey: async () => 'SECRET_KEY', dataDir: dir };
  const manager = new MediaManager(options); await manager.init();
  return { manager, options, baseURL };
}
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
function readBody(req) {
  return new Promise(resolve => {
    const parts = [];
    req.on('data', chunk => parts.push(chunk));
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
  });
}

test('生图：URL 归一化后落盘，密钥与签名地址不外泄，跨会话不可见', async t => {
  let calls = 0, downloaded = 0, body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/image_generation') {
      calls++; assert.equal(req.headers.authorization, 'Bearer SECRET_KEY');
      body = JSON.parse(await readBody(req));
      json(res, { id: 'req-1', data: { image_urls: [`http://${req.headers.host}/image?signature=PRIVATE`] }, metadata: { success_count: 1, failed_count: 0 }, base_resp: { status_code: 0, status_msg: 'success' } });
    } else { downloaded++; assert.equal(req.headers.authorization, undefined); res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  const result = await f.manager.image({ model: 'image-01', prompt: 'blue circle', aspect_ratio: '16:9', n: 2 }, 'owner-a');
  assert.equal(result.status, 'saved'); assert.equal(calls, 1); assert.equal(downloaded, 1);
  assert.equal(body.model, 'image-01'); assert.equal(body.prompt, 'blue circle');
  assert.equal(body.aspect_ratio, '16:9'); assert.equal(body.n, 2);
  assert.deepEqual(await readFile(result.files[0].path), png);
  assert.equal(result.files[0].mime, 'image/png');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SECRET_KEY|signature|sources/);
  assert.throws(() => f.manager.get(result.id, 'other-owner'));
  assert.deepEqual(f.manager.list('other-owner'), []);
});

test('生图：base64 结果也能落盘', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url === '/v1/image_generation') json(res, { id: 'r', data: { image_base64: [png.toString('base64')] }, base_resp: { status_code: 0 } });
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  const result = await f.manager.image({ model: 'image-01', prompt: 'x' }, 's');
  assert.equal(result.status, 'saved'); assert.equal(result.files[0].mime, 'image/png');
});

test('视频 v1：创建→查询→取文件→下载保存完整走通，只提交一次', async t => {
  let posts = 0, queries = 0, retrieves = 0, body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/video_generation') {
      posts++; body = JSON.parse(await readBody(req));
      json(res, { task_id: 'task-1', base_resp: { status_code: 0 } });
    } else if (req.url === '/v1/query/video_generation?task_id=task-1') {
      queries++; json(res, { task_id: 'task-1', status: 'Success', file_id: 'file-1', video_width: 1920, video_height: 1080, base_resp: { status_code: 0 } });
    } else if (req.url === '/v1/files/retrieve?file_id=file-1') {
      retrieves++; json(res, { file: { file_id: 'file-1', filename: 'out.mp4', download_url: `http://${req.headers.host}/video` }, base_resp: { status_code: 0 } });
    } else { assert.equal(req.headers.authorization, undefined); res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  const submitted = await f.manager.video({ model: 'MiniMax-Hailuo-02', prompt: 'motion', duration: 6, resolution: '1080P' }, 's');
  assert.equal(submitted.status, 'generating'); assert.equal(submitted.remoteId, 'task-1');
  assert.equal(body.duration, 6); assert.equal(body.resolution, '1080P');
  const done = await f.manager.poll(submitted.id, 's');
  assert.equal(done.status, 'saved'); assert.equal(done.fileId, 'file-1');
  assert.equal(posts, 1); assert.equal(queries, 1); assert.equal(retrieves, 1);
  assert.deepEqual(await readFile(done.files[0].path), mp4);
});

test('视频 v2：H3 系走 /v2，成片地址直接在 task.content.url', async t => {
  const seen = [];
  const f = await fixture(t, async (req, res) => {
    seen.push(req.url);
    if (req.url === '/v2/video_generation') { const body = JSON.parse(await readBody(req)); assert.equal(body.model, 'MiniMax-H3'); assert.equal(body.resolution, '768P'); assert.equal(body.duration, 6); assert.equal(body.content[0].type, 'text'); json(res, { task_id: 'h3-1' }); }
    else if (req.url === '/v2/query/video_generation/h3-1') json(res, { task: { id: 'h3-1', status: 'succeeded', content: { url: `http://${req.headers.host}/video` } } });
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  const submitted = await f.manager.video({ model: 'MiniMax-H3', prompt: 'scene', duration: 6, resolution: '768P', ratio: '16:9' }, 's');
  assert.equal(submitted.status, 'generating');
  const done = await f.manager.poll(submitted.id, 's');
  assert.equal(done.status, 'saved');
  assert.deepEqual(seen.slice(0, 2), ['/v2/video_generation', '/v2/query/video_generation/h3-1']);
  assert.ok(seen.includes('/video'));
});

test('视频 v2：首帧图片走 content 的 image_url', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v2/video_generation') { body = JSON.parse(await readBody(req)); json(res, { task_id: 'h3-2' }); }
    else if (req.url === '/v2/query/video_generation/h3-2') json(res, { task: { id: 'h3-2', status: 'running' } });
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  await f.manager.video({ model: 'MiniMax-H3', prompt: 'pan', image_url: 'https://cdn.example/still.png' }, 's');
  assert.equal(body.content[1].type, 'image_url');
  assert.equal(body.content[1].image_url.url, 'https://cdn.example/still.png');
  assert.equal(body.content[1].role, 'first_frame');
});

test('语音：hex 音频解码后落盘', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    body = JSON.parse(await readBody(req));
    json(res, { data: { audio: hexOf(mp3), status: 2 }, extra_info: { audio_size: mp3.length, audio_format: 'mp3' }, base_resp: { status_code: 0 } });
  });
  const result = await f.manager.speech({ model: 'speech-02-hd', text: '你好', voice_id: 'Calm_Woman', speed: 1.1, pitch: -2 }, 's');
  assert.equal(result.status, 'saved'); assert.equal(result.files[0].mime, 'audio/mpeg');
  assert.deepEqual(await readFile(result.files[0].path), mp3);
  assert.equal(body.model, 'speech-02-hd'); assert.equal(body.text, '你好');
  assert.equal(body.voice_setting.voice_id, 'Calm_Woman'); assert.equal(body.voice_setting.speed, 1.1); assert.equal(body.voice_setting.pitch, -2);
  assert.equal(body.audio_setting.format, 'mp3');
});

test('音乐：hex 音频解码后落盘', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    body = JSON.parse(await readBody(req));
    json(res, { data: { audio: hexOf(mp3), status: 2 }, extra_info: { music_size: mp3.length, audio_format: 'mp3' }, base_resp: { status_code: 0 } });
  });
  const result = await f.manager.music({ model: 'music-3.0', prompt: 'indie folk', lyrics: '[verse]\nhello' }, 's');
  assert.equal(result.status, 'saved'); assert.equal(result.files[0].mime, 'audio/mpeg');
  assert.deepEqual(await readFile(result.files[0].path), mp3);
  assert.equal(body.lyrics, '[verse]\nhello'); assert.equal(body.output_format, 'hex');
});

test('转写：multipart 提交音频并返回文本', async t => {
  let contentType = '', raw = '';
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/speech_to_text') {
      contentType = req.headers['content-type'] || ''; raw = await readBody(req);
      json(res, { text: '这是一段话', duration: 12.5, trace_id: 'tr-1' });
    } else { res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end(mp3); }
  });
  const result = await f.manager.transcribe({ audio_url: f.baseURL + '/audio', model: 'asr-1.0' }, 's');
  assert.equal(result.text, '这是一段话'); assert.equal(result.duration, 12.5);
  assert.match(contentType, /^multipart\/form-data/);
  assert.match(raw, /name="model"/); assert.match(raw, /asr-1\.0/); assert.match(raw, /name="file"/);
});

test('下载失败可重试，且不重新生成', async t => {
  let creates = 0, gets = 0;
  const f = await fixture(t, (req, res) => {
    if (req.url === '/v1/image_generation') { creates++; json(res, { data: { image_urls: [`http://${req.headers.host}/image`] }, base_resp: { status_code: 0 } }); }
    else if (++gets === 1) { res.writeHead(503); res.end(); }
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  const failed = await f.manager.image({ model: 'image-01', prompt: 'hello' }, 's');
  assert.equal(failed.status, 'download-failed');
  const restart = new MediaManager(f.options); await restart.init();
  const recovered = await restart.retryDownload(failed.id, 's');
  assert.equal(recovered.status, 'saved'); assert.equal(creates, 1); assert.equal(gets, 2);
});

test('提交结果未知时保留任务，不自动重新生成', async t => {
  let dispatches = 0;
  const f = await fixture(t, (_req, res) => res.end());
  const manager = new MediaManager({ ...f.options, fetchImpl: async () => { dispatches++; throw new Error('secret URL and key'); } });
  await manager.init();
  const result = await manager.image({ model: 'image-01', prompt: 'hello' }, 's');
  assert.equal(result.status, 'submission-unknown'); assert.equal(dispatches, 1);
  assert.doesNotMatch(JSON.stringify(result), /secret URL/);
  await assert.rejects(manager.retryDownload(result.id, 's'));
  assert.equal(dispatches, 1);
  const restart = new MediaManager(f.options); await restart.init();
  assert.equal(restart.get(result.id, 's').status, 'submission-unknown');
});

test('上游业务错误被当成失败并保留可读原因', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url === '/v1/image_generation') json(res, { base_resp: { status_code: 1008, status_msg: 'insufficient balance' } });
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  const result = await f.manager.image({ model: 'image-01', prompt: 'x' }, 's');
  assert.equal(result.status, 'failed');
  assert.match(result.error, /1008/); assert.match(result.error, /insufficient balance/);
});

test('拒绝 HTML 媒体、不安全协议与超大结果', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url === '/v1/image_generation') json(res, { data: { image_urls: [`http://${req.headers.host}/image`] }, base_resp: { status_code: 0 } });
    else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>not an image</html>'); }
  });
  const result = await f.manager.image({ model: 'image-01', prompt: 'x' }, 's');
  assert.equal(result.status, 'download-failed'); assert.equal(result.files.length, 0);
  for (const url of ['file:///secret', 'http://example.com/a', 'https://key@example.com/a', 'http://127.0.0.1:1/a']) {
    assert.throws(() => f.manager.validateURL(url));
  }
  const smaller = new MediaManager({ ...f.options, maxDownloadBytes: 4 }); await smaller.init();
  const tooBig = await smaller.retryDownload(result.id, 's');
  assert.equal(tooBig.status, 'download-failed');
});

test('参数越界时不发出请求', async t => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => { calls++; res.end(); });
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: '' }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: 'x', n: 10 }, 's'));
  await assert.rejects(f.manager.video({ model: 'MiniMax-Hailuo-02', prompt: 'x', duration: 8 }, 's'));
  await assert.rejects(f.manager.video({ model: 'MiniMax-Hailuo-02', prompt: 'x', duration: 10, resolution: '1080P' }, 's'));
  await assert.rejects(f.manager.video({ model: 'MiniMax-H3', prompt: 'x', duration: 3 }, 's'));
  assert.equal(calls, 0);
});

test('后台轮询在结果就绪后保存视频，不会重复提交', async t => {
  let posts = 0, queries = 0;
  const f = await fixture(t, (req, res) => {
    if (req.url === '/v1/video_generation') { posts++; json(res, { task_id: 'task-w' }); }
    else if (req.url === '/v1/query/video_generation?task_id=task-w') { queries++; json(res, { task_id: 'task-w', status: queries === 1 ? 'Processing' : 'Success', file_id: 'file-w', base_resp: { status_code: 0 } }); }
    else if (req.url === '/v1/files/retrieve?file_id=file-w') json(res, { file: { file_id: 'file-w', download_url: `http://${req.headers.host}/video` } });
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  const manager = new MediaManager({ ...f.options, watchDelayMs: 20 });
  await manager.init();
  const updates = [];
  manager.startWatchers(new AbortController().signal, task => updates.push(task.status));
  const submitted = await manager.video({ model: 'MiniMax-Hailuo-02', prompt: 'motion' }, 's');
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && !updates.includes('saved')) await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(manager.get(submitted.id, 's').status, 'saved');
  assert.equal(posts, 1);
  assert.ok(updates.includes('saved'));
});

test('生图：画风仅 image-01-live 可用，参数合法才下发', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/image_generation') { body = JSON.parse(await readBody(req)); json(res, { data: { image_urls: [`http://${req.headers.host}/image`] }, base_resp: { status_code: 0 } }); }
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  const ok = await f.manager.image({ model: 'image-01-live', prompt: 'x', style_type: '漫画', style_weight: 0.5 }, 's');
  assert.equal(ok.status, 'saved');
  assert.deepEqual(body.style, { style_type: '漫画', style_weight: 0.5 });
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: 'x', style_type: '漫画' }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01-live', prompt: 'x', style_type: '赛博朋克' }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01-live', prompt: 'x', style_type: '漫画', style_weight: 0 }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01-live', prompt: 'x', style_type: '漫画', style_weight: 1.5 }, 's'));
});

test('生图：21:9 仅 image-01；width/height 成对、8 的倍数且不下发 aspect_ratio', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/image_generation') { body = JSON.parse(await readBody(req)); json(res, { data: { image_urls: [`http://${req.headers.host}/image`] }, base_resp: { status_code: 0 } }); }
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  await assert.rejects(f.manager.image({ model: 'image-01-live', prompt: 'x', aspect_ratio: '21:9' }, 's'));
  const wide = await f.manager.image({ model: 'image-01', prompt: 'x', aspect_ratio: '21:9' }, 's');
  assert.equal(wide.status, 'saved'); assert.equal(body.aspect_ratio, '21:9');
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: 'x', width: 1024 }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: 'x', height: 1024 }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: 'x', width: 256, height: 256 }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01', prompt: 'x', width: 1024, height: 770 }, 's'));
  await assert.rejects(f.manager.image({ model: 'image-01-live', prompt: 'x', width: 1024, height: 1024 }, 's'));
  const sized = await f.manager.image({ model: 'image-01', prompt: 'x', width: 1024, height: 768, aspect_ratio: '16:9' }, 's');
  assert.equal(sized.status, 'saved');
  assert.equal(body.width, 1024); assert.equal(body.height, 768); assert.equal(body.aspect_ratio, undefined);
});

test('生图：aigc_watermark 透传', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/image_generation') { body = JSON.parse(await readBody(req)); json(res, { data: { image_urls: [`http://${req.headers.host}/image`] }, base_resp: { status_code: 0 } }); }
    else { res.writeHead(200, { 'content-type': 'image/png' }); res.end(png); }
  });
  await f.manager.image({ model: 'image-01', prompt: 'x', aigc_watermark: true }, 's');
  assert.equal(body.aigc_watermark, true);
});

test('v2 视频：文生视频不能用 adaptive，带首帧时固定 adaptive', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v2/video_generation') { body = JSON.parse(await readBody(req)); json(res, { task_id: 'h3-r' }); }
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  await assert.rejects(f.manager.video({ model: 'MiniMax-H3', prompt: 'x', ratio: 'adaptive' }, 's'));
  await f.manager.video({ model: 'MiniMax-H3', prompt: 'x', image_url: 'https://cdn.example/still.png' }, 's');
  assert.equal(body.ratio, 'adaptive');
  assert.equal(body.content[1].role, 'first_frame');
});

test('v2 视频：H3-Highspeed / H3-Lite 支持 480P、不支持 2K；MiniMax-H3 不支持 480P', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url === '/v2/video_generation') json(res, { task_id: 'h3-s' });
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  for (const model of ['MiniMax-H3-Highspeed', 'MiniMax-H3-Lite']) {
    await assert.rejects(f.manager.video({ model, prompt: 'x', resolution: '2K' }, 's'));
    const ok = await f.manager.video({ model, prompt: 'x', resolution: '480P' }, 's');
    assert.equal(ok.status, 'generating');
  }
  await assert.rejects(f.manager.video({ model: 'MiniMax-H3', prompt: 'x', resolution: '480P' }, 's'));
  const h3 = await f.manager.video({ model: 'MiniMax-H3', prompt: 'x', resolution: '2K' }, 's');
  assert.equal(h3.status, 'generating');
});

test('v2 视频：提示词扩展模式仅 H3-Max 支持', async t => {
  let body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v2/video_generation') { body = JSON.parse(await readBody(req)); json(res, { task_id: 'h3-e' }); }
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  await assert.rejects(f.manager.video({ model: 'MiniMax-H3', prompt: 'x', prompt_expansion_mode: 'quality' }, 's'));
  await assert.rejects(f.manager.video({ model: 'MiniMax-H3-Max', prompt: 'x', prompt_expansion_mode: 'balance' }, 's'));
  await f.manager.video({ model: 'MiniMax-H3-Max', prompt: 'x', prompt_expansion_mode: 'quality' }, 's');
  assert.deepEqual(body.extra, { prompt_expansion_mode: 'quality' });
});

test('视频 prompt 长度：v2 到 7000，v1 到 2000', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url.endsWith('/video_generation')) json(res, { task_id: 't' });
    else { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(mp4); }
  });
  const ok = await f.manager.video({ model: 'MiniMax-H3', prompt: 'x'.repeat(7000) }, 's');
  assert.equal(ok.status, 'generating');
  await assert.rejects(f.manager.video({ model: 'MiniMax-H3', prompt: 'x'.repeat(7001) }, 's'));
  await assert.rejects(f.manager.video({ model: 'MiniMax-Hailuo-02', prompt: 'x'.repeat(2001) }, 's'));
});

test('音色查询：三种来源合并返回，base_resp 非 0 时抛可读错误', async t => {
  let calls = 0, body = null, fail = false;
  const f = await fixture(t, async (req, res) => {
    if (req.url !== '/v1/get_voice') { res.writeHead(404); res.end('{}'); return; }
    calls++; body = JSON.parse(await readBody(req));
    if (fail) { json(res, { base_resp: { status_code: 1004, status_msg: '鉴权失败' } }); return; }
    json(res, {
      system_voice: [{ voice_id: 'Chinese (Mandarin)_News_Anchor', voice_name: '新闻女声', description: ['专业播音腔'] }],
      voice_cloning: [{ voice_id: 'clone-1', description: [], created_time: '2025-08-20' }],
      voice_generation: [{ voice_id: 'ttv-1', description: [], created_time: '2025-08-21' }],
      base_resp: { status_code: 0, status_msg: 'success' },
    });
  });
  const all = await f.manager.voices({ voice_type: 'all' }, 'owner-a');
  assert.equal(calls, 1);
  assert.equal(body.voice_type, 'all');
  assert.deepEqual(all.counts, { system: 1, cloning: 1, generation: 1 });
  assert.deepEqual(all.voices.map(v => v.source).sort(), ['cloning', 'generation', 'system']);
  assert.ok(all.voices.some(v => v.voice_id === 'Chinese (Mandarin)_News_Anchor' && v.voice_name === '新闻女声'));
  await f.manager.voices(undefined, 'owner-a');
  assert.equal(body.voice_type, 'system', '默认只查系统音色');
  fail = true;
  await assert.rejects(f.manager.voices({ voice_type: 'system' }, 'owner-a'), /1004|鉴权失败/);
});

test('异步长文本语音：创建→查询→文件接口→下载保存，只提交一次', async t => {
  let posts = 0, queries = 0, retrieves = 0, downloads = 0, body = null;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/t2a_async_v2') {
      posts++; body = JSON.parse(await readBody(req));
      json(res, { task_id: 95157322, file_id: 95157323, usage_characters: 12, base_resp: { status_code: 0, status_msg: 'success' } });
    } else if (req.url === '/v1/query/t2a_async_query_v2?task_id=95157322') {
      queries++;
      if (queries < 2) json(res, { task_id: 95157322, status: 'Processing', base_resp: { status_code: 0 } });
      else json(res, { task_id: 95157322, status: 'Success', file_id: 95157399, base_resp: { status_code: 0 } });
    } else if (req.url === '/v1/files/retrieve?file_id=95157399') {
      retrieves++; json(res, { file: { file_id: 95157399, download_url: `http://${req.headers.host}/audio/out.mp3`, filename: 'out.mp3' }, base_resp: { status_code: 0 } });
    } else if (req.url === '/audio/out.mp3') {
      downloads++; assert.equal(req.headers.authorization, undefined);
      res.writeHead(200, { 'content-type': 'audio/mpeg' }); res.end(mp3);
    } else { res.writeHead(404); res.end('{}'); }
  });
  const created = await f.manager.speakLong({ model: 'speech-2.8-hd', text: 'x'.repeat(20000), voice_id: 'Chinese (Mandarin)_News_Anchor', format: 'mp3' }, 'owner-a');
  assert.equal(created.status, 'generating');
  assert.equal(created.remoteId, '95157322');
  assert.equal(posts, 1, '长文本任务只提交一次');
  assert.equal(body.model, 'speech-2.8-hd');
  assert.equal(body.voice_setting.voice_id, 'Chinese (Mandarin)_News_Anchor');
  assert.equal(body.audio_setting.audio_sample_rate, 32000, '异步接口用 audio_sample_rate');
  assert.equal(body.audio_setting.sample_rate, undefined, '不能下发同步接口的 sample_rate');
  assert.equal(body.audio_setting.channel, 2, '异步接口默认双声道');

  const first = await f.manager.poll(created.id, 'owner-a');
  assert.equal(first.status, 'generating');
  const second = await f.manager.poll(created.id, 'owner-a');
  assert.equal(second.status, 'saved');
  assert.equal(retrieves, 1); assert.equal(downloads, 1); assert.equal(posts, 1, '查询与下载都不会重复提交');
  assert.equal(second.files[0].mime, 'audio/mpeg');
  assert.deepEqual(await readFile(second.files[0].path), mp3);
});

test('异步长文本语音：失败与过期都给出可读原因，且不会重新提交', async t => {
  let status = 'Failed', posts = 0;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/t2a_async_v2') { posts++; json(res, { task_id: 42, base_resp: { status_code: 0 } }); }
    else if (req.url.startsWith('/v1/query/t2a_async_query_v2')) json(res, { task_id: 42, status, base_resp: { status_code: 0 } });
    else { res.writeHead(404); res.end('{}'); }
  });
  const created = await f.manager.speakLong({ model: 'speech-2.8-hd', text: 'hello' }, 'owner-a');
  const failed = await f.manager.poll(created.id, 'owner-a');
  assert.equal(failed.status, 'failed');
  assert.match(String(failed.error), /失败|过期/);
  const again = await f.manager.poll(created.id, 'owner-a');
  assert.equal(again.status, 'failed', '失败任务再查询仍是快照');
  assert.equal(posts, 1, '失败后不会重新提交');
});
