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

test('侧栏余额组件向宿主接口要额度，并显示 5 小时窗口的剩余百分比', async () => {
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
  assert.match(text, /MiniMax balance/);
  assert.match(text, /25% left/);
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
