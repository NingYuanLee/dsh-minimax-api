// MiniMax 模型目录。
// 事实来源：platform.minimax.io/docs/faq/models.md（当前可用与已退役模型）、
// platform.minimax.io/docs/api-reference/*（各能力的模型枚举）。
// 分类优先级：内置常量 → 用户覆盖项 → 关键字兜底。

const CATEGORIES = new Set(['chat', 'image', 'video', 'speech', 'music', 'research', 'unknown']);
const EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

// 当前可用的对话模型（官方 FAQ models.md）。
// reasoningEfforts 只给支持思考等级的模型：M3.1-Flash 固定开启思考且可调档，
// M3 用 adaptive 思考、不接受 effort，所以不声明档位。
export const CHAT_MODELS = [
  {
    id: 'MiniMax-M3.1-Flash', name: 'MiniMax M3.1 Flash',
    contextWindow: 1000000, maxTokens: 131072, input: ['text', 'image'],
    reasoningEfforts: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  {
    id: 'MiniMax-M3', name: 'MiniMax M3',
    contextWindow: 1000000, maxTokens: 131072, input: ['text', 'image'],
  },
];

// 媒体能力模型。发现接口未必列出这些模型，因此内置一份常量兜底。
export const MEDIA_MODELS = [
  { id: 'image-01', category: 'image', note: '文生图与图生图，支持 21:9 与指定宽高' },
  { id: 'image-01-live', category: 'image', note: '在 image-01 基础上额外支持画风设置（style），不支持 21:9' },
  { id: 'MiniMax-H3', category: 'video', note: 'v2 接口，768P/2K，4–15 秒' },
  { id: 'MiniMax-H3-Highspeed', category: 'video', note: 'v2 接口，480P/768P，4–15 秒' },
  { id: 'MiniMax-H3-Lite', category: 'video', note: 'v2 接口，480P/768P，4–15 秒，不支持 adaptive 画幅' },
  { id: 'MiniMax-H3-Max', category: 'video', note: 'v2 接口，480P/768P，5–15 秒' },
  { id: 'MiniMax-Hailuo-2.3', category: 'video', note: 'v1 接口，6 或 10 秒' },
  { id: 'MiniMax-Hailuo-2.3-Fast', category: 'video', note: 'v1 接口，6 或 10 秒，仅图生视频' },
  { id: 'MiniMax-Hailuo-02', category: 'video', note: 'v1 接口，6 或 10 秒' },
  { id: 'speech-2.8-hd', category: 'speech' },
  { id: 'speech-2.8-turbo', category: 'speech' },
  { id: 'speech-2.6-hd', category: 'speech' },
  { id: 'speech-2.6-turbo', category: 'speech' },
  { id: 'speech-02-hd', category: 'speech' },
  { id: 'speech-02-turbo', category: 'speech' },
  // 音乐模型官方已全部退役，且 2026-08-20 起不再向新用户开放；保留给存量付费账号。
  { id: 'music-3.0', category: 'music', retired: true, note: '已退役，仅存量付费账号可用' },
  { id: 'music-2.6', category: 'music', retired: true, note: '已退役，仅存量付费账号可用' },
  { id: 'music-cover', category: 'music', retired: true, note: '已退役，仅存量付费账号可用' },
];

const MEDIA_BY_ID = new Map(MEDIA_MODELS.map(row => [row.id, row]));

// 接入方式预设：订阅 Key（M Plan）与按量付费 Key 用同一套协议，差别只在地址、模型档位与计费。
export const PLAN_PRESETS = {
  'payg-global': { baseURL: 'https://api.minimax.io/v1', api: 'openai-completions' },
  'payg-cn': { baseURL: 'https://api.minimax.cn/v1', api: 'openai-completions' },
  'coding-global': { baseURL: 'https://api.minimax.io/anthropic', api: 'anthropic-messages' },
  'coding-cn': { baseURL: 'https://api.minimax.cn/anthropic', api: 'anthropic-messages' },
  custom: { baseURL: '', api: 'openai-completions' },
};

// 默认接入方式：国内 M Plan + Anthropic 兼容（官方推荐通道）。
export const DEFAULT_PLAN = 'coding-cn';

export function defaultReasoningEfforts(id) {
  const found = CHAT_MODELS.find(model => model.id === id);
  return found?.reasoningEfforts ? Object.keys(found.reasoningEfforts) : [];
}

// MiniMax 的对话模型都支持图片输入。
export function defaultImageSupported(id) {
  return CHAT_MODELS.some(model => model.id === id);
}

export function defaultContextWindow(id) {
  return CHAT_MODELS.find(model => model.id === id)?.contextWindow ?? 1000000;
}

export function defaultMaxTokens(id) {
  return CHAT_MODELS.find(model => model.id === id)?.maxTokens ?? 131072;
}

// 聊天地址可能是根地址、/v1 或 /anthropic 三种形态，统一规整成可拼接的根地址。
export function normalizeBaseURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址必须是无凭据、查询参数和片段的 HTTP(S) 根地址');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('非本机 API 地址必须使用 HTTPS');
  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/') url.pathname = '/v1';
  else if (!/\/(v1|anthropic)$/.test(path)) url.pathname = path + '/v1';
  return url.href.replace(/\/$/, '');
}

// 媒体端点都在同一主机下（{root}/v1/...、{root}/v2/...），与对话通道的 /v1、/anthropic 前缀无关。
export function apiRootOf(baseURL) {
  const url = new URL(baseURL);
  const path = url.pathname.replace(/\/+$/, '').replace(/\/(v1|anthropic)$/, '');
  url.pathname = path;
  return url.href.replace(/\/$/, '');
}

function positive(value) { return Number.isSafeInteger(value) && value > 0 ? value : undefined; }

const HOME = process.env.HOME || process.env.USERPROFILE || '';

// 结果保存目录：支持 ~ 与 %VAR% / ${VAR} / $VAR 写法，用户可以直接粘贴 Windows 路径。
export function expandPath(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/^~(?=$|[\\/])/, HOME)
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (whole, name) => process.env[name] ?? whole)
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name) => process.env[name] ?? whole)
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name) => process.env[name] ?? whole);
}

function categoryOf(id) {
  const known = MEDIA_BY_ID.get(id);
  if (known) return known.category;
  const key = id.toLowerCase();
  if (key.includes('image')) return 'image';
  if (key.includes('video') || key.includes('hailuo') || /^t2v|^i2v|^s2v|^-/.test(key)) return 'video';
  if (key.includes('speech') || key.includes('tts') || key.includes('voice') || key.includes('asr')) return 'speech';
  if (key.includes('music')) return 'music';
  return 'chat';
}

export function classifyModel(raw, override = {}) {
  const id = typeof raw === 'string' ? raw : raw?.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('无效模型 ID');
  const known = MEDIA_BY_ID.get(id);
  const chat = CHAT_MODELS.find(model => model.id === id);
  // 只要给了覆盖项（不限于 category）就算显式配置，便于界面标出"已配"。
  const overridden = Object.keys(override).length > 0;
  const source = overridden ? 'override' : (known || chat) ? 'known-rule' : 'keyword';
  let category = categoryOf(id);
  if (override.category) {
    if (!CATEGORIES.has(override.category)) throw new Error('无效模型类别');
    category = override.category;
  }
  const spec = typeof raw === 'object' && raw !== null ? raw : {};
  const efforts = Array.isArray(override.reasoningEfforts) ? override.reasoningEfforts : defaultReasoningEfforts(id);
  if (!Array.isArray(efforts) || efforts.some(x => !EFFORTS.has(x))) throw new Error('无效思考等级');
  const upstreamInput = spec.inputModalities ?? spec.input_modalities ?? spec.modalities;
  const defaultInput = Array.isArray(upstreamInput) ? upstreamInput : (defaultImageSupported(id) ? ['text', 'image'] : ['text']);
  const input = typeof override.imageSupported === 'boolean'
    ? (override.imageSupported ? [...new Set(['text', 'image', ...defaultInput.filter(x => x !== 'text')])] : ['text'])
    : (override.input ?? defaultInput);
  if (!Array.isArray(input) || input.length === 0 || input.some(x => !['text', 'image'].includes(x))) throw new Error('无效输入模态');
  return {
    id, name: override.displayName || override.name || spec.name || chat?.name || id,
    category, source,
    verified: false,
    retired: Boolean(known?.retired),
    // 能力备注会出现在工具描述里（例如 image-01-live 仅支持图生图、音乐模型已退役）。
    note: override.note || known?.note || '',
    contextWindow: positive(override.contextWindow) ?? positive(spec.contextWindow) ?? positive(spec.context_window) ?? (chat ? chat.contextWindow : defaultContextWindow(id)),
    maxTokens: positive(override.maxTokens) ?? positive(spec.maxTokens) ?? positive(spec.max_output_tokens) ?? (chat ? chat.maxTokens : defaultMaxTokens(id)),
    input, reasoningEfforts: efforts,
  };
}

// 发现结果 + 内置常量合并成完整清单。发现接口只列出对话模型时，媒体模型由常量补齐。
export function readCatalog(body, overrides = []) {
  const byId = new Map(overrides.map(x => [x.id, x]));
  const seen = new Set();
  const rows = [];
  const push = raw => {
    if (!raw?.id || seen.has(raw.id)) return;
    seen.add(raw.id);
    rows.push(classifyModel(raw, byId.get(raw.id)));
  };
  if (body && Array.isArray(body.data)) {
    if (body.data.length > 2000) throw new Error('模型接口必须返回有界的 data 数组');
    for (const raw of body.data) push(raw);
  }
  for (const model of CHAT_MODELS) push({ id: model.id, name: model.name });
  for (const model of MEDIA_MODELS) push({ id: model.id });
  return rows;
}

// 模型选择器只显示对话模型。用户没配置模型表时给出内置的两款对话模型。
export function chatModels(catalog, overrides = []) {
  const selected = new Set(overrides.map(row => row?.id).filter(Boolean));
  const rows = catalog.filter(x => x.category === 'chat' && (!selected.size || selected.has(x.id)));
  return rows.map(x => ({
    id: x.id, name: x.name, contextWindow: x.contextWindow, maxTokens: x.maxTokens, input: x.input,
    ...(x.reasoningEfforts.length ? { reasoningEfforts: Object.fromEntries(x.reasoningEfforts.map(e => [e === 'none' ? 'off' : e, e === 'none' ? null : e])) } : {}),
  }));
}
