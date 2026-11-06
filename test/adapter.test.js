import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { LlmAdapter, createUserMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { buildChatAdapter, createAdapterScope } from '../src/adapter.js';

test('official adapter preserves tool call roundtrip and credential reference', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let data = ''; for await (const part of req) data += part;
    const body = JSON.parse(data); requests.push({ path: req.url, auth: req.headers.authorization, body });
    const final = body.messages.some(m => m.role === 'tool');
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const common = { id: 'chat-test', object: 'chat.completion.chunk', created: 1, model: 'MiniMax-M3.1-Flash' };
    const chunks = final ? [
      { delta: { role: 'assistant', content: 'ROUNDTRIP_OK' }, finish_reason: null },
      { delta: {}, finish_reason: 'stop' },
    ] : [
      { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_demo', type: 'function', function: { name: 'probe', arguments: '{}' } }] }, finish_reason: null },
      { delta: {}, finish_reason: 'tool_calls' },
    ];
    for (const choice of chunks) res.write('data: ' + JSON.stringify({ ...common, choices: [{ index: 0, ...choice }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const ctx = { fiber: {}, logger: console, get: name => name === 'credentials' ? { resolve: async ref => ref === 'TEST_MINIMAX_KEY' ? { value: 'test-secret' } : undefined, readRecord: async () => undefined, listRecords: async () => [] } : undefined };
  const adapter = buildChatAdapter(ctx, { api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnv: 'TEST_MINIMAX_KEY', models: [{ id: 'MiniMax-M3.1-Flash', contextWindow: 1000000, maxTokens: 131072 }] });
  // The capture must yield the official adapter, not a look-alike: this is the
  // assertion that turns a dsh registration change into a failing test.
  assert.ok(adapter instanceof LlmAdapter, 'captured adapter must be an official LlmAdapter instance');
  assert.equal(adapter.providerInfo('minimax-byapi').id, 'minimax-byapi');
  const catalog = await adapter.listModels('minimax-byapi');
  assert.deepEqual(catalog.map(x => x.id), ['MiniMax-M3.1-Flash']);
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Use probe then reply.' }] });
  const base = { provider: 'minimax-byapi', model: 'MiniMax-M3.1-Flash', messages: [user], tools: [{ name: 'probe', description: 'A test tool', parameters: { type: 'object', properties: {}, required: [] } }], maxTokens: 64 };
  const first = []; for await (const chunk of adapter.stream(base)) first.push(chunk);
  assert.match(JSON.stringify(first), /call_demo/);
  const assistant = createAssistantMessage({ source: { provider: 'minimax-byapi', model: 'MiniMax-M3.1-Flash' }, content: [{ type: 'tool-call', id: 'call_demo', name: 'probe', arguments: '{}' }] });
  const tool = createToolResultMessage({ callId: 'call_demo', content: [{ type: 'text', text: 'probe succeeded' }], isError: false });
  const second = []; for await (const chunk of adapter.stream({ ...base, messages: [user, assistant, tool] })) second.push(chunk);
  assert.match(JSON.stringify(second), /ROUNDTRIP_OK/);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => r.auth === 'Bearer test-secret' && r.path === '/v1/chat/completions'));
  assert.equal(requests[1].body.messages.find(x => x.role === 'tool').tool_call_id, 'call_demo');
});

test('文本参数下发：思考档位走 reasoning_effort，输出上限走 max_completion_tokens', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let data = ''; for await (const part of req) data += part;
    requests.push(JSON.parse(data));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const common = { id: 'chat-params', object: 'chat.completion.chunk', created: 1, model: 'MiniMax-M3.1-Flash' };
    res.write('data: ' + JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] }) + '\n\n');
    res.write('data: ' + JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const credentials = { resolve: async ref => ref === 'TEST_MINIMAX_KEY' ? { value: 'test-secret' } : undefined, readRecord: async () => undefined, listRecords: async () => [] };
  const ctx = { fiber: {}, logger: console, get: name => name === 'credentials' ? credentials : undefined };
  const adapter = buildChatAdapter(ctx, {
    api: 'openai-completions',
    baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    apiKeyEnv: 'TEST_MINIMAX_KEY',
    models: [{
      id: 'MiniMax-M3.1-Flash', contextWindow: 1000000, maxTokens: 131072,
      reasoningEfforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    }],
    compat: { thinkingFormat: 'openai', maxTokensField: 'max_completion_tokens' },
  });
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] });
  const stream = async options => { const chunks = []; for await (const chunk of adapter.stream({ provider: 'minimax-byapi', model: 'MiniMax-M3.1-Flash', messages: [user], maxTokens: 4096, ...options })) chunks.push(chunk); return chunks; };

  await stream({ reasoningEffort: 'max' });
  const body = requests.at(-1);
  assert.equal(body.reasoning_effort, 'max', 'M3.1-Flash 的思考档位必须作为 reasoning_effort 下发');
  assert.equal(body.max_completion_tokens, 4096, '输出上限必须用 max_completion_tokens（max_tokens 已废弃）');
  assert.equal(body.max_tokens, undefined, '不应再下发已废弃的 max_tokens');
  assert.equal(body.thinking, undefined, 'M3.1-Flash 强制开启思考，不需要下发 thinking 开关');

  await stream({ reasoningEffort: 'low' });
  assert.equal(requests.at(-1).reasoning_effort, 'low', '档位可切换');

  await stream({});
  assert.equal(requests.at(-1).reasoning_effort, undefined, '不选档位时不下发 reasoning_effort，由服务端取默认 max');
});

test('Anthropic 兼容通道：只发 thinking adaptive + output_config.effort，不发 budget_tokens', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let data = ''; for await (const part of req) data += part;
    requests.push({ path: req.url, auth: req.headers.authorization, apiKey: req.headers['x-api-key'], body: JSON.parse(data) });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (event, payload) => res.write('event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n');
    send('message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', content: [], model: 'MiniMax-M3.1-Flash', stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } });
    send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } });
    send('content_block_stop', { type: 'content_block_stop', index: 0 });
    send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
    send('message_stop', { type: 'message_stop' });
    res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const credentials = { resolve: async ref => ref === 'TEST_MINIMAX_KEY' ? { value: 'test-secret' } : undefined, readRecord: async () => undefined, listRecords: async () => [] };
  const ctx = { fiber: {}, logger: console, get: name => name === 'credentials' ? credentials : undefined };
  const adapter = buildChatAdapter(ctx, {
    api: 'anthropic-messages',
    baseURL: `http://127.0.0.1:${server.address().port}/anthropic`,
    apiKeyEnv: 'TEST_MINIMAX_KEY',
    models: [{
      id: 'MiniMax-M3.1-Flash', contextWindow: 1000000, maxTokens: 131072,
      reasoningEfforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    }],
    compat: { forceAdaptiveThinking: true },
  });
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] });
  const chunks = [];
  for await (const chunk of adapter.stream({ provider: 'minimax-byapi', model: 'MiniMax-M3.1-Flash', messages: [user], maxTokens: 4096, reasoningEffort: 'max' })) chunks.push(chunk);
  assert.equal(requests.length, 1);
  const { path, body, auth, apiKey } = requests[0];
  // Anthropic SDK 会附加 ?beta=true；端点路径本身必须是 MiniMax 的 /anthropic/v1/messages。
  assert.equal(new URL(path, 'http://127.0.0.1').pathname, '/anthropic/v1/messages', '订阅 Key 路线必须命中 MiniMax 的 Anthropic 端点');
  // MiniMax 的 Anthropic 兼容通道同时接受 Authorization: Bearer 与 x-api-key；SDK 默认用后者。
  assert.ok(auth === 'Bearer test-secret' || apiKey === 'test-secret', '密钥必须随请求送达（Bearer 或 x-api-key）');
  assert.equal(body.thinking?.type, 'adaptive', 'MiniMax 只接受 adaptive，不能是 enabled');
  assert.equal(body.thinking?.budget_tokens, undefined, '不能下发 budget_tokens');
  assert.equal(body.output_config?.effort, 'max', '思考深度走 output_config.effort');
  assert.equal(body.max_tokens, 4096, 'Anthropic 通道的输出上限走 max_tokens');
  assert.match(JSON.stringify(chunks), /OK/);
});

test('Responses 不带 Chat Completions 的兼容字段，否则模型列表是空的', async () => {
  // 0.2.1 resolves the route credential before listing models; supply one so the
  // assertion still exercises the compat gate instead of the missing-credential path.
  const credentials = { resolve: async ref => ref === 'TEST_MINIMAX_KEY' ? { value: 'test-secret' } : undefined, readRecord: async () => undefined, listRecords: async () => [] };
  const ctx = { fiber: {}, logger: console, get: name => name === 'credentials' ? credentials : undefined };
  const models = [{ id: 'MiniMax-M3.1-Flash', contextWindow: 1000000, maxTokens: 131072, input: ['text'] }];
  const dropped = buildChatAdapter(ctx, { api: 'openai-responses', baseURL: 'http://127.0.0.1:8317/v1', apiKeyEnv: 'TEST_MINIMAX_KEY', models, compat: { thinkingFormat: 'openai', maxTokensField: 'max_completion_tokens' } });
  assert.deepEqual(await dropped.listModels('minimax-byapi'), []);
  const kept = buildChatAdapter(ctx, { api: 'openai-responses', baseURL: 'http://127.0.0.1:8317/v1', apiKeyEnv: 'TEST_MINIMAX_KEY', models, compat: {} });
  assert.deepEqual((await kept.listModels('minimax-byapi')).map(model => model.id), ['MiniMax-M3.1-Flash']);
});

test('作用域必须能应答宿主的请求头水位线，否则请求阶段才会失败', () => {
  // 官方适配器在每次请求前都会走宿主的请求头接缝。作用域答不上来时，
  // 请求会以「header preparation failed」告终，而不是在注册时暴露原因。
  const calls = [];
  const ctx = {
    fiber: {}, logger: console, get: () => undefined,
    waterfall: (name, ...args) => { calls.push({ name, args }); return args[args.length - 1](); },
  };
  const scope = createAdapterScope(ctx, () => {});
  const headers = new Headers({ 'x-probe': 'yes' });
  const result = scope.waterfall('llm-pi-ai/request-headers', { provider: 'minimax-byapi' }, headers, () => headers);
  assert.equal(calls.length, 1, '水位线必须交给宿主，而不是被作用域吞掉');
  assert.equal(calls[0].name, 'llm-pi-ai/request-headers');
  assert.equal(result.get('x-probe'), 'yes');
});

test('宿主没有请求头水位线时，作用域仍要返回交给它的标头', () => {
  const scope = createAdapterScope({ fiber: {}, logger: console, get: () => undefined }, () => {});
  const headers = new Headers({ 'x-probe': 'yes' });
  const result = scope.waterfall('llm-pi-ai/request-headers', { provider: 'minimax-byapi' }, headers, () => headers);
  assert.equal(result, headers);
});

test('作用域要把未声明的宿主成员转发出去，官方适配器新增的接缝才不会再次失效', () => {
  const ctx = { fiber: {}, logger: console, get: () => undefined, futureSeam: value => 'seam:' + value };
  const scope = createAdapterScope(ctx, () => {});
  assert.equal(scope.futureSeam('x'), 'seam:x');
});

test('注册入口保持隔离：官方适配器注册的路由被捕获，宿主的适配器与设置不被改动', () => {
  let captured;
  const scope = createAdapterScope({ fiber: {}, logger: console, get: () => undefined }, value => { captured = value; });
  const disposer = scope.llm.registerAdapter(['minimax-byapi'], { id: 'captured' });
  assert.equal(captured.id, 'captured');
  assert.equal(typeof disposer, 'function');
  assert.equal(typeof scope.llm.registerConfigurableProviders().replace, 'function');
  assert.equal(typeof scope.llm.registerModelDiscovery(), 'function');
  assert.equal(scope.inject('anything'), undefined);
  assert.equal(typeof scope.on('anything', () => {}), 'function');
});
