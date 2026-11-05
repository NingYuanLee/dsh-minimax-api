import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { LlmAdapter, createUserMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { buildChatAdapter } from '../src/adapter.js';

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
