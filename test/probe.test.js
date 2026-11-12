import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MinimaxProbeService, classifyProbeError, PROBE_NAMESPACE } from '../src/probe-service.js';

test('连接测试成功时回延迟、状态与模型数', async () => {
  const service = new MinimaxProbeService({ probe: async () => ({ host: 'api.minimaxi.com', status: 200, models: 27, latencyMs: 123 }) });
  const result = await service.test();
  assert.equal(result.ok, true);
  assert.equal(result.host, 'api.minimaxi.com');
  assert.equal(result.status, 200);
  assert.equal(result.models, 27);
  assert.equal(result.latencyMs, 123);
  assert.match(result.at, /^\d{4}-/);
});

test('连接测试失败时按错误类型分类', async () => {
  const cases = [
    ['MiniMax 调用密钥未配置：请在插件设置里填写 API Key', 'key-missing'],
    ['认证被拒绝（HTTP 401）', 'auth'],
    ['连接超时（15000ms）', 'timeout'],
    ['该地址没有开放模型列表接口（HTTP 404）', 'unsupported'],
    ['无法连接 https://api.minimaxi.com/anthropic', 'network'],
    ['连接失败：HTTP 500', 'http'],
    ['something else', 'error'],
  ];
  for (const [message, code] of cases) {
    assert.equal(classifyProbeError(new Error(message)), code, message);
    const service = new MinimaxProbeService({ probe: async () => { throw new Error(message); } });
    const result = await service.test();
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(result.message, message);
    assert.ok(result.latencyMs >= 0);
  }
});

test('探测服务声明网关命名空间与远程方法', () => {
  assert.equal(PROBE_NAMESPACE, 'minimaxProbe');
  const service = new MinimaxProbeService({ probe: async () => ({}) });
  assert.equal(service.typertRemote.namespace, 'minimaxProbe');
  assert.equal(service.typertRemote.serviceKey, 'minimaxProbe');
});
