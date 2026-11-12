import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MinimaxQuotaService, QUOTA_NAMESPACE, classifyQuotaError } from '../src/quota-service.js';

const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods';

test('额度服务带上网关要的命名空间绑定与源码模式 Remote 标记', () => {
  const service = new MinimaxQuotaService({ quota: async () => ({}) });
  assert.equal(service.typertRemote.namespace, QUOTA_NAMESPACE);
  assert.equal(service.typertRemote.serviceKey, QUOTA_NAMESPACE);
  assert.equal(service.typertRemote.service, service);
  const marker = Object.getOwnPropertyDescriptor(MinimaxQuotaService.prototype, REMOTE_METHODS).value;
  assert.equal(marker.version, 1);
  assert.deepEqual(marker.methods.map(entry => entry.method), ['quota']);
  assert.equal(marker.methods[0].invocation.kind, 'direct');
});

test('额度查询成功时只回前端要的字段', async () => {
  const service = new MinimaxQuotaService({
    quota: async () => ({
      host: 'www.minimax.cn',
      interval5h: { total: 100, remaining: 25, used: 75, percentRemaining: 25, resetAt: '2026-11-05T21:00:00+08:00' },
      weekly: { total: 400, remaining: 300, used: 100, percentRemaining: 75, resetAt: '2026-11-09T00:00:00+08:00' },
      raw: { secret: '不该外传' },
    }),
  });
  const answer = await service.quota();
  assert.equal(answer.ok, true);
  assert.equal(answer.host, 'www.minimax.cn');
  assert.equal(answer.interval5h.percentRemaining, 25);
  assert.equal(answer.weekly.remaining, 300);
  assert.equal(answer.raw, undefined, '原始响应不过网');
  assert.ok(answer.fetchedAt, '带查询时间');
});

test('额度查询失败时归类成前端能直接处理的情况', async () => {
  const service = new MinimaxQuotaService({ quota: async () => { throw new Error('查询 M Plan 额度需要订阅 Key（按量付费 API Key 会被拒绝）'); } });
  const answer = await service.quota();
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'subscription-required');
  assert.match(answer.message, /订阅 Key/);

  const unsupported = new MinimaxQuotaService({ quota: async () => { throw new Error('当前 API 地址不是 MiniMax 官方主机，无法查询 M Plan 额度'); } });
  assert.equal((await unsupported.quota()).code, 'unsupported-host');

  const broken = new MinimaxQuotaService({ quota: async () => { throw new Error('fetch failed'); } });
  assert.equal((await broken.quota()).code, 'error');
});

test('错误分类按消息判定，未知错误归为通用错误', () => {
  assert.equal(classifyQuotaError(new Error('按量付费 Key 不能查')), 'subscription-required');
  assert.equal(classifyQuotaError(new Error('不是官方主机')), 'unsupported-host');
  assert.equal(classifyQuotaError(new Error('HTTP 500')), 'error');
  assert.equal(classifyQuotaError(undefined), 'error');
});
