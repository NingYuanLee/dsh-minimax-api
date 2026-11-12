import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuota, quotaHostFor, fetchQuota, MiniMaxError } from '../src/minimax-api.js';

const okBody = {
  data: {
    current_interval_total_count: 5000000,
    current_interval_usage_count: 1245300,
    current_interval_reset_time: '2026-11-05T21:00:00+08:00',
    current_weekly_total_count: 35000000,
    current_weekly_usage_count: 8420000,
    current_weekly_reset_time: '2026-11-09T00:00:00+08:00',
    remains_time: 2933989,
    model_remains: [
      { model: 'MiniMax-M3.1-Flash', total: 5000000, remains: 4500000 },
      { model: 'MiniMax-M3', total: 2000000, remains: 1200000 },
    ],
  },
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('额度归一化：实测返回（窗口在 model_remains 里 + 剩余百分比）能解析出余量与重置时间', () => {
  // 2026-11 用 sk-cp 订阅 Key 实测到的真实形状：计数在 model_remains 里且为 0，百分比单独给。
  const live = {
    model_remains: [{
      start_time: 1794412906381,
      end_time: 1794430906381,
      remains_time: 14159657,
      current_interval_total_count: 0,
      current_interval_usage_count: 0,
      model_name: 'general',
      current_weekly_total_count: 0,
      current_weekly_usage_count: 0,
      weekly_start_time: 1793947798228,
      weekly_end_time: 1794552598228,
      weekly_remains_time: 135851504,
      current_interval_status: 1,
      current_interval_remaining_percent: 90,
      current_weekly_status: 1,
      current_weekly_remaining_percent: 7,
    }],
    base_resp: { status_code: 0, status_msg: 'success' },
  };
  const quota = normalizeQuota(live);
  assert.equal(quota.interval5h.percentRemaining, 90, '5 小时窗口的剩余百分比');
  assert.equal(quota.weekly.percentRemaining, 7, '周窗口的剩余百分比');
  assert.equal(quota.interval5h.resetAt, new Date(1794430906381).toISOString(), '5 小时窗口的重置时间');
  assert.equal(quota.weekly.resetAt, new Date(1794552598228).toISOString(), '周窗口的重置时间');
  assert.equal(quota.remainsTimeMs, 14159657, '5 小时窗口的倒计时');
  assert.equal(quota.models[0].model, 'general');
  assert.equal(quota.models[0].percentRemaining, 90);
});

test('额度归一化：多个模型时取最紧的那个窗口', () => {
  const quota = normalizeQuota({
    model_remains: [
      { model_name: 'general', current_interval_remaining_percent: 90, current_weekly_remaining_percent: 40, end_time: 1794430906381, weekly_end_time: 1794552598228 },
      { model_name: 'MiniMax-M3', current_interval_remaining_percent: 25, current_weekly_remaining_percent: 7, end_time: 1794430906381, weekly_end_time: 1794552598228 },
    ],
  });
  assert.equal(quota.interval5h.percentRemaining, 25);
  assert.equal(quota.weekly.percentRemaining, 7);
});

test('额度归一化：usage_count 按「剩余」解读，换算出已用与百分比', () => {
  const quota = normalizeQuota(okBody);
  assert.equal(quota.interval5h.total, 5000000);
  assert.equal(quota.interval5h.remaining, 1245300);
  assert.equal(quota.interval5h.used, 3754700);
  assert.equal(quota.interval5h.percentRemaining, 24.9);
  assert.equal(quota.interval5h.resetAt, '2026-11-05T21:00:00+08:00');
  assert.equal(quota.weekly.remaining, 8420000);
  assert.equal(quota.weekly.used, 26580000);
  assert.equal(quota.remainsTimeMs, 2933989);
  assert.deepEqual(quota.models.map(m => m.model), ['MiniMax-M3.1-Flash', 'MiniMax-M3']);
  assert.equal(quota.models[0].remaining, 4500000);
});

test('额度归一化：字段自相矛盾（usage > total）时按已用解读', () => {
  const quota = normalizeQuota({ current_interval_total_count: 100, current_interval_usage_count: 130 });
  assert.equal(quota.interval5h.remaining, 0, '剩余不会出现负数');
  assert.equal(quota.interval5h.used, 130);
});

test('额度归一化：顶层字段（无 data 包裹）同样可解析', () => {
  const quota = normalizeQuota({ current_interval_total_count: 10, current_interval_usage_count: 4 });
  assert.equal(quota.interval5h.total, 10);
  assert.equal(quota.interval5h.remaining, 4);
});

test('额度主机映射：只有官方 API 主机可查，自定义地址拒绝', () => {
  assert.equal(quotaHostFor('https://api.minimax.io'), 'www.minimax.io');
  assert.equal(quotaHostFor('https://api.minimax.io/v1'), 'www.minimax.io');
  assert.equal(quotaHostFor('https://api.minimax.cn/anthropic'), 'www.minimax.cn');
  assert.equal(quotaHostFor('https://api.minimaxi.com/v1'), 'www.minimaxi.com');
  assert.equal(quotaHostFor('https://gateway.example/v1'), null);
});

test('额度查询：命中 www 主机的 /v1/token_plan/remains 并带上订阅 Key', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), auth: init.headers.authorization });
    return jsonResponse(okBody);
  };
  const quota = await fetchQuota({ apiRoot: 'https://api.minimax.cn', apiKey: 'sub-key', fetchImpl });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://www.minimax.cn/v1/token_plan/remains');
  assert.equal(seen[0].auth, 'Bearer sub-key');
  assert.equal(quota.host, 'www.minimax.cn');
  assert.equal(quota.interval5h.remaining, 1245300);
});

test('额度查询：按量付费 Key 被拒时给出可读说明', async () => {
  const fetchImpl = async () => jsonResponse({ base_resp: { status_code: 1004, status_msg: 'auth failed' } }, 401);
  await assert.rejects(fetchQuota({ apiRoot: 'https://api.minimax.io', apiKey: 'payg', fetchImpl }), error => {
    assert.ok(error instanceof MiniMaxError);
    assert.match(error.message, /订阅 Key|按量付费/);
    assert.equal(error.status, 401);
    return true;
  });
});

test('额度查询：自定义地址不发请求直接报错', async () => {
  let called = 0;
  await assert.rejects(fetchQuota({ apiRoot: 'https://gateway.example', apiKey: 'k', fetchImpl: async () => { called += 1; return jsonResponse({}); } }), /官方主机/);
  assert.equal(called, 0);
});

test('额度查询：base_resp 非 0 时抛出带状态码的错误', async () => {
  const fetchImpl = async () => jsonResponse({ base_resp: { status_code: 1002, status_msg: '触发限流' } });
  await assert.rejects(fetchQuota({ apiRoot: 'https://api.minimax.io', apiKey: 'k', fetchImpl }), /1002|限流/);
});
