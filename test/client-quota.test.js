import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 与 client-settings.test.js 相同的加载方式：用能保存并触发重渲染的假 React 加载真实构建产物。
function loadClient() {
  const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  const runtime = { renders: [], render: null, hooks: [], effects: [], cursor: 0 };
  const React = {
    createElement: (type, props, ...children) => (typeof type === 'function'
      ? type({ ...(props || {}), children })
      : { type, props: { ...(props || {}) }, children }),
    useEffect: fn => { runtime.effects.push(fn); },
    useRef: initial => { runtime.refs = runtime.refs || {}; const slot = runtime.cursor++; const key = 'r' + slot; runtime.refs[key] = runtime.refs[key] || { current: initial }; return runtime.refs[key]; },
    useState: initial => {
      const slot = runtime.cursor++;
      if (runtime.hooks[slot] === undefined) runtime.hooks[slot] = { value: typeof initial === 'function' ? initial() : initial };
      const entry = runtime.hooks[slot];
      const set = next => {
        entry.value = typeof next === 'function' ? next(entry.value) : next;
        runtime.cursor = 0;
        if (runtime.render) runtime.renders.push(runtime.render());
      };
      return [entry.value, set];
    },
  };
  let loaded;
  const previousWindow = globalThis.window;
  globalThis.window = { __ModuleLoader__: { load: options => { loaded = options; } } };
  const require = createRequire(import.meta.url);
  const stub = name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: 'Fragment' };
    if (name === 'react-dom') return { createPortal: x => x };
    return require(name);
  };
  new Function('require', code)(stub);
  const exports = loaded.factory(stub, {});
  globalThis.window = previousWindow;
  return { exports, runtime };
}

function walk(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  found.push(node);
  const children = node.children ?? node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) walk(child, found);
  return found;
}
const textsOf = node => [].concat(node?.children ?? []).map(c => (typeof c === 'string' ? c : textsOf(c))).join('');

/**
 * 挂载余额组件：伪造一次宿主接口应答，跑完 effect 后返回最新渲染结果。
 */
async function mountWidget(Client, t, answer) {
  const runtime = Client.runtime;
  runtime.cursor = 0;
  runtime.hooks = [];
  runtime.effects = [];
  runtime.refs = {};
  const calls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ type: 'server-response', rpcId: 'x', result: { ok: true, value: answer } }) };
  };
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxQuotaWidget({ wide: true, t }); };
  runtime.renders = [runtime.render()];
  // effect 的返回值是清理函数：组件里有 5 分钟刷新定时器，不清理会让测试进程一直挂着。
  const cleanups = [];
  for (const effect of runtime.effects.slice()) {
    const dispose = effect();
    if (typeof dispose === 'function') cleanups.push(dispose);
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  const tree = runtime.renders[runtime.renders.length - 1];
  for (const dispose of cleanups) dispose();
  globalThis.fetch = previousFetch;
  return { tree, calls };
}

test('侧栏用量组件向宿主接口要额度，不点开面板就同时显示 5 小时与周窗口的已用百分比', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const { tree, calls } = await mountWidget(Client, t, {
    ok: true,
    host: 'www.minimax.cn',
    interval5h: { total: 100, remaining: 25, used: 75, percentRemaining: 25, resetAt: '2026-11-05T21:00:00+08:00' },
    weekly: { total: 400, remaining: 300, used: 100, percentRemaining: 75, resetAt: '2026-11-09T00:00:00+08:00' },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/minimaxQuota\/quota$/);
  assert.equal(calls[0].body.method, 'minimaxQuota/quota');
  const text = textsOf(tree);
  assert.match(text, /5h 75%/, '剩余 25% 即已用 75%');
  assert.match(text, /w 25%/, '剩余 75% 即已用 25%');
  // 行内只写品牌名 MiniMax，不再重复「MiniMax 用量」这类长文案。
  assert.match(text, /MiniMax usage/, '侧栏行的可见标签也是用量');
  assert.doesNotMatch(text, /MiniMax balance/);
  const mark = walk(tree).find(n => n.type === 'img');
  assert.ok(mark, '侧栏用标志图代替字母 M');
  assert.match(mark.props.src, /^data:image\/png;base64,/, '标志内联成 data URI，不依赖网络');
  assert.equal(mark.props.alt, '');
  assert.equal(mark.props['aria-hidden'], 'true');
  // 面板还没展开：两个窗口的百分比必须直接出现在行摘要里。
  assert.equal(walk(tree).some(n => n.props?.role === 'dialog'), false, '默认不展开明细面板');
  const button = walk(tree).find(n => n.type === 'button');
  assert.match(button.props.title, /5h 75% · w 25%/, '悬停提示是同一份摘要');
  assert.match(button.props['aria-label'], /5h 75% · w 25%/);
});

test('周窗口缺数据时摘要仍显示占位符，不把 5 小时窗口的数字冒充周额度', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const { tree } = await mountWidget(Client, t, {
    ok: true,
    interval5h: { total: 100, remaining: 25, used: 75, percentRemaining: 25 },
  });
  const text = textsOf(tree);
  assert.match(text, /5h 75%/);
  assert.match(text, /w —/);
});

test('点开后的浮窗用视口坐标展开，宽高按视口夹取、不被侧栏容器裁掉', () => {
  const Client = loadClient();
  const previousWindow = globalThis.window;
  try {
    globalThis.window = { innerWidth: 400, innerHeight: 800 };
    const nearEdge = Client.exports.quotaPanelPosition({ getBoundingClientRect: () => ({ left: 380, top: 700 }) });
    assert.deepEqual(nearEdge, { left: 128, bottom: 106, width: 264, maxHeight: 688 }, '靠右时左移，底边贴着按钮上沿');
    globalThis.window = { innerWidth: 200, innerHeight: 800 };
    const narrow = Client.exports.quotaPanelPosition({ getBoundingClientRect: () => ({ left: 40, top: 700 }) });
    assert.equal(narrow.width, 184, '窄窗口里浮窗跟着收窄，不出视口');
    assert.equal(narrow.left, 8);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('点开后浮窗固定定位且 box-sizing 为 border-box，两个窗口都列出来', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const { tree } = await mountWidget(Client, t, {
    ok: true,
    interval5h: { total: 100, remaining: 25, used: 75, percentRemaining: 25, resetAt: new Date(Date.now() + 2 * 3600000 + 5 * 60000 + 30000).toISOString() },
    weekly: { total: 400, remaining: 300, used: 100, percentRemaining: 75, resetAt: new Date(Date.now() + 3 * 86400000 + 4 * 3600000 + 30000).toISOString() },
  });
  walk(tree).find(n => n.type === 'button').props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  const rendered = Client.runtime.renders[Client.runtime.renders.length - 1];
  const dialog = walk(rendered).find(n => n.props?.role === 'dialog');
  assert.ok(dialog, '点开后渲染面板');
  const text = textsOf(dialog);
  assert.match(text, /5-hour limit/);
  assert.match(text, /Weekly limit/);
  assert.doesNotMatch(text, /window/i, '窗口改叫限额，面板里不再出现 window 字样');
  assert.match(text, /75% used/, '5 小时窗口按已用显示：剩余 25% 即已用 75%');
  assert.match(text, /25% used/, '周窗口按已用显示：剩余 75% 即已用 25%');
  assert.match(text, /Resets in 2h 5m/, '重置时间显示为剩余时长');
  assert.match(text, /Resets in 3d 4h/);
  assert.doesNotMatch(text, /\d{4}\/\d{1,2}\/\d{1,2}/, '不再显示具体日期');
  assert.equal(dialog.props.style.position, 'fixed', 'fixed 才能跳出侧栏的 overflow: hidden');
  assert.equal(dialog.props.style.boxSizing, 'border-box', '宽度包含内边距，不会被撑出侧栏');
  assert.equal(dialog.props.style.width, 264);
});

test('满额窗口也始终显示重置倒计时', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const { tree } = await mountWidget(Client, t, {
    ok: true,
    interval5h: { percentRemaining: 100, resetAt: new Date(Date.now() + 3600000).toISOString() },
    weekly: { percentRemaining: 100, resetAt: new Date(Date.now() + 86400000).toISOString() },
  });
  walk(tree).find(n => n.type === 'button').props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  const rendered = Client.runtime.renders[Client.runtime.renders.length - 1];
  const dialog = walk(rendered).find(n => n.props?.role === 'dialog');
  const text = textsOf(dialog);
  assert.match(text, /0% used/);
  assert.equal((text.match(/Resets/g) || []).length, 2, '两个满额窗口也都显示倒计时');
});

test('重置时间按剩余时长显示，最多两个单位，临近或已过期时提示即将重置', () => {
  const Client = loadClient();
  const en = Client.exports.createT(Client.exports.en);
  const zh = Client.exports.createT(Client.exports.zh);
  const now = Date.parse('2026-11-12T10:00:00Z');
  const at = ms => new Date(now + ms).toISOString();
  assert.equal(Client.exports.quotaResetIn(at(2 * 86400000 + 5 * 3600000), now, en), 'Resets in 2d 5h');
  assert.equal(Client.exports.quotaResetIn(at(3 * 3600000 + 20 * 60000), now, en), 'Resets in 3h 20m');
  assert.equal(Client.exports.quotaResetIn(at(12 * 60000), now, en), 'Resets in 12m');
  assert.equal(Client.exports.quotaResetIn(at(2 * 86400000 + 5 * 3600000), now, zh), '2 天 5 小时后重置');
  assert.equal(Client.exports.quotaResetIn(at(3600000), now, zh), '1 小时后重置');
  assert.equal(Client.exports.quotaResetIn(at(30000), now, en), 'Resets soon');
  assert.equal(Client.exports.quotaResetIn(at(-60000), now, en), 'Resets soon');
  assert.equal(Client.exports.quotaResetIn('', now, en), '');
  assert.equal(Client.exports.quotaResetIn(undefined, now, en), '');
  assert.equal(Client.exports.quotaResetIn('not-a-date', now, en), '');
});

test('中文面板把窗口叫限额，分钟写作分', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.zh);
  const { tree } = await mountWidget(Client, t, {
    ok: true,
    interval5h: { percentRemaining: 25, resetAt: new Date(Date.now() + 2 * 3600000 + 5 * 60000 + 30000).toISOString() },
  });
  walk(tree).find(n => n.type === 'button').props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  const rendered = Client.runtime.renders[Client.runtime.renders.length - 1];
  const dialog = walk(rendered).find(n => n.props?.role === 'dialog');
  const text = textsOf(dialog);
  assert.match(text, /5 小时限额/);
  assert.match(text, /周限额/);
  assert.match(text, /2 小时 5 分后重置/);
  assert.match(text, /已用 75%/);
  assert.doesNotMatch(text, /窗口|分钟|剩余/);
});

test('已用百分比优先由剩余反推，缺百分比时用 used / total', () => {
  const Client = loadClient();
  assert.equal(Client.exports.quotaUsedPercent({ percentRemaining: 25 }), 75);
  assert.equal(Client.exports.quotaUsedPercent({ percentRemaining: 100 }), 0);
  assert.equal(Client.exports.quotaUsedPercent({ percentRemaining: 99.5 }), 0.5);
  assert.equal(Client.exports.quotaUsedPercent({ used: 75, total: 100 }), 75);
  assert.equal(Client.exports.quotaUsedPercent({}), null);
  assert.equal(Client.exports.quotaUsedPercent({ used: 1 }), null);
});

test('额度数据每分钟联网刷新一次，不再起 30 秒本地计时器', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const delays = [];
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (fn, delay) => { delays.push(delay); return realSetInterval(fn, delay); };
  try {
    await mountWidget(Client, t, { ok: true, interval5h: { percentRemaining: 50 }, weekly: { percentRemaining: 50 } });
  } finally {
    globalThis.setInterval = realSetInterval;
  }
  assert.ok(delays.includes(60 * 1000), '每分钟联网刷新一次');
  assert.equal(delays.includes(30 * 1000), false, '不再由前端自己走倒计时');
});

test('按量付费 Key 没有 M Plan 额度时组件不占侧栏位置', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const { tree } = await mountWidget(Client, t, { ok: false, code: 'subscription-required', message: '查询 M Plan 额度需要订阅 Key' });
  assert.equal(tree, null, '组件返回 null，不渲染任何内容');
});

test('宿主接口报错时组件显示为不可用，而不是空白', async () => {
  const Client = loadClient();
  const t = Client.exports.createT(Client.exports.en);
  const { tree } = await mountWidget(Client, t, { ok: false, code: 'error', message: 'fetch failed' });
  const text = textsOf(tree);
  assert.match(text, /Quota unavailable/);
});
