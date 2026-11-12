import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 用能保存并触发重渲染的假 React 加载真实构建产物，验证「获取模型 → 添加行 → 保存」、只读页与槽位注册。
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
const byLabel = (tree, label) => walk(tree).find(n => (n.props || {})['aria-label'] === label);
const buttonByText = (tree, label) => walk(tree).find(n => n.type === 'button' && textsOf(n).includes(label));
const statusText = tree => walk(tree).filter(n => n.props?.role === 'status').map(textsOf).join(' ');
const TOOL_KEYS = ['minimax_models', 'minimax_quota', 'minimax_generate_image', 'minimax_edit_image', 'minimax_generate_video', 'minimax_list_voices', 'minimax_speak', 'minimax_speak_long', 'minimax_generate_music', 'minimax_transcribe', 'minimax_media_status', 'minimax_media_retry_download', 'minimax_media_list'];
const BASE_URL = 'https://api.minimax.io/v1';

const DISCOVERED = [
  { id: 'MiniMax-M2', name: 'MiniMax-M2', contextWindow: 204800, maxTokens: 32768, inputModalities: ['text'] },
  { id: 'MiniMax-M1', name: 'MiniMax-M1', contextWindow: 1000000, maxTokens: 32768, inputModalities: ['text'] },
  { id: 'image-01', name: 'image-01', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
  { id: 'video-01', name: 'video-01', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
  { id: 'speech-02-hd', name: 'speech-02-hd', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
  { id: 'music-01', name: 'music-01', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
];

function mount(Client, options = {}) {
  const runtime = Client.runtime;
  runtime.cursor = 0;
  runtime.hooks = [];
  runtime.effects = [];
  runtime.refs = {};
  const seen = [];
  const form = {
    state: { value: options.state || { connection: { baseURL: BASE_URL, timeoutMs: 60000 }, media: {}, modelOverrides: [] }, revision: 5, writable: true },
    mutate: options.mutate || (async () => true),
  };
  const remote = { llm: { discoverModels: options.discover || (async (_ns, request) => { seen.push(request); return DISCOVERED; }) }, credentials: { set: options.setCredential || (async () => ({ ok: true })), describe: options.describeCredential } };
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxSettings({ view: 'page', form, remote }); };
  runtime.renders = [runtime.render()];
  const current = () => runtime.renders[runtime.renders.length - 1];
  current.seen = seen;
  return current;
}

function openChat() {
  // 语言模型区不再折叠，表格始终渲染。
}
async function discoveredTree(Client, mutate) {
  const current = mount(Client, { mutate });
  openChat(current);
  await buttonByText(current(), '获取模型').props.onClick();
  return current;
}

const chatSelects = tree => walk(tree).filter(n => n.type === 'select' && String(n.props?.['aria-label'] || '').startsWith('模型 ID'));
const chatSelect = tree => chatSelects(tree).at(-1);

test('远程发现结果包在 ok/value 里时仍能列出模型', async () => {
  const Client = loadClient();
  const current = mount(Client, { discover: async () => ({ ok: true, value: DISCOVERED }) });
  await buttonByText(current(), '获取模型').props.onClick();
  assert.match(statusText(current()), /已发现 6 个模型/);
});

test('点获取模型后提示数量，媒体下拉只列同类模型', async () => {
  const Client = loadClient();
  const current = await discoveredTree(Client);
    const tree = current();
  assert.match(statusText(tree), /已发现 6 个模型/);
  assert.equal(current.seen[0].baseURL, BASE_URL);
  assert.equal(current.seen[0].apiKey, undefined);
  for (const label of ['图片模型', '视频模型', '语音模型']) byLabel(current(), label).props.onClick();
  const open = current();
  const optionsOf = key => walk(open).filter(n => n.props?.['data-picker'] === key && n.props?.['data-model'] !== undefined).map(n => n.props['data-model']);
  assert.deepEqual(optionsOf('imageModel'), ['', 'image-01']);
  assert.deepEqual(optionsOf('videoModel'), ['', 'video-01']);
  assert.deepEqual(optionsOf('speechModel'), ['', 'speech-02-hd']);
  assert.equal(byLabel(tree, '启用生成图片'), undefined);
});

test('获取模型把草稿密钥发给发现接口，不写进配置', async () => {
  const Client = loadClient();
  const current = mount(Client);
  byLabel(current(), 'API Key').props.onChange({ target: { value: 'draft-key' } });
  await buttonByText(current(), '获取模型').props.onClick();
  assert.equal(current.seen.at(-1).apiKey, 'draft-key');
});

test('已保存的模型在未获取清单时也能回显，获取后去重', async () => {
  const Client = loadClient();
  const current = mount(Client, { state: {
    connection: { baseURL: BASE_URL, timeoutMs: 60000 },
    media: { imageModel: 'image-01', videoModel: '', speechModel: '', musicModel: '' },
    modelOverrides: [{ id: 'MiniMax-M2', displayName: 'MiniMax M2', imageSupported: false, contextWindow: 204800, maxTokens: 32768, reasoningEfforts: [] }],
  } });
  openChat(current);
    const before = walk(chatSelect(current())).filter(n => n.type === 'option').map(n => n.props.value);
  assert.deepEqual(before, ['', 'MiniMax-M2']);
  assert.equal(byLabel(current(), '图片模型').props['data-model-value'], 'image-01');
  await buttonByText(current(), '获取模型').props.onClick();
  const after = walk(chatSelect(current())).filter(n => n.type === 'option').map(n => n.props.value);
  assert.equal(after.filter(id => id === 'MiniMax-M2').length, 1);
  assert.ok(after.includes('MiniMax-M1'));
});

test('客户端声明凭据命名空间，否则设置页一读密钥就整页崩溃', () => {
  const Client = loadClient();
  assert.ok(Client.exports.inject.includes('remote.credentials'));
});

test('已配置密钥时按引用名数组查询并自动展开模型', async () => {
  const Client = loadClient();
  const described = [];
  const current = mount(Client, {
    describeCredential: async refs => {
      described.push(refs);
      return { ok: true, value: { MINIMAX_API_KEY: { configured: true, writable: true } } };
    },
  });
  for (const effect of Client.runtime.effects) effect();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(described, [['MINIMAX_API_KEY']]);
  assert.match(statusText(current()), /已发现 6 个模型/);
  assert.ok(byLabel(current(), '模型 ID 0'), '语言模型表始终渲染');
  assert.ok(walk(chatSelect(current())).some(n => n.props?.value === 'MiniMax-M2'));
});

test('地址为空时获取模型仍带上默认地址', async () => {
  const Client = loadClient();
  const current = mount(Client, { state: { connection: { baseURL: '' }, media: {}, modelOverrides: [] } });
  await buttonByText(current(), '获取模型').props.onClick();
  assert.equal(current.seen[0].baseURL, 'https://api.minimaxi.com/anthropic');
  assert.equal(current.seen[0].api, 'anthropic-messages');
});

test('插件详情页等配置读完再自动获取，不用空地址', async () => {
  const Client = loadClient();
  const runtime = Client.runtime;
  runtime.cursor = 0;
  runtime.hooks = [];
  runtime.refs = {};
  runtime.effects = [];
  const seen = [];
  let release;
  const described = new Promise(resolve => { release = resolve; });
  const value = { connection: { baseURL: 'https://gateway.example/v1', api: 'anthropic-messages' }, media: {}, modelOverrides: [] };
  const remote = {
    settings: { describe: () => described.then(() => ({ ok: true, value: { namespaces: [{ ns: 'minimax-api', value, revision: 3 }] } })) },
    credentials: { describe: async () => ({ ok: true, value: { MINIMAX_API_KEY: { configured: true } } }) },
    llm: { discoverModels: async (_ns, request) => { seen.push(request); return { ok: true, value: DISCOVERED }; } },
  };
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxSettings({ view: 'page', remote }); };
  runtime.renders = [runtime.render()];
  for (const effect of runtime.effects.slice()) effect();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(seen.length, 0, '配置没回来之前不能拿空地址去发现');
  assert.doesNotMatch(statusText(runtime.renders.at(-1)), /provider route|baseURL/);
  release();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].baseURL, 'https://gateway.example/v1');
  assert.equal(seen[0].api, 'anthropic-messages');
  assert.match(statusText(runtime.renders.at(-1)), /已发现 6 个模型/);
  assert.doesNotMatch(statusText(runtime.renders.at(-1)), /provider route/);
});

test('详情页保存解包 namespace view：媒体模型不回退，下一次保存用新 revision', async () => {
  const Client = loadClient();
  const runtime = Client.runtime;
  runtime.cursor = 0; runtime.hooks = []; runtime.effects = []; runtime.refs = {};
  const calls = [];
  const baseValue = {
    connection: { baseURL: BASE_URL, api: 'openai-completions', timeoutMs: 60000 },
    media: { imageModel: 'image-01', videoModel: '', speechModel: '', musicModel: '' },
    modelOverrides: [
      { id: 'MiniMax-M2', displayName: 'MiniMax-M2', imageSupported: false, contextWindow: 204800, maxTokens: 32768, reasoningEfforts: [] },
    ],
  };
  const remote = {
    settings: {
      describe: async () => ({ ok: true, value: { namespaces: [{ ns: 'minimax-api', value: baseValue, revision: 3 }] } }),
      mutate: async (ns, ops, revision) => {
        calls.push({ ns, ops, revision });
        const overrides = ops.find(op => op.path[0] === 'modelOverrides');
        const nextValue = { ...baseValue, modelOverrides: overrides ? overrides.value : baseValue.modelOverrides };
        return { ok: true, value: { ns, value: nextValue, revision: revision + 1 } };
      },
    },
    credentials: { describe: async () => ({ ok: true, value: { MINIMAX_API_KEY: { configured: true } } }), set: async () => ({ ok: true }) },
    llm: { discoverModels: async () => ({ ok: true, value: DISCOVERED }) },
  };
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxSettings({ view: 'page', remote }); };
  runtime.renders = [runtime.render()];
  for (const effect of runtime.effects.slice()) effect();
  await new Promise(resolve => setTimeout(resolve, 20));
  const current = () => runtime.renders.at(-1);
  openChat(current);
    assert.equal(byLabel(current(), '图片模型').props['data-model-value'], 'image-01');
  byLabel(current(), '删除第 1 行').props.onClick();
  await buttonByText(current(), '保存语言模型').props.onClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].revision, 3);
  assert.deepEqual(calls[0].ops.find(op => op.path[0] === 'modelOverrides').value, []);
  assert.equal(byLabel(current(), '图片模型').props['data-model-value'], 'image-01', '保存后媒体模型不能回退成不使用');
  assert.match(statusText(current()), /已保存 0 条语言模型/);
  await buttonByText(current(), '保存媒体模型').props.onClick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].revision, 4, '第二次保存必须用保存后返回的 revision');
  assert.equal(calls[1].ops.find(op => op.path[0] === 'media').value.imageModel, 'image-01');
  assert.match(statusText(current()), /媒体模型已保存/);
});

test('宿主拒绝空地址时不把英文原文露出来', async () => {
  const Client = loadClient();
  const current = mount(Client, { discover: async () => ({ ok: false, error: { message: 'model discovery needs a provider route or a baseURL' } }) });
  await buttonByText(current(), '获取模型').props.onClick();
  assert.match(statusText(current()), /没有可用的 API 地址/);
  assert.doesNotMatch(statusText(current()), /provider route/);
});

test('打开页面就有一行空的聊天模型', () => {
  const Client = loadClient();
  const current = mount(Client);
  openChat(current);
    const tree = current();
  const model = chatSelect(tree);
  assert.equal(model.props.value, '');
  assert.deepEqual(walk(model).filter(n => n.type === 'option').map(n => n.props.value), ['']);
  assert.equal(byLabel(tree, '图片模型').props['data-model-value'], '');
  assert.equal(byLabel(tree, '生成音乐'), undefined, '退役的生成音乐不再出现在媒体模型里');
  assert.equal(byLabel(tree, '启用生成图片'), undefined);
  assert.equal(walk(tree).some(n => n.props?.type === 'radio'), false);
});

test('聊天模型下拉不含图片/视频/语音/音乐模型', async () => {
  const Client = loadClient();
  const current = await discoveredTree(Client);
  await buttonByText(current(), '添加').props.onClick();
  const options = walk(chatSelect(current())).filter(n => n.type === 'option').map(n => n.props.value);
  assert.ok(options.includes('MiniMax-M2'));
  assert.ok(!options.includes('video-01'));
  assert.ok(!options.includes('speech-02-hd'));
  assert.ok(!options.includes('music-01'));
});

test('保存对话模型只提交覆盖，并清掉已无用的默认模型', async () => {
  const Client = loadClient();
  const calls = [];
  const current = await discoveredTree(Client, async (ops, revision) => { calls.push({ ops, revision }); return true; });
  await buttonByText(current(), '添加').props.onClick();
  chatSelect(current()).props.onChange({ target: { value: 'MiniMax-M2' } });
  await buttonByText(current(), '保存语言模型').props.onClick();
  assert.equal(calls.length, 1);
  const ops = calls[0].ops;
  const overrides = ops.find(o => o.path[0] === 'modelOverrides').value;
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].id, 'MiniMax-M2');
  assert.equal(overrides[0].contextWindow, 204800);
  assert.equal(ops.some(o => o.op === 'set' && o.path[0] === 'media' && o.path[1] === 'defaultModel'), false);
  assert.deepEqual(ops.find(o => o.op === 'unset' && o.path[1] === 'defaultModel'), { op: 'unset', path: ['media', 'defaultModel'] });
});

test('删掉的对话模型不会在保存时被加回', async () => {
  const Client = loadClient();
  const calls = [];
  const withTwo = {
    connection: { baseURL: BASE_URL, timeoutMs: 60000 },
    media: { defaultModel: 'MiniMax-M2' },
    modelOverrides: [
      { id: 'MiniMax-M2', displayName: 'MiniMax M2', imageSupported: false, contextWindow: 204800, maxTokens: 32768, reasoningEfforts: [] },
      { id: 'MiniMax-M1', displayName: 'MiniMax M1', imageSupported: false, contextWindow: 1000000, maxTokens: 32768, reasoningEfforts: [] },
    ],
  };
  const current = mount(Client, { state: withTwo, mutate: async (ops) => { calls.push(ops); return true; } });
  openChat(current);
  await buttonByText(current(), '获取模型').props.onClick();
  byLabel(current(), '删除第 1 行').props.onClick();
  await buttonByText(current(), '保存语言模型').props.onClick();
  const overrides = calls[0].find(o => o.path[0] === 'modelOverrides').value;
  assert.deepEqual(overrides.map(row => row.id), ['MiniMax-M1']);
});

test('删除按钮在每行最前，尺寸与添加一致，红字红边', () => {
  const Client = loadClient();
  const current = mount(Client, { state: {
    connection: { baseURL: BASE_URL },
    media: {},
    modelOverrides: [
      { id: 'MiniMax-M2', displayName: 'MiniMax M2', imageSupported: false, contextWindow: 204800, maxTokens: 32768, reasoningEfforts: [] },
      { id: 'MiniMax-M1', displayName: 'MiniMax M1', imageSupported: false, contextWindow: 1000000, maxTokens: 32768, reasoningEfforts: [] },
    ],
  } });
  openChat(current);
  const tree = current();
  const row = walk(tree).find(n => n.type === 'tr' && walk(n).some(c => c.props?.['aria-label'] === '删除第 1 行'));
  const cells = [].concat(row.children).filter(n => n?.type === 'td');
  assert.equal(cells[0].children[0].props['aria-label'], '删除第 1 行');
  assert.equal(cells[1].children[0].props['aria-label'], '模型 ID 0');
  const del = cells[0].children[0];
  assert.ok(walk(del).some(n => n.type === 'svg'), '删除按钮用图标代替文字');
  assert.equal(textsOf(del).trim(), '', '删除按钮不显示文字');
  assert.equal(del.props.style.width, 28);
  assert.equal(del.props.style.height, 28);
  assert.equal(del.props.style.padding, 0);
  assert.match(String(del.props.style.color), /error-primary/);
  assert.match(String(del.props.style.border), /error-primary/);
  assert.equal(walk(tree).some(n => n.props?.type === 'radio'), false);
  assert.equal(byLabel(tree, '删除第 1 行').props.disabled, false);
  assert.equal(byLabel(tree, '删除第 2 行').props.disabled, false);
  assert.equal(byLabel(tree, '上下文 0').props.style.width, 64);
  assert.equal(byLabel(tree, '最大输出 0').props.style.width, 64);
  byLabel(tree, '删除第 2 行').props.onClick();
  assert.equal(byLabel(current(), '删除第 2 行'), undefined);
  assert.equal(byLabel(current(), '模型 ID 0').props.value, 'MiniMax-M2');
});

test('上下文/最大输出接受 M 与 K 后缀', async () => {
  const Client = loadClient();
  const calls = [];
  const current = await discoveredTree(Client, async ops => { calls.push(ops); return true; });
  await buttonByText(current(), '添加').props.onClick();
  chatSelect(current()).props.onChange({ target: { value: 'MiniMax-M2' } });
  byLabel(current(), '上下文 1').props.onChange({ target: { value: '1M' } });
  byLabel(current(), '最大输出 1').props.onChange({ target: { value: '64K' } });
  await buttonByText(current(), '保存语言模型').props.onClick();
  const overrides = calls[0].find(o => o.path[0] === 'modelOverrides').value;
  assert.equal(overrides.at(-1).contextWindow, 1000000);
  assert.equal(overrides.at(-1).maxTokens, 64000); // K = 1000，与界面提示一致
});

test('非法大小被拦下且不提交', async () => {
  const Client = loadClient();
  const calls = [];
  const current = await discoveredTree(Client, async ops => { calls.push(ops); return true; });
  await buttonByText(current(), '添加').props.onClick();
  chatSelect(current()).props.onChange({ target: { value: 'MiniMax-M2' } });
  byLabel(current(), '最大输出 1').props.onChange({ target: { value: 'abc' } });
  await buttonByText(current(), '保存语言模型').props.onClick();
  assert.equal(calls.length, 0);
  assert.match(statusText(current()), /最大输出/);
});

test('思考强度是多选选项', async () => {
  const Client = loadClient();
  const current = await discoveredTree(Client);
  await buttonByText(current(), '添加').props.onClick();
  chatSelect(current()).props.onChange({ target: { value: 'MiniMax-M2' } });
  const effort = byLabel(current(), '思考强度 1');
  assert.equal(effort.props.style.whiteSpace, 'nowrap');
  assert.equal(effort.props.style.fontSize, 11);
  assert.equal(textsOf(effort), '未设置', 'MiniMax 没有公开的思考强度分档，默认不勾选');
  effort.props.onClick();
  const menu = walk(current()).find(n => n.props?.role === 'group' && String(n.props['aria-label'] || '').startsWith('思考强度选项'));
  assert.ok(menu, '打开思考强度菜单');
  assert.equal(menu.props.style.position, 'fixed', '菜单用视口浮层，避免被表格裁掉');
  const efforts = walk(current()).filter(n => n.type === 'input' && String(n.props?.['aria-label'] || '').startsWith('思考强度 '));
  assert.deepEqual(efforts.map(n => n.props['aria-label']), ['思考强度 none 1', '思考强度 low 1', '思考强度 medium 1', '思考强度 high 1', '思考强度 xhigh 1', '思考强度 max 1']);
  efforts.find(n => n.props['aria-label'] === '思考强度 low 1').props.onChange({ target: { checked: true } });
  assert.equal(textsOf(byLabel(current(), '思考强度 1')), 'low', '勾选后摘要显示已选档位');
});

test('API Key 输入框是密码框且默认留空（密钥存凭据库）', async () => {
  const Client = loadClient();
  const current = await discoveredTree(Client);
  const key = byLabel(current(), 'API Key');
  assert.equal(key.props.type, 'password');
  assert.equal(key.props.value, '');
  assert.match(textsOf(current()), /MINIMAX_API_KEY/);
});

test('提供商信息是只读的，并指向真正的配置位置', () => {
  const Client = loadClient();
  const tree = Client.exports.MinimaxProviderNotice({ view: 'detail', form: { state: { value: { connection: { baseURL: BASE_URL } } } } });
  assert.equal(walk(tree).some(n => n.type === 'input'), false, '只读页不应有任何输入控件');
  const text = textsOf(tree);
  assert.match(text, /minimax-api/);
  assert.match(text, /插件 → dsh-minimax-api → MiniMax API接入/);
  assert.match(text, /只读/);
});

test('媒体模型下拉按 MiniMax 官方模型名分类', async () => {
  const Client = loadClient();
  const real = [
    { id: 'MiniMax-M3.1-Flash', name: 'MiniMax M3.1 Flash', contextWindow: 1000000, maxTokens: 131072, inputModalities: ['text', 'image'] },
    { id: 'image-01', name: 'image-01', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
    { id: 'MiniMax-H3', name: 'MiniMax H3', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
    { id: 'speech-2.8-hd', name: 'speech-2.8-hd', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
    { id: 'music-3.0', name: 'music-3.0', contextWindow: 131072, maxTokens: 8192, inputModalities: ['text'] },
  ];
  const current = mount(Client, { discover: async () => real });
  await buttonByText(current(), '获取模型').props.onClick();
    const tree = current();
  for (const label of ['图片模型', '视频模型', '语音模型']) byLabel(current(), label).props.onClick();
  const open = current();
  const optionsOf = key => walk(open).filter(n => n.props?.['data-picker'] === key && n.props?.['data-model'] !== undefined).map(n => n.props['data-model']);
  assert.deepEqual(optionsOf('imageModel'), ['', 'image-01']);
  assert.deepEqual(optionsOf('videoModel'), ['', 'MiniMax-H3']);
  assert.deepEqual(optionsOf('speechModel'), ['', 'speech-2.8-hd']);
});

test('配置挂在插件上，每个媒体工具都有结果卡片', () => {
  const Client = loadClient();
  const registered = [];
  const ctx = {
    slots: { inject: (name, fn) => { fn(); }, register: (options, component) => { registered.push({ name: options.name, key: options.key, component }); return () => {}; } },
    documentPreviews: { register: () => () => {} },
    remote: { marker: true },
    effect: fn => fn(),
  };
  Client.exports.apply(ctx);
  const bundles = registered.filter(r => r.name === 'plugins.bundle.config');
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].key, 'dsh-minimax-api');
  assert.match(textsOf(bundles[0].component({ view: 'summary' })), /MiniMax 连接、密钥与模型参数/);
  const rows = registered.filter(r => r.name === 'plugins.row.config');
  assert.deepEqual(rows.map(r => r.key).sort(), ['dsh-minimax-api#dsh-minimax-media', 'dsh-minimax-api#minimax-api']);
  const chat = rows.find(row => row.key.endsWith('#minimax-api'));
  const media = rows.find(row => row.key.endsWith('#dsh-minimax-media'));
  const chatText = textsOf(chat.component({ view: 'page' }));
  const mediaText = textsOf(media.component({ view: 'page' }));
  assert.match(chatText, /minimax_models/);
  assert.match(chatText, /输入：/);
  assert.match(chatText, /产出：/);
  assert.match(chatText, /dsh-minimax-media/);
  assert.doesNotMatch(chatText, /minimax_edit_image/);
  assert.match(mediaText, /图生图/);
  assert.match(mediaText, /图生视频/);
  assert.match(mediaText, /minimax_generate_music/);
  assert.match(mediaText, /minimax_transcribe/);
  assert.match(mediaText, /音乐模型官方已退役/);
  assert.match(mediaText, /不提供：实时语音/);
  assert.doesNotMatch(mediaText, /不提供：语音识别/);
  assert.match(mediaText, /minimax-api/);
  assert.doesNotMatch(mediaText, /刷新模型目录/);
  assert.equal(walk(chat.component({ view: 'page' })).some(n => n.type === 'input'), false);
  assert.equal(walk(media.component({ view: 'page' })).some(n => n.type === 'input'), false);
  const toolviews = registered.filter(r => r.name === 'tool.call.toolview').map(r => r.key);
  assert.deepEqual(toolviews.sort(), [...TOOL_KEYS].sort(), '每个已注册工具都要有结果卡片');
});

test('插件详情页自己读取设置，不依赖页面传入的表单', async () => {
  const Client = loadClient();
  const runtime = Client.runtime;
  runtime.cursor = 0;
  runtime.hooks = [];
  const value = { connection: { baseURL: BASE_URL }, media: {}, modelOverrides: [] };
  const seen = [];
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxSettings({ view: 'page', remote: { settings: { describe: async () => { seen.push('describe'); return { ok: true, value: { namespaces: [{ ns: 'minimax-api', value, revision: 3 }] } }; } } } }); };
  runtime.renders = [runtime.render()];
  const before = runtime.renders.length;
  for (const effect of runtime.effects.slice()) effect();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(seen, ['describe']);
});

test('首次挂载（还没获取模型）不抛错：effect 不能解引用 null', async () => {
  const Client = loadClient();
  const runtime = Client.runtime;
  runtime.cursor = 0;
  runtime.hooks = [];
  runtime.effects = [];
  const form = { state: { value: { connection: { baseURL: BASE_URL }, media: {}, modelOverrides: [] }, revision: 1, writable: true }, mutate: async () => true };
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxSettings({ view: 'page', form, remote: { llm: { discoverModels: async () => DISCOVERED } } }); };
  runtime.renders = [runtime.render()];
  // 只跑挂载时注册的那批 effect：runtime.hooks 会随渲染增长，用 for...of 会无限循环。
  for (const effect of runtime.effects.slice()) await effect();
  await new Promise(r => setTimeout(r, 0));
  const text = textsOf(runtime.renders[runtime.renders.length - 1]) || '';
  assert.match(text, /语言模型/, '面板应完整渲染');
  assert.match(text, /获取模型/);
});

test('摘要视图返回一句话', () => {
  const Client = loadClient();
  assert.match(textsOf(Client.exports.MinimaxSettings({ view: 'summary' })), /MiniMax 连接、密钥与模型参数/);
});

test('保存时把密钥写入凭据库，配置里不留明文', async () => {
  const Client = loadClient();
  const stored = [];
  const current = mount(Client, { setCredential: async (ref, value) => { stored.push({ ref, value }); return { ok: true }; } });
  byLabel(current(), 'API Key').props.onChange({ target: { value: 'saved-key' } });
  await buttonByText(current(), '保存地址和密钥').props.onClick();
  assert.deepEqual(stored, [{ ref: 'MINIMAX_API_KEY', value: 'saved-key' }]);
  assert.equal(byLabel(current(), 'API Key').props.value, '');
});

test('空地址回显默认值，保存写入同一地址', async () => {
  const Client = loadClient();
  const calls = [];
  const defaultBaseURL = 'https://api.minimaxi.com/anthropic';
  const current = mount(Client, {
    state: { connection: { baseURL: '' }, media: {}, modelOverrides: [] },
    mutate: async ops => { calls.push(ops); return true; },
  });
  assert.equal(byLabel(current(), 'API 地址').props.value, defaultBaseURL);
  await buttonByText(current(), '保存地址和密钥').props.onClick();
  const connection = calls[0].find(op => op.path[0] === 'connection').value;
  assert.equal(connection.baseURL, defaultBaseURL);
  assert.equal(connection.plan, 'coding-cn');
  assert.equal(connection.api, 'anthropic-messages');
  assert.equal(connection.apiKey, '');
});

test('保存连接时把接入方式、地址和协议一起写入', async () => {
  const Client = loadClient();
  const calls = [];
  const current = mount(Client, { mutate: async ops => { calls.push(ops); return true; } });
  byLabel(current(), '接入方式').props.onChange({ target: { value: 'coding-global' } });
  await buttonByText(current(), '保存地址和密钥').props.onClick();
  const connection = calls[0].find(op => op.path[0] === 'connection').value;
  assert.equal(connection.plan, 'coding-global');
  assert.equal(connection.baseURL, 'https://api.minimax.io/anthropic');
  assert.equal(connection.api, 'anthropic-messages');
  assert.equal(connection.apiKeyEnv, 'MINIMAX_API_KEY');
});

test('切换 API 协议时地址自动换成对应的官方路径', async () => {
  const Client = loadClient();
  const calls = [];
  const current = mount(Client, { state: { connection: {}, media: {}, modelOverrides: [] }, mutate: async ops => { calls.push(ops); return true; } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://api.minimaxi.com/anthropic', '默认国内 M Plan 走 /anthropic');
  assert.equal(byLabel(current(), '接入方式').props.value, 'coding-cn');
  byLabel(current(), 'API 协议').props.onChange({ target: { value: 'openai-completions' } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://api.minimaxi.com/v1', 'OpenAI 协议要用 /v1');
  assert.equal(byLabel(current(), '接入方式').props.value, 'payg-cn', '地址与协议都匹配预设时同步接入方式');
  byLabel(current(), 'API 协议').props.onChange({ target: { value: 'openai-responses' } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://api.minimaxi.com/v1', 'Responses 也走 /v1');
  assert.equal(byLabel(current(), '接入方式').props.value, 'custom', 'Responses 不属于任何预设组合，标为自定义');
  await buttonByText(current(), '保存地址和密钥').props.onClick();
  const connection = calls[0].find(op => op.path[0] === 'connection').value;
  assert.equal(connection.api, 'openai-responses');
  assert.equal(connection.baseURL, 'https://api.minimaxi.com/v1');
});

test('自定义代理地址不被协议切换改写', () => {
  const Client = loadClient();
  const current = mount(Client, { state: {
    connection: { baseURL: 'https://gateway.example/v1', plan: 'custom' }, media: {}, modelOverrides: [],
  } });
  byLabel(current(), 'API 协议').props.onChange({ target: { value: 'anthropic-messages' } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://gateway.example/v1', '非官方主机不改写路径');
  assert.equal(byLabel(current(), '接入方式').props.value, 'custom');
});

test('各媒体模型卡片始终显示所选模型的简介', () => {
  const Client = loadClient();
  const current = mount(Client, { state: {
    connection: { baseURL: BASE_URL },
    media: { imageModel: 'image-01', videoModel: 'MiniMax-H3', speechModel: '', musicModel: '' },
    modelOverrides: [],
  } });
  const text = textsOf(current());
  assert.match(text, /文生图\/图生图/, '图片模型要有简介');
  assert.match(text, /v2，768P\/2K/, '视频模型要有简介');
  const blank = mount(Client, { state: { connection: { baseURL: BASE_URL }, media: {}, modelOverrides: [] } });
  assert.doesNotMatch(textsOf(blank()), /文生图\/图生图/);
});

test('媒体模型拆成图片/视频/语音三张常展开卡片，标题带图标', () => {
  const Client = loadClient();
  const tree = mount(Client)();
  const text = textsOf(tree);
  assert.match(text, /图片模型/);
  assert.match(text, /视频模型/);
  assert.match(text, /语音模型/);
  const collapseToggle = walk(tree).find(n => n.type === 'button' && /^[▸▾]\s*媒体模型$/.test(textsOf(n).trim()));
  assert.equal(collapseToggle, undefined, '不再有折叠媒体模型的按钮');
  const headings = walk(tree).filter(n => n.type === 'h3');
  const mediaHeadings = headings.filter(n => /(图片模型|视频模型|语音模型)/.test(textsOf(n)));
  assert.equal(mediaHeadings.length, 3, '三张媒体卡片都直接渲染');
  for (const heading of mediaHeadings) assert.ok(walk(heading).some(n => n.type === 'svg'), '每个媒体标题带图标');
  const languageHeading = headings.find(n => /语言模型/.test(textsOf(n)));
  assert.ok(languageHeading && walk(languageHeading).some(n => n.type === 'svg'), '语言模型标题带图标');
});

test('已保存的 API 地址原样回显', () => {
  const Client = loadClient();
  const current = mount(Client, { state: {
    connection: { baseURL: 'https://gateway.example/v1' }, media: {}, modelOverrides: [],
  } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://gateway.example/v1');
  assert.equal(byLabel(current(), '接入方式').props.value, 'custom', '不匹配任何预设的地址算自定义');
});

test('未获取清单时保存媒体模型仍保留已选 ID', async () => {
  const Client = loadClient();
  const calls = [];
  const current = mount(Client, {
    state: {
      connection: { baseURL: BASE_URL },
      media: { imageModel: 'image-01', videoModel: '', speechModel: '', defaultModel: 'MiniMax-M2' },
      modelOverrides: [],
    },
    mutate: async ops => { calls.push(ops); return true; },
  });
    assert.equal(byLabel(current(), '图片模型').props['data-model-value'], 'image-01');
  assert.equal(byLabel(current(), '启用生成图片'), undefined);
  await buttonByText(current(), '保存媒体模型').props.onClick();
  const media = calls[0].find(op => op.path.length === 1 && op.path[0] === 'media').value;
  assert.equal(media.imageModel, 'image-01');
  assert.equal('defaultModel' in media, false);
});

test('选不使用后再保存会清空该媒体模型', async () => {
  const Client = loadClient();
  const calls = [];
  const current = mount(Client, {
    state: {
      connection: { baseURL: BASE_URL },
      media: { imageModel: 'image-01', videoModel: '', speechModel: '' },
      modelOverrides: [],
    },
    mutate: async ops => { calls.push(ops); return true; },
  });
    byLabel(current(), '图片模型').props.onClick();
  walk(current()).find(n => n.props?.['data-picker'] === 'imageModel' && n.props['data-model'] === '').props.onClick();
  assert.equal(byLabel(current(), '图片模型').props['data-model-value'], '');
  await buttonByText(current(), '保存媒体模型').props.onClick();
  const media = calls[0].find(op => op.path.length === 1 && op.path[0] === 'media').value;
  assert.equal(media.imageModel, '');
});
