# 接入方式与两类 Key

本文说明 `dsh-minimax-byapi` 如何连接 MiniMax：接入方式预设、两种 Key 的差异、模型发现与模型状态。

## 接入方式预设

`connection.plan` 决定 API 地址与对话协议，切换预设会同时改写这两个字段。

| 预设 | 适用 | API 地址 | 对话协议 |
| --- | --- | --- | --- |
| `payg-global` | 按量付费，国际站 | `https://api.minimax.io/v1` | `openai-completions` |
| `payg-cn` | 按量付费，国内站 | `https://api.minimaxi.com/v1` | `openai-completions` |
| `coding-global` | M Plan 订阅，国际站 | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `coding-cn` | M Plan 订阅，国内站 | `https://api.minimaxi.com/anthropic` | `anthropic-messages` |
| `custom` | 自建网关或其他端点 | 留空手填 | `openai-completions`（可改） |

默认接入方式是 **`coding-cn`**（国内 M Plan + `anthropic-messages`），即首次打开就指向 `https://api.minimaxi.com/anthropic`。设置页把协议选择放在地址左边，改协议时会自动改写官方地址的路径。

对话协议可选 `openai-completions`、`openai-responses`、`anthropic-messages` 三种。走 Chat Completions 时插件使用 MiniMax 的兼容开关：`max_completion_tokens`（而非已废弃的 `max_tokens`）与 `reasoning_content` 思考字段；Responses 与 Anthropic 通道不接受这两个兼容开关，因此插件只在 `openai-completions` 下启用它们。

官方主机上地址前缀与协议是配对的：`/v1` 对应 OpenAI 兼容（`openai-completions` / `openai-responses`），`/anthropic` 对应 `anthropic-messages`。设置页切换协议时会自动把官方地址换成对应路径，并按「地址 + 协议」重新判定接入方式（两者都命中预设才算预设，否则标为 `custom`）；自建地址不会被改写。

**官方推荐 Anthropic 兼容通道**：文档标注「推荐」，SDK 示例也以 Anthropic 为主，而且它是唯一让思考深度走 `output_config.effort` 的通道。想用推荐默认值就选 `coding-global` / `coding-cn`，订阅 Key 与按量付费 Key 都能用。

> 国内两个官方域名等价：`api.minimaxi.com`（插件默认）与 `api.minimax.cn`（当前国内 OpenAPI 规范列出的域名）。对话、媒体与额度查询在两者上行为一致，需要另一个写法时用 `custom` 预设手填。

地址规整规则（`src/catalog.js` 的 `normalizeBaseURL`）：

- 只接受 HTTP(S)，不接受 URL 内嵌用户名密码、查询参数或片段；
- 非本机地址（`localhost` / `127.0.0.1` / `[::1]` 之外）必须使用 HTTPS；
- 路径为空则补 `/v1`，路径不是 `/v1` 或 `/anthropic` 结尾则追加 `/v1`。

媒体端点与对话通道的前缀无关：媒体统一挂在同一主机的 `{root}/v1/...` 与 `{root}/v2/...` 下，`/v1` 与 `/anthropic` 只影响对话路由。

## 两类 Key

MiniMax 签发两类凭据，插件在协议层不区分：

| | 按量付费 API Key | M Plan 订阅 Key |
| --- | --- | --- |
| 领取位置 | 账号 → API Keys | 计费 → M Plan |
| 前缀 | 常规 Key | `sk-cp-…` |
| 请求头 | `Authorization: Bearer <key>` | **完全相同** |
| 域名 | 与订阅 Key 相同 | 与按量付费 Key 相同 |
| 计费 | 扣账户余额 | 扣 M Plan 用量窗口，再扣积分，再扣余额 |
| 限流 | RPM / TPM 表 | 用量窗口（视频只看周窗口） |
| 模型档位 | 全部可用模型 | 由订阅档位决定 |

常见误解是「订阅 Key 与 API Key 不能互换」。官方说明的是**计费来源不同**，不是协议不同：同一个 `sk-cp-…` Key 请求头照样是 `Authorization: Bearer sk-cp-…`，照样能访问 `https://api.minimax.io/v1` 与 `https://api.minimax.io/anthropic`。

M Plan 专属错误码：`2056`（用量超限）、`2057`（该端点要求订阅 Key）、`2061`（当前档位不支持该模型）、`2062`（触发 M Plan 限流）、`2067`（用量超限且未开启积分自动抵扣）、`2068`（当前档位不支持该模型）。遇到这些码基本是账号档位或额度问题，不是插件配置问题。

## Key 的存放

- Key 存在 dsh 凭据服务，引用名 `MINIMAX_API_KEY`（可用 `connection.apiKeyEnv` 改名）。
- 配置文件里只有引用名，没有明文。设置页写入 Key 时也只落到凭据服务。
- `connection.apiKey` 是直填覆盖项，优先于凭据引用，仅用于本地测试；填了它等于把密钥留在配置里，正常使用请留空。
- Key 不会写进日志、任务记录或仓库。

## 模型发现

```
GET {root}/v1/models
Authorization: Bearer <key>
```

- 返回体是 OpenAI 兼容的 `{ data: [ { id, ... } ] }`，插件限制在 2000 条以内并按 2 MiB 上限读取。
- 发现结果与插件内置常量合并：内置的 `MiniMax-M3.1-Flash`、`MiniMax-M3` 以及图片、视频、语音、音乐模型常量都会补齐，因此发现接口只返回对话模型时，媒体模型依然在清单里。
- 分类顺序：内置常量 → 用户覆盖项（`modelOverrides`）→ 关键字兜底。
- 只有 `category === 'chat'` 的模型进入模型选择器；`modelOverrides` 里列出的 ID 会被排除，用来在设置页隐藏某个模型。
- 覆盖项可改：类别、显示名、是否支持图片、上下文长度、最大输出、思考档位。保存后需要重新发现一次才会生效。

内置的对话模型元数据：

| 模型 | 上下文 | 推荐输出 | 图片输入 | 思考档位 |
| --- | --- | --- | --- | --- |
| `MiniMax-M3.1-Flash` | 1,000,000 | 131,072 | 支持 | `low` / `medium` / `high` / `xhigh` / `max` |
| `MiniMax-M3` | 1,000,000 | 131,072 | 支持 | 自适应，无档位 |

## 模型状态

已退役、不再可调用：`MiniMax-M2`、`M2.1`、`M2.5`、`M2.7`、`M2.7-highspeed`、`M1`、`Text-01`、`VL-01`、`abab6.5`。

M Plan 用户访问已退役模型时会被服务端自动路由到 `MiniMax-M3.1-Flash`；按量付费账号则会收到「模型不存在 / 已下线」类错误（`2022` / `2069`）。

插件不把退役模型写进推荐清单，但内置常量里的音乐模型带 `retired` 标记，仅为存量付费账号保留。

## M Plan 额度查询

官方 FAQ 给出三种查用量的方式：控制台用量页、`mmx quota` CLI、以及 API：

```bash
curl 'https://www.minimax.io/v1/token_plan/remains' -H 'Authorization: Bearer <订阅 Key>'
```

- 主机是 **www**（`www.minimax.io` / `www.minimaxi.com` / `www.minimax.cn`），与对话用的 `api.*` 主机不同；插件按当前 API 地址推出对应 www 主机，自定义地址则直接报错。
- **必须用订阅 Key**；按量付费 Key 会被拒绝（那种计费没有 M Plan 额度）。
- 文本、图像、语音等非视频能力受 5 小时窗口 + 周窗口限制；视频只受周窗口限制；额度不结转。
- 上游没有公开字段表，`current_*_usage_count` 的语义在社区 issue 里被记为「剩余」而非「已用」。插件的 `normalizeQuota` 按剩余解析，遇到 `usage > total` 时回退成已用解读，并原样返回 `raw` 便于人工核对。

对应工具 `minimax_quota`，返回 `interval5h` / `weekly` 的 `total` / `remaining` / `used` / `percentRemaining` / `resetAt`，以及 `models[]`（服务端给拆分时）。

## 参考来源

- 快速准备与域名：<https://platform.minimax.io/docs/guides/quickstart-preparation.md>
- M Plan 与其他工具：<https://platform.minimax.io/docs/m-plan/other-tools.md>
- M Plan FAQ：<https://platform.minimax.io/docs/m-plan/faq.md>
- 模型列表：<https://platform.minimax.io/docs/api-reference/models/openai/list-models.md>
- 模型现状 FAQ：<https://platform.minimax.io/docs/faq/models.md>
- 错误码：<https://platform.minimax.io/docs/api-reference/errorcode.md>
- 限流：<https://platform.minimax.io/docs/guides/rate-limits.md>

更详细的原始调研记录见 [`minimax-api-notes.md`](minimax-api-notes.md)。
