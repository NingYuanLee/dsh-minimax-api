import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { apply } from '../src/index.js';

const GOOD = 'good-key-abc';
const BAD = 'stale-credential-key';

function serveModels() {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization || '', verify: req.headers['x-verify'] || '' });
    const key = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (req.url.startsWith('/v1/models')) {
      if (key !== GOOD) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"bad key"}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'MiniMax-M3.1-Flash', created: 1, object: 'model', owned_by: 'minimax' }] }));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  return { server, seen };
}

function host(tools, discoveries, providers) {
  const provided = new Map();
  return {
    credentials: { resolve: async ref => (ref === 'MINIMAX_API_KEY' ? { value: BAD } : undefined) },
    llm: {
      registerAdapter: () => () => {},
      registerConfigurableProviders: entries => { providers.push(...entries); return () => {}; },
      registerModelDiscovery: (ns, discover) => { discoveries.set(ns, discover); return () => {}; },
    },
    tools: { register: tool => { tools.set(tool.name, tool); return () => {}; } },
    logger: { warn: () => {}, info: () => {} },
    on: () => () => {},
    get: () => undefined,
    fiber: { entry: { options: { id: 'minimax-api' } } },
    plugin(Plugin, ...args) { return new Plugin(this, ...args); },
    reflect: { provide(name, value) { provided.set(name, value); } },
    provided,
  };
}

async function mount(t, connection) {
  const { server, seen } = serveModels();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseURL = 'http://127.0.0.1:' + server.address().port + '/v1';
  const tools = new Map();
  const discoveries = new Map();
  const providers = [];
  const ctx = host(tools, discoveries, providers);
  const snapshot = { connection: { plan: 'custom', baseURL, api: 'openai-completions', apiKeyEnv: 'MINIMAX_API_KEY', timeoutMs: 5000, verify: false, ...connection }, media: {} };
  const configProxy = { connection: { get: () => snapshot.connection }, media: { get: () => ({ dataDir: '' }) }, modelOverrides: { get: () => [] } };
  await apply(ctx, configProxy);
  return { tools, seen, discoveries, providers, baseURL, runtime: ctx.provided.get('minimax-api')?.runtime };
}

test('明文 apiKey 优先于凭据引用，并按真实密钥请求', async t => {
  const { tools, seen } = await mount(t, { apiKey: GOOD });
  const models = tools.get('minimax_models');
  assert.ok(models, '必须注册 minimax_models');
  const result = await models.execute({}, {});
  assert.equal(result.error, null);
  assert.ok(result.models.some(m => m.id === 'MiniMax-M3.1-Flash'));
  assert.ok(seen.length >= 1, '应至少发过一次 /v1/models');
  assert.ok(seen.every(x => x.auth === 'Bearer ' + GOOD), '必须用明文 apiKey 而不是凭据里的旧值：' + JSON.stringify(seen));
});

test('安装后向模型页声明 MiniMax 提供商', async t => {
  const { providers } = await mount(t, { apiKey: GOOD });
  assert.deepEqual(providers, [{
    provider: 'minimax-api', displayName: 'MiniMax', settingsNs: 'minimax-api', settingsPath: [], declared: false,
  }]);
});

test('设置页发现使用草稿地址和一次性密钥，不改用已存凭据', async t => {
  const { discoveries, baseURL, seen, runtime } = await mount(t, { apiKey: BAD });
  const discover = discoveries.get('minimax-api');
  assert.equal(typeof discover, 'function');
  // 后台首轮发现会用已保存的凭据请求一次 /models；等它落定再取基线，免得把它的请求算进本次发现。
  await runtime.ready;
  const before = seen.length;
  const models = await discover({ baseURL, apiKey: GOOD, api: 'openai-completions' });
  assert.ok(models.some(model => model.id === 'MiniMax-M3.1-Flash'));
  assert.equal(models[0].inputModalities.includes('text'), true);
  assert.ok(seen.slice(before).every(hit => hit.auth === 'Bearer ' + GOOD));
});

test('留空 apiKey 时回退到凭据引用', async t => {
  const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'MiniMax-M3.1-Flash', created: 1, object: 'model', owned_by: 'minimax' }] })); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseURL = 'http://127.0.0.1:' + server.address().port + '/v1';
  const seen = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push(init?.headers?.authorization); return orig(url, init); };
  t.after(() => { globalThis.fetch = orig; });
  const tools = new Map();
  const provided = new Map();
  const ctx = {
    credentials: { resolve: async ref => (ref === 'MINIMAX_API_KEY' ? { value: BAD } : undefined) },
    llm: { registerAdapter: () => () => {}, registerConfigurableProviders: () => ({ replace() {} }), registerModelDiscovery: () => () => {} },
    tools: { register: tool => { tools.set(tool.name, tool); return () => {}; } },
    logger: { warn: () => {}, info: () => {} },
    on: () => () => {}, get: () => undefined, fiber: {}, reflect: { provide(name, value) { provided.set(name, value); } },
  };
  await apply(ctx, { connection: { get: () => ({ plan: 'custom', baseURL, api: 'openai-completions', apiKeyEnv: 'MINIMAX_API_KEY', timeoutMs: 5000, verify: false }) }, media: { get: () => ({ dataDir: '' }) }, modelOverrides: { get: () => [] } });
  // 激活不再等待首轮发现：显式等它落定，再断言回退用的是凭据里的密钥。
  await provided.get('minimax-api').runtime.ready;
  assert.ok(seen.includes('Bearer ' + BAD), '应回退到凭据值：' + JSON.stringify(seen));
});

test('首轮发现不阻塞激活：apply 先返回，ready 落定后才填清单', async t => {
  // 用一个手动放行的服务器卡住 /v1/models：apply 若还在等首轮发现，这个测试会一直挂到超时。
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = createServer(async (req, res) => {
    await gate;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'MiniMax-M3.1-Flash', created: 1, object: 'model', owned_by: 'minimax' }] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const baseURL = 'http://127.0.0.1:' + server.address().port + '/v1';
  const provided = new Map();
  const ctx = {
    credentials: { resolve: async () => ({ value: 'test-key' }) },
    llm: { registerAdapter: () => () => {}, registerConfigurableProviders: () => ({ replace() {} }), registerModelDiscovery: () => () => {} },
    tools: { register: () => () => {} },
    logger: { warn: () => {}, info: () => {} },
    on: () => () => {}, get: () => undefined, fiber: {}, reflect: { provide(name, value) { provided.set(name, value); } },
  };
  await apply(ctx, { connection: { get: () => ({ plan: 'custom', baseURL, api: 'openai-completions', apiKeyEnv: 'MINIMAX_API_KEY', timeoutMs: 5000, verify: false }) }, media: { get: () => ({ dataDir: '' }) }, modelOverrides: { get: () => [] } });
  const runtime = provided.get('minimax-api').runtime;
  assert.ok(runtime, '激活后应能拿到运行时');
  assert.equal(runtime.catalog().length, 0, 'apply 返回时首轮发现应仍在后台进行');
  release();
  await runtime.ready;
  assert.ok(runtime.catalog().some(model => model.id === 'MiniMax-M3.1-Flash'));
});

test('密钥自检：错的密钥报认证失败，对的密钥通过', async t => {
  const { tools } = await mount(t, { apiKey: BAD, verify: true });
  const models = tools.get('minimax_models');
  const bad = await models.execute({ verify_key: true }, {});
  assert.equal(bad.verify.verified, false);
  assert.match(String(bad.verify.error), /认证被拒绝|密钥自检失败/);
});
