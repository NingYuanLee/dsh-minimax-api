import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyModel, normalizeBaseURL, apiRootOf, readCatalog, chatModels, expandPath } from '../src/catalog.js';

test('发现结果与内置常量合并，媒体模型不会进入对话清单', () => {
  const catalog = readCatalog({ data: [{ id: 'MiniMax-M3.1-Flash' }, { id: 'image-01' }] });
  const ids = catalog.map(x => x.id);
  assert.ok(ids.includes('MiniMax-M3.1-Flash'));
  assert.ok(ids.includes('MiniMax-M3'), '内置对话模型应补齐');
  assert.ok(ids.includes('image-01'), '内置媒体模型应补齐');
  assert.ok(catalog.every(x => x.verified === false));
  assert.equal(catalog.find(x => x.id === 'image-01').category, 'image');
  for (const id of ['MiniMax-H3-Image', 'MiniMax-H3-Image-Highspeed']) {
    assert.equal(catalog.find(x => x.id === id)?.category, 'image', id + ' 应内置为图片模型');
    assert.match(catalog.find(x => x.id === id)?.note || '', /H3|参考图/);
  }
  assert.equal(catalog.find(x => x.id === 'MiniMax-Hailuo-2.3').category, 'video');
  assert.equal(catalog.find(x => x.id === 'speech-02-hd').category, 'speech');
  assert.equal(catalog.find(x => x.id === 'music-3.0').category, 'music');
  assert.equal(catalog.find(x => x.id === 'music-3.0').retired, true, '音乐模型官方已退役');
  // 官方视频 v2 共四个 H3 变体
  for (const id of ['MiniMax-H3', 'MiniMax-H3-Highspeed', 'MiniMax-H3-Lite', 'MiniMax-H3-Max']) {
    assert.equal(catalog.find(x => x.id === id)?.category, 'video', id + ' 应归入视频类');
  }
  // image-01-live 同时支持文生图与图生图，备注不能写成「仅图生图」
  assert.match(catalog.find(x => x.id === 'image-01-live').note, /画风|style/);
  assert.doesNotMatch(catalog.find(x => x.id === 'image-01-live').note, /仅支持图生图/);
  // 只有对话模型进入模型选择器
  assert.deepEqual(chatModels(catalog).map(x => x.id), ['MiniMax-M3.1-Flash', 'MiniMax-M3']);
  assert.deepEqual(chatModels(catalog, [{ id: 'MiniMax-M3' }]).map(x => x.id), ['MiniMax-M3']);
});

test('显式覆盖支持未来模型，且不伪造验证状态', () => {
  const c = readCatalog({ data: [{ id: 'future' }, { id: 'future' }] }, [{ id: 'future', category: 'chat', contextWindow: 10000, reasoningEfforts: ['low'] }]);
  assert.equal(c.filter(x => x.id === 'future').length, 1, '重复的上游条目只保留一份');
  const future = c.find(x => x.id === 'future');
  assert.equal(future.source, 'override');
  assert.equal(future.verified, false);
  assert.equal(chatModels(c, [{ id: 'future' }])[0].contextWindow, 10000);
});

test('地址规整：根地址补 /v1，保留 /anthropic 与部署前缀', () => {
  assert.equal(normalizeBaseURL('https://api.minimax.io'), 'https://api.minimax.io/v1');
  assert.equal(normalizeBaseURL('https://api.minimax.io/'), 'https://api.minimax.io/v1');
  assert.equal(normalizeBaseURL('https://api.minimax.cn/v1/'), 'https://api.minimax.cn/v1');
  assert.equal(normalizeBaseURL('https://api.minimax.io/anthropic'), 'https://api.minimax.io/anthropic');
  assert.equal(normalizeBaseURL('http://127.0.0.1:8317/'), 'http://127.0.0.1:8317/v1');
  for (const u of ['http://example.com', 'https://key@example.com', 'https://example.com?key=x', 'file:///tmp']) assert.throws(() => normalizeBaseURL(u));
});

test('媒体根地址去掉 /v1 与 /anthropic 前缀', () => {
  assert.equal(apiRootOf('https://api.minimax.io/v1'), 'https://api.minimax.io');
  assert.equal(apiRootOf('https://api.minimax.io/anthropic'), 'https://api.minimax.io');
  assert.equal(apiRootOf('https://api.minimax.cn/v1'), 'https://api.minimax.cn');
  assert.equal(apiRootOf('https://gw.example.com/proxy/v1'), 'https://gw.example.com/proxy');
});

test('畸形元数据与非法覆盖项提前失败', () => {
  assert.throws(() => classifyModel('x', { category: 'garbage' }));
  assert.throws(() => classifyModel('x', { input: ['audio'] }));
  assert.throws(() => classifyModel('', {}));
});

test('官方对话模型参数：100 万上下文、131072 输出、图片输入、思考档位', () => {
  const flash = classifyModel({ id: 'MiniMax-M3.1-Flash' });
  assert.deepEqual(flash.input, ['text', 'image']);
  assert.equal(flash.contextWindow, 1000000);
  assert.equal(flash.maxTokens, 131072);
  assert.deepEqual(flash.reasoningEfforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  const m3 = classifyModel({ id: 'MiniMax-M3' });
  assert.deepEqual(m3.input, ['text', 'image']);
  assert.equal(m3.contextWindow, 1000000);
  assert.deepEqual(m3.reasoningEfforts, [], 'M3 用自适应思考，不声明 effort 档位');
});

test('三个可配置项：图片支持、上下文大小、最大输出 token', () => {
  const flash = classifyModel({ id: 'MiniMax-M3.1-Flash' });
  // imageSupported:false 只关图片，文本保留
  assert.deepEqual(classifyModel({ id: 'MiniMax-M3.1-Flash' }, { imageSupported: false }).input, ['text']);
  // imageSupported:true 打开图片
  assert.deepEqual(classifyModel({ id: 'future-model' }, { imageSupported: true }).input, ['text', 'image']);
  // 上下文与最大输出可覆盖，并进入对话模型清单
  const tuned = readCatalog({ data: [{ id: 'MiniMax-M3.1-Flash' }] }, [{ id: 'MiniMax-M3.1-Flash', imageSupported: false, contextWindow: 200000, maxTokens: 64000 }]);
  assert.equal(tuned[0].source, 'override');
  const chat = chatModels(tuned, [{ id: 'MiniMax-M3.1-Flash' }])[0];
  assert.deepEqual(chat.input, ['text']);
  assert.equal(chat.contextWindow, 200000);
  assert.equal(chat.maxTokens, 64000);
  const flashChat = chatModels([classifyModel({ id: 'MiniMax-M3.1-Flash' })], [{ id: 'MiniMax-M3.1-Flash' }])[0];
  assert.equal(flashChat.reasoningEfforts.xhigh, 'xhigh');
  assert.equal(flashChat.reasoningEfforts.max, 'max');
});

test('上游自报的 inputModalities 仍被尊重，显式开关优先', () => {
  const upstream = classifyModel({ id: 'future-model', inputModalities: ['text', 'image'] });
  assert.deepEqual(upstream.input, ['text', 'image']);
  assert.deepEqual(classifyModel({ id: 'future-model', inputModalities: ['text', 'image'] }, { imageSupported: false }).input, ['text']);
  assert.deepEqual(classifyModel({ id: 'future-model', inputModalities: ['text'] }, { imageSupported: true }).input, ['text', 'image']);
});

test('结果保存目录支持 ~ 与环境变量写法', () => {
  process.env.MINIMAX_TEST_DIR = 'D:\\minimax-out';
  assert.equal(expandPath(''), '');
  assert.equal(expandPath('  '), '');
  assert.equal(expandPath('%MINIMAX_TEST_DIR%\\img'), 'D:\\minimax-out\\img');
  assert.equal(expandPath('$MINIMAX_TEST_DIR'), 'D:\\minimax-out');
  assert.equal(expandPath('${MINIMAX_TEST_DIR}\\a'), 'D:\\minimax-out\\a');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  assert.equal(expandPath('~/pics'), home + '/pics');
  // 未定义的变量保持原样，便于用户看出写错了
  assert.equal(expandPath('%NOT_SET_VAR_XYZ%\\a'), '%NOT_SET_VAR_XYZ%\\a');
  delete process.env.MINIMAX_TEST_DIR;
});
