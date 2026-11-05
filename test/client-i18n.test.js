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
const byLabel = (tree, label) => walk(tree).find(n => (n.props || {})['aria-label'] === label);
const buttonByText = (tree, label) => walk(tree).find(n => n.type === 'button' && textsOf(n).includes(label));
const hasCjk = text => /[\u4e00-\u9fff]/.test(text);

// 用 en 字典生成翻译器；中文界面靠组件默认 zhT 回退。
function english(Client) {
  return Client.exports.createT(Client.exports.en);
}

function mountSettings(Client, t) {
  const runtime = Client.runtime;
  runtime.cursor = 0;
  runtime.hooks = [];
  runtime.effects = [];
  runtime.refs = {};
  const form = {
    state: { value: { connection: { baseURL: 'https://api.minimax.io/v1', timeoutMs: 60000 }, media: {}, modelOverrides: [] }, revision: 5, writable: true },
    mutate: async () => true,
  };
  const remote = { llm: { discoverModels: async () => [] }, credentials: { set: async () => ({ ok: true }) } };
  runtime.render = () => { runtime.cursor = 0; runtime.effects = []; return Client.exports.MinimaxSettings({ view: 'page', form, remote, t }); };
  runtime.renders = [runtime.render()];
  return () => runtime.renders[runtime.renders.length - 1];
}

test('en / zh 字典 key 集合完全一致，值都非空', () => {
  const Client = loadClient();
  const { en, zh } = Client.exports;
  assert.ok(en && typeof en === 'object', 'exports.en 存在');
  assert.ok(zh && typeof zh === 'object', 'exports.zh 存在');
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), '两种语言的 key 集合必须一致');
  assert.ok(Object.keys(en).length > 80, '字典覆盖全部界面文案');
  for (const [key, value] of Object.entries(en)) {
    assert.equal(typeof value, 'string', key + ' 的英文值是字符串');
    assert.ok(value.trim().length > 0, key + ' 的英文值非空');
    assert.equal(typeof zh[key], 'string', key + ' 的中文值是字符串');
    assert.ok(zh[key].trim().length > 0, key + ' 的中文值非空');
  }
});

test('createT 支持 {param} 插值，缺 key 回显 key', () => {
  const Client = loadClient();
  assert.equal(typeof Client.exports.createT, 'function');
  const t = Client.exports.createT({ greeting: 'Hello {name}', plain: 'Plain' });
  assert.equal(t('greeting', { name: 'DSH' }), 'Hello DSH');
  assert.equal(t('plain'), 'Plain');
  assert.equal(t('missing.key'), 'missing.key');
  assert.equal(t('greeting', {}), 'Hello {name}', '缺少参数时保留占位符');
});

test('英文界面渲染关键标签（设置页）', () => {
  const Client = loadClient();
  const enT = english(Client);
  const current = mountSettings(Client, enT);
  const tree = current();
  const text = textsOf(tree);
  assert.match(text, /Connection/);
  assert.match(text, /Access mode/);
  assert.match(text, /API address/);
  assert.match(text, /API key/);
  assert.match(text, /Get models/);
  assert.match(text, /Save address and key/);
  assert.match(text, /Chat models/);
  assert.match(text, /Media models/);
  assert.doesNotMatch(text, /minimax_edit_image/);
  assert.equal(byLabel(tree, 'API address').props.value, 'https://api.minimax.io/v1');
  assert.equal(byLabel(tree, 'API key').props.type, 'password');
  assert.equal(hasCjk(text), false, '英文界面不应残留中文：' + text);
  // 展开对话模型表格：表头与操作按钮也走英文。
  buttonByText(tree, 'Chat models').props.onClick();
  const chat = textsOf(current());
  assert.match(chat, /Model ID/);
  assert.match(chat, /Display name/);
  assert.match(chat, /Reasoning effort/);
  assert.match(chat, /Save chat models/);
  assert.ok(byLabel(current(), 'Delete row 1'), '删除按钮的 aria-label 也是英文');
  assert.ok(byLabel(current(), 'Context 0'));
  assert.ok(byLabel(current(), 'Max output 0'));
  assert.equal(hasCjk(chat), false);
  // 展开媒体模型：字段名是英文，且仍是原来的 aria-label 语义。
  buttonByText(current(), 'Media models').props.onClick();
  const media = current();
  assert.match(textsOf(media), /Image generation/);
  assert.match(textsOf(media), /Speech generation/);
  assert.match(textsOf(media), /Music generation/);
  assert.ok(byLabel(media, 'Image generation'));
  assert.ok(byLabel(media, 'Music generation'));
  assert.equal(hasCjk(textsOf(media)), false);
});

test('中文回退界面保持原有文案（旧宿主/不传 t）', () => {
  const Client = loadClient();
  const current = mountSettings(Client, undefined);
  const text = textsOf(current());
  assert.match(text, /连接/);
  assert.match(text, /接入方式/);
  assert.match(text, /API 地址/);
  assert.match(text, /获取模型/);
  assert.match(text, /保存地址和密钥/);
  assert.match(text, /对话模型/);
  assert.match(text, /媒体模型/);
  assert.doesNotMatch(text, /minimax_edit_image/);
  buttonByText(current(), '对话模型').props.onClick();
  assert.match(textsOf(current()), /保存对话模型/);
  buttonByText(current(), '媒体模型').props.onClick();
  assert.match(textsOf(current()), /生成图片/);
  assert.match(textsOf(current()), /生成音乐/);
});

test('接入方式下拉列出五个选项，默认按量付费（国际）', () => {
  const Client = loadClient();
  const current = mountSettings(Client);
  const select = byLabel(current(), '接入方式');
  assert.equal(select.props.value, 'payg-global');
  const options = walk(select).filter(n => n.type === 'option').map(n => n.props.value);
  assert.deepEqual(options, ['payg-global', 'payg-cn', 'coding-global', 'coding-cn', 'custom']);
  assert.match(textsOf(current()), /按量付费（国际）/);
});

test('选接入方式会同时填入地址和协议；选自定义不清空已填的值', () => {
  const Client = loadClient();
  const current = mountSettings(Client);
  byLabel(current(), '接入方式').props.onChange({ target: { value: 'coding-cn' } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://api.minimax.cn/anthropic');
  assert.equal(byLabel(current(), 'API 协议').props.value, 'anthropic-messages');
  byLabel(current(), '接入方式').props.onChange({ target: { value: 'custom' } });
  assert.equal(byLabel(current(), 'API 地址').props.value, 'https://api.minimax.cn/anthropic', '选自定义不清空地址');
  assert.equal(byLabel(current(), 'API 协议').props.value, 'anthropic-messages', '选自定义不清空协议');
  assert.equal(byLabel(current(), '接入方式').props.value, 'custom');
});

test('en / zh 渲染工具卡片与媒体播放器', () => {
  const Client = loadClient();
  const enT = english(Client);

  const running = Client.exports.MinimaxToolCard({ toolName: 'minimax_generate_image', phase: 'running', t: enT });
  assert.match(textsOf(running), /MiniMax · Running minimax_generate_image/);

  const task = { id: 'task-1', kind: 'image', status: 'generating', model: 'image-01', progress: 42 };
  const block = { content: [{ type: 'text', text: JSON.stringify(task) }] };
  const result = Client.exports.MinimaxToolCard({ toolName: 'minimax_generate_image', phase: 'result', block, t: enT });
  const resultText = textsOf(result);
  assert.match(resultText, /Image/);
  assert.match(resultText, /Generating/);
  assert.match(resultText, /Task: task-1/);
  assert.match(resultText, /Progress snapshot: 42%/);
  assert.match(resultText, /minimax_media_status/);
  assert.equal(hasCjk(resultText), false);

  const saved = { id: 'task-2', kind: 'speech', status: 'saved', model: 'speech-02-hd', files: [{ path: 'C:/media/result-1.mp3', mime: 'audio/mpeg', size: 10 }] };
  const savedText = textsOf(Client.exports.MinimaxToolCard({ toolName: 'minimax_speak', phase: 'result', t: enT, block: { content: [{ type: 'text', text: JSON.stringify(saved) }] } }));
  assert.match(savedText, /result-1\.mp3/);
  assert.equal(/Saved|Task:|Progress snapshot|speech-02-hd/.test(savedText), false);

  const music = { id: 'task-3', kind: 'music', status: 'generating', model: 'music-01' };
  const musicText = textsOf(Client.exports.MinimaxToolCard({ toolName: 'minimax_generate_music', phase: 'result', t: enT, block: { content: [{ type: 'text', text: JSON.stringify(music) }] } }));
  assert.match(musicText, /Music/);
  assert.match(musicText, /minimax_media_status/);

  const catalog = Client.exports.MinimaxToolCard({ toolName: 'minimax_models', phase: 'result', t: enT, block: { content: [{ type: 'text', text: JSON.stringify({ models: [{ id: 'MiniMax-M2', category: 'chat' }, { id: 'image-01', category: 'image' }, { id: 'music-01', category: 'music' }] }) }] } });
  const catalogText = textsOf(catalog);
  assert.match(catalogText, /MiniMax model catalog · 3/);
  assert.match(catalogText, /Chat:/);
  assert.match(catalogText, /Images:/);
  assert.match(catalogText, /Music:/);

  const failed = Client.exports.MinimaxToolCard({ toolName: 'minimax_speak', phase: 'result', isError: true, block: { isError: true, content: [] }, t: enT });
  assert.match(textsOf(failed), /Call failed/);

  const zhCard = Client.exports.MinimaxToolCard({ toolName: 'minimax_speak', phase: 'result', block });
  assert.match(textsOf(zhCard), /任务：task-1/);
  assert.match(textsOf(zhCard), /生成中/);

  assert.match(textsOf(Client.exports.MediaPreview({ content: undefined, t: enT })), /Loading media file/);
  assert.match(textsOf(Client.exports.MediaPreview({ content: undefined })), /正在加载媒体文件/);
});

test('只读提供商页与摘要都有英文，provider id 是 minimax-byapi', () => {
  const Client = loadClient();
  const enT = english(Client);
  const form = { state: { value: { connection: { baseURL: 'https://gateway.example/v1' } } } };
  const detail = textsOf(Client.exports.MinimaxProviderNotice({ view: 'detail', form, t: enT }));
  assert.match(detail, /MiniMax provider/);
  assert.match(detail, /read-only/);
  assert.match(detail, /API address/);
  assert.match(detail, /API key/);
  assert.match(detail, /Plugins → dsh-minimax-byapi → MiniMax ByAPI/);
  assert.match(detail, /minimax-byapi/, 'provider id 显示 minimax-byapi');
  assert.match(detail, /Display name\s*MiniMax/, '显示名是 MiniMax');
  assert.doesNotMatch(detail, /xAI-CLIProxyAPI/);
  assert.equal(hasCjk(detail), false);
  assert.match(textsOf(Client.exports.MinimaxProviderNotice({ view: 'summary', t: enT })), /MiniMax provider \(read-only\)/);
  assert.match(textsOf(Client.exports.MinimaxProviderNotice({ view: 'summary' })), /MiniMax 提供商（只读）/);
  assert.match(detail, /https:\/\/gateway\.example\/v1/, '地址原样显示，不翻译');
});

test('apply 注册字典并把 locale 传给每个槽位，documentPreview 标题用绑定翻译', () => {
  const Client = loadClient();
  const enT = english(Client);
  const registered = [];
  const dictionaries = [];
  const binds = [];
  let previewOptions;
  const ctx = {
    slots: { inject: (name, fn) => { fn(); return () => {}; }, register: (options, component) => { registered.push({ options, component }); return () => {}; } },
    documentPreviews: { register: options => { previewOptions = options; return () => {}; } },
    remote: { marker: true },
    effect: fn => fn(),
    locale: {
      register: (ns, dicts) => { dictionaries.push({ ns, dicts }); return () => {}; },
      bind: ns => { binds.push(ns); return enT; },
    },
  };
  Client.exports.apply(ctx);

  assert.deepEqual(binds, ['minimaxByapi'], 'documentPreview 标题绑定 minimaxByapi 命名空间');
  assert.equal(dictionaries.length, 1, '字典只注册一次');
  assert.equal(dictionaries[0].ns, 'minimaxByapi');
  assert.deepEqual(Object.keys(dictionaries[0].dicts.zh).sort(), Object.keys(Client.exports.zh).sort());
  assert.deepEqual(Object.keys(dictionaries[0].dicts.en).sort(), Object.keys(Client.exports.en).sort());
  assert.ok(Client.exports.inject.includes('locale'), 'inject 声明 locale 服务');

  assert.equal(registered.length, 16, '插件配置 + 两个组件能力页 + 十二个工具卡片 + 媒体侧栏');
  for (const { options } of registered) assert.equal(options.locale, 'minimaxByapi', options.name + ' 声明 locale');
  assert.ok(registered.some(entry => entry.options.name === 'plugins.bundle.config'));
  assert.equal(previewOptions.title(), 'MiniMax media player');
});

test('旧宿主没有 ctx.locale 时 apply 不崩，槽位不带 locale 且标题回退中文', () => {
  const Client = loadClient();
  const registered = [];
  let previewOptions;
  const ctx = {
    slots: { inject: (name, fn) => { fn(); return () => {}; }, register: (options, component) => { registered.push(options); return () => {}; } },
    documentPreviews: { register: options => { previewOptions = options; return () => {}; } },
    remote: {},
    effect: fn => fn(),
  };
  assert.doesNotThrow(() => Client.exports.apply(ctx));
  assert.equal(registered.length, 16);
  for (const options of registered) assert.equal('locale' in options, false, '旧宿主不传 locale');
  assert.equal(previewOptions.title(), 'MiniMax 媒体播放');
});
