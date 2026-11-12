import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { MediaManager } from '../src/media.js';

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const jpeg = Buffer.from([255,216,255,217]);
const H3 = 'MiniMax-H3-Image';
const H3_FAST = 'MiniMax-H3-Image-Highspeed';

async function fixture(t, handler) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-minimax-h3-test-'));
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections(); await new Promise(r => server.close(r));
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(dir.split(/[\\/]/).pop().startsWith('dsh-minimax-h3-test-'));
    await rm(dir, { recursive: true });
  });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const options = { apiRoot: baseURL, resolveKey: async () => 'SECRET_KEY', dataDir: dir };
  const manager = new MediaManager(options); await manager.init();
  return { manager, options, baseURL };
}
const json = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
function readBody(req) {
  return new Promise(resolve => {
    const parts = []; req.on('data', chunk => parts.push(chunk)); req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
  });
}
const successEvent = (prefix, imageIndex, url) => ({ type: prefix + '.partial_succeeded', image_index: imageIndex, url, size: '2720x1536', output_format: 'jpeg', revised_prompt: 'revised-' + imageIndex });
const sse = events => events.map(event => 'event: ' + event.type + '\r\ndata: ' + JSON.stringify(event) + '\r\n\r\n').join('');

test('H3 文生图：新端点、完整字段、部分失败与响应元数据', async t => {
  let body;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/images/generations') {
      assert.equal(req.headers.authorization, 'Bearer SECRET_KEY');
      body = JSON.parse(await readBody(req));
      json(res, {
        created: 1792308678,
        data: [
          { url: `http://${req.headers.host}/image/0`, size: '2720x1536', revised_prompt: 'enhanced prompt' },
          { error: { code: '1027', message: 'output image failed content safety check' } },
        ],
        output_format: 'jpeg',
        usage: { generated_images: 1, total_tokens: 7254, input_tokens: 3174, output_tokens: 4080 },
        request_id: 'trace-h3-1',
      });
    } else {
      assert.equal(req.headers.authorization, undefined);
      res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(jpeg);
    }
  });
  const result = await f.manager.image({
    model: H3, prompt: '  orange cat  ', size: '2720x1536', n: 2,
    disable_prompt_enhanced: true, output_format: 'jpeg', response_format: 'url',
    stream: false, output_compression: 88, aigc_watermark: true,
  }, 'owner');
  assert.equal(result.status, 'saved');
  assert.equal(body.prompt, 'orange cat');
  assert.deepEqual(body, {
    model: H3, prompt: 'orange cat', n: 2, output_format: 'jpeg', response_format: 'url', stream: false,
    size: '2720x1536', output_compression: 88, disable_prompt_enhanced: true, aigc_watermark: true,
  });
  assert.equal(body.width, undefined);
  assert.equal(result.requestId, 'trace-h3-1');
  assert.equal(result.usage.generated_images, 1);
  assert.deepEqual(result.failures, [{ imageIndex: 1, code: '1027', message: 'output image failed content safety check' }]);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].imageIndex, 0);
  assert.equal(result.files[0].dimensions, '2720x1536');
  assert.equal(result.files[0].revisedPrompt, 'enhanced prompt');
  assert.deepEqual(await readFile(result.files[0].path), jpeg);
  assert.doesNotMatch(JSON.stringify(result), /sources|SECRET_KEY/);
});

test('H3 高速版：面积档、自定义比例与 b64_json 保存', async t => {
  let body;
  const f = await fixture(t, async (req, res) => {
    assert.equal(req.url, '/v1/images/generations'); body = JSON.parse(await readBody(req));
    json(res, {
      data: [{ b64_json: png.toString('base64'), size: '3552x1184', revised_prompt: 'raw prompt' }],
      output_format: 'png', usage: { generated_images: 1 }, request_id: 'trace-h3-b64',
    });
  });
  const result = await f.manager.image({
    model: H3_FAST, prompt: 'wide', aspect_ratio: '300:100', area: '2K',
    output_format: 'png', response_format: 'b64_json',
  }, 'owner');
  assert.equal(result.status, 'saved');
  assert.equal(body.model, H3_FAST); assert.equal(body.aspect_ratio, '300:100'); assert.equal(body.area, '2K');
  assert.equal(body.size, undefined); assert.equal(body.disable_prompt_enhanced, undefined);
  assert.equal(body.output_format, 'png'); assert.equal(body.response_format, 'b64_json');
  assert.equal(result.files[0].mime, 'image/png');
  assert.equal(result.files[0].dimensions, '3552x1184');
  assert.deepEqual(await readFile(result.files[0].path), png);
});

test('H3 图片编辑：16 张混合参考图与 image_edit SSE 前缀', async t => {
  let body;
  const references = [
    'https://cdn.example/cat.jpg', 'mm_file://file-2', 'data:image/webp;base64,' + png.toString('base64'),
    ...Array.from({ length: 13 }, (_, i) => 'https://cdn.example/ref-' + (i + 4) + '.png'),
  ];
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/images/edits') {
      body = JSON.parse(await readBody(req));
      assert.equal(req.headers.accept, 'text/event-stream');
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sse([
        successEvent('image_edit', 0, `http://${req.headers.host}/edited`),
        { type: 'image_edit.completed', usage: { generated_images: 1, input_tokens_details: { image_tokens: 16 } }, request_id: 'trace-edit' },
      ]));
    } else { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(jpeg); }
  });
  const result = await f.manager.editImage({
    model: H3, prompt: 'replace cat', image_url: references[0], image_urls: references.slice(1), stream: true,
  }, 'owner');
  assert.equal(result.status, 'saved');
  assert.equal(body.images.length, 16);
  assert.deepEqual(body.images.map(x => x.image_url), references);
  assert.equal(body.disable_prompt_enhanced, undefined);
  assert.equal(body.stream, true);
  assert.equal(result.requestId, 'trace-edit');
  await assert.rejects(f.manager.editImage({ model: H3, prompt: 'x', image_urls: Array.from({ length: 17 }, (_, i) => 'https://cdn.example/' + i + '.png') }, 'owner'), /16/);
});

test('H3 文生图 SSE：keepalive、跨块、乱序事件按 image_index 保存并保留失败项', async t => {
  let body; const downloads = [];
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/images/generations') {
      body = JSON.parse(await readBody(req));
      const host = req.headers.host;
      const events = [
        successEvent('image_generation', 1, `http://${host}/image/1`),
        { type: 'image_generation.partial_failed', image_index: 2, code: '1027', message: 'blocked' },
        successEvent('image_generation', 0, `http://${host}/image/0`),
        { type: 'image_generation.completed', usage: { generated_images: 2, total_tokens: 13022 }, request_id: 'trace-stream' },
      ];
      const payload = ': keepalive\n\n' + sse(events);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const middle = Math.floor(payload.length / 2);
      res.write(payload.slice(0, middle)); res.end(payload.slice(middle));
    } else { downloads.push(req.url); res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(jpeg); }
  });
  const result = await f.manager.image({ model: H3, prompt: 'three', n: 3, area: '1K', aspect_ratio: '16:9', stream: true }, 'owner');
  assert.equal(result.status, 'saved');
  assert.equal(body.stream, true); assert.equal(body.n, 3); assert.equal(body.response_format, 'url');
  assert.deepEqual(result.files.map(x => x.imageIndex), [0, 1]);
  assert.deepEqual(result.files.map(x => x.revisedPrompt), ['revised-0', 'revised-1']);
  assert.deepEqual(downloads, ['/image/0', '/image/1']);
  assert.deepEqual(result.failures, [{ imageIndex: 2, code: '1027', message: 'blocked' }]);
  assert.equal(result.requestId, 'trace-stream'); assert.equal(result.usage.total_tokens, 13022);
});

test('H3 SSE 整体失败与完成前断流均不自动重试', async t => {
  let mode = 'error', posts = 0;
  const f = await fixture(t, async (req, res) => {
    posts++; assert.equal(req.method, 'POST'); await readBody(req);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (mode === 'error') {
      res.end(sse([
        { type: 'image_generation.partial_failed', image_index: 0, code: '1027', message: 'blocked' },
        { type: 'error', error: { type: 'unprocessable_entity_error', message: 'no image generated (1027)', http_code: '422' }, usage: { generated_images: 0 }, request_id: 'trace-error' },
      ]));
    } else {
      res.end(sse([successEvent('image_generation', 0, `http://${req.headers.host}/never-downloaded`)]));
    }
  });
  const failed = await f.manager.image({ model: H3, prompt: 'x', stream: true }, 'owner');
  assert.equal(failed.status, 'failed'); assert.match(failed.error, /1027/);
  mode = 'truncated';
  const unknown = await f.manager.image({ model: H3, prompt: 'x', stream: true }, 'owner');
  assert.equal(unknown.status, 'submission-unknown');
  assert.equal(posts, 2, '每次测试各提交一次，状态查询和错误处理不能重复提交');
});

test('H3 非流式全部失败：透传 OpenAI 风格错误且不下载、不重试', async t => {
  let posts = 0;
  const f = await fixture(t, async (req, res) => {
    posts++; await readBody(req);
    json(res, {
      type: 'error',
      error: { type: 'unprocessable_entity_error', message: 'no image generated: all images blocked (1027)', http_code: '422' },
      data: [{ error: { code: '1027', message: 'blocked' } }], usage: { generated_images: 0 }, request_id: 'trace-all-failed',
    }, 422);
  });
  const result = await f.manager.image({ model: H3, prompt: 'x' }, 'owner');
  assert.equal(result.status, 'failed'); assert.match(result.error, /1027/);
  assert.equal(result.files.length, 0); assert.equal(posts, 1);
});

test('H3 source_task_ids 引用已保存图片，旧编辑接口仍使用 subject_reference', async t => {
  let generation = 0, editBody, oldEditBody;
  const f = await fixture(t, async (req, res) => {
    if (req.url === '/v1/images/generations') {
      const index = generation++;
      json(res, { data: [{ url: `http://${req.headers.host}/source/${index}`, size: '1024x1024' }], output_format: 'jpeg' });
    } else if (req.url === '/v1/images/edits') {
      editBody = JSON.parse(await readBody(req));
      json(res, { data: [{ url: `http://${req.headers.host}/edited`, size: '1024x1024' }], output_format: 'jpeg' });
    } else if (req.url === '/v1/image_generation') {
      oldEditBody = JSON.parse(await readBody(req));
      json(res, { data: { image_urls: [`http://${req.headers.host}/old-edited`] }, base_resp: { status_code: 0 } });
    } else { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(jpeg); }
  });
  const first = await f.manager.image({ model: H3, prompt: 'one', area: '1K' }, 'owner');
  const second = await f.manager.image({ model: H3, prompt: 'two', area: '1K' }, 'owner');
  const edited = await f.manager.editImage({ model: H3, prompt: 'combine', source_task_ids: [first.id, second.id], area: '1K' }, 'owner');
  assert.equal(edited.status, 'saved');
  assert.equal(editBody.images.length, 2);
  for (const row of editBody.images) assert.match(row.image_url, /^data:image\/jpeg;base64,/);
  const old = await f.manager.editImage({ model: 'image-01', prompt: 'portrait', image_url: 'https://cdn.example/person.png' }, 'owner');
  assert.equal(old.status, 'saved');
  assert.deepEqual(oldEditBody.subject_reference, [{ type: 'character', image_file: 'https://cdn.example/person.png' }]);
});

test('H3 参数边界与新旧字段隔离：非法请求不会发出', async t => {
  let calls = 0;
  const f = await fixture(t, (_req, res) => { calls++; res.end(); });
  const invalid = [
    { model: H3, prompt: 'x', n: 11 },
    { model: H3, prompt: 'x', disable_prompt_enhanced: true },
    { model: H3, prompt: 'x', size: '2720x1536', aspect_ratio: 'auto' },
    { model: H3, prompt: 'x', size: '2720x1536', area: '2K' },
    { model: H3, prompt: 'x', size: '100x100' },
    { model: H3, prompt: 'x', size: '20000x1000' },
    { model: H3, prompt: 'x', aspect_ratio: '301:100' },
    { model: H3, prompt: 'x', aspect_ratio: '4:1' },
    { model: H3, prompt: 'x', stream: true, response_format: 'b64_json' },
    { model: H3, prompt: 'x', response_format: 'b64_json', output_format: 'png', n: 2 },
    { model: H3, prompt: 'x', response_format: 'b64_json', output_format: 'jpeg', n: 5 },
    { model: H3, prompt: 'x', seed: 1 },
    { model: H3, prompt: 'x', prompt_optimizer: true },
    { model: H3, prompt: 'x', output_compression: 101 },
    { model: H3, prompt: '😀'.repeat(32001) },
    { model: 'image-01', prompt: 'x', area: '2K' },
  ];
  for (const args of invalid) await assert.rejects(f.manager.image(args, 'owner'));
  await assert.rejects(f.manager.editImage({ model: H3, prompt: 'x', image_url: 'https://cdn.example/a.png', disable_prompt_enhanced: false }, 'owner'), /始终开启/);
  await assert.rejects(f.manager.editImage({ model: H3, prompt: 'x', image_url: 'data:image/gif;base64,AAAA' }, 'owner'), /data URI/);
  assert.equal(calls, 0);

  const sized = f.manager.h3ImageArgs({ model: H3, width: 1024, height: 1024, disable_prompt_enhanced: true }, false);
  assert.equal(sized.size, '1024x1024'); assert.equal(sized.aspect_ratio, undefined);
  const automatic = f.manager.h3ImageArgs({ model: H3, size: 'auto', aspect_ratio: '3:2', disable_prompt_enhanced: true }, false);
  assert.equal(automatic.size, 'auto'); assert.equal(automatic.aspect_ratio, '3:2');
  const base64 = f.manager.h3ImageArgs({ model: H3, n: 4, area: '2K', response_format: 'b64_json', output_format: 'jpeg' }, false);
  assert.equal(base64.response_format, 'b64_json');
});
