# dsh-minimax-byapi

为 DeepSeek Harness 接入原生 MiniMax：既可以用订阅 Key（M Plan）也可以用按量付费 API Key 对话，并提供基于官方 MiniMax API 的生图、视频、语音、语音转文字与音乐工具。

[![CI](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml/badge.svg)](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml) [![CI](https://img.shields.io/github/actions/workflow/status/NingYuanLee/dsh-minimax-byapi/ci.yml?label=CI)](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/dsh-minimax-byapi.svg)](https://www.npmjs.com/package/dsh-minimax-byapi) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![Node >=22.19](https://img.shields.io/badge/node-%3E%3D22.19.0-339933.svg)](#兼容性与限制) [![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.2%20%3C0.3.0--0%20%7C%7C%20%3E%3D0.2.2--0%20%3C0.3.0--0-6f42c1)](#兼容性与限制) [![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-6f42c1.svg)](https://github.com/topics/dsh-plugin) [![powered by dsh](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

[English](README.md) | 中文

> **已发布到 npm。** `dsh plugin add dsh-minimax-byapi` 安装已发布的包；git clone 或本地目录同样可用 —— 见[安装](#安装)。

一个插件，一条 MiniMax 连接。对话模型出现在模型选择器里；图片、视频、语音、音乐模型不进入选择器，而是通过工具调用。任何对话模型 —— MiniMax 或其他厂商 —— 都能调用这些工具。插件只访问 MiniMax 官方开放平台，把 API Key 存在 dsh 凭据服务里，生成的媒体保存在本地。它不是 OAuth 客户端，不提供账号与配额，也不读取任何 MiniMax 命令行令牌。

## 能力概览

| 方面 | 当前范围 |
| --- | --- |
| 对话提供方 | 注册原生 dsh LLM 提供方：路由 `minimax-byapi`，显示名 **MiniMax**。流式文本与工具调用走官方 pi-ai 适配器，可选 OpenAI 兼容或 Anthropic 兼容通道。 |
| 模型清单 | `GET {root}/v1/models` 发现，与插件内置的模型常量合并，自动分类为 chat / image / video / speech / music / research / unknown。只有对话模型进入选择器。支持按模型覆盖。 |
| 接入方式 | 五种：按量付费（国际 / 国内）与 M Plan 订阅（国际 / 国内），以及自定义地址。切换预设会同时填好 API 地址与对话协议。 |
| 设置页 | 接入方式、API 地址、API Key、密钥自检、超时、对话模型表（模型选择器的唯一来源）与媒体模型选择。文案跟随 dsh 语言（英文或中文）。 |
| 媒体任务持久化 | 媒体任务按会话隔离，重启后仍在。下载先写 `.part` 临时文件再改名。下载失败可以只重试下载，不重新生成，不会重复计费。 |
| 结果呈现 | 工具结果卡片、文件预览，以及 MP4 / MP3 / WAV 的侧栏播放器。卡片与播放器跟随 dsh 语言。 |

插件注册两个组件：`minimax-byapi`（对话、模型清单、设置页）与 `dsh-minimax-media`（媒体工具），合计 13 个工具：

| 工具 | 作用 |
| --- | --- |
| `minimax_models` | 刷新模型清单，按能力分组返回。可选 `verify_key` 用一次 `GET /v1/models` 校验地址与密钥。 |
| `minimax_quota` | 查询 M Plan 额度余量与重置时间（5 小时窗口与周窗口）。只支持订阅 Key，按量付费 Key 会被拒绝。 |
| `minimax_generate_image` | 文生图：`prompt`，可选 `model`、宽高比、`n`（1–9，默认 1）、`image-01-live` 的画风设置。 |
| `minimax_edit_image` | 图生图：`prompt` 加一张参考图（`subject_reference`）。 |
| `minimax_generate_video` | 文生视频。V2 模型（MiniMax-H3 系列）4–15 秒；V1 模型（Hailuo 系列）6 秒或 10 秒。 |
| `minimax_list_voices` | 查询当前账号可用的 `voice_id`（`system` / `voice_cloning` / `voice_generation` / `all`）。 |
| `minimax_speak` | 同步文字转语音：`text` 最多 10000 字，可选 `model`、`voice_id`、语速、音量、音高、情绪与格式。 |
| `minimax_speak_long` | 异步长文本语音：`text` 最多 100000 字，返回任务 id，用 `minimax_media_status` 取回。 |
| `minimax_transcribe` | 语音转文字：上传音频文件并返回转写文本。 |
| `minimax_generate_music` | 文本生成音乐。官方已退役 —— 见[音乐能力已退役](#音乐能力已退役)。 |
| `minimax_media_list` | 列出当前会话创建过的媒体任务。 |
| `minimax_media_status` | 查询任务状态并在结果就绪时下载保存：`task_id`。 |
| `minimax_media_retry_download` | 重试下载失败的结果，不重新生成：`task_id`。 |

不提供：实时语音对话（音频进 / 音频出）、语音克隆、声音设计、MiniMax 服务端联网搜索工具，以及实时任务看板。视频任务提交后在进程内轮询，但结果卡片是快照、不会自行刷新 —— 需要用 `minimax_media_status` 取回成片。模型分类基于规则，不构成保证。

## 兼容性与限制

| 组件 | 要求 | 已验证情况 |
| --- | --- | --- |
| dsh | `engines.dsh` 要求 `>=0.2.1-rc.2 <0.3.0-0 \|\| >=0.2.2-0 <0.3.0-0` | 已在 `0.2.2-rc.1` 的独立 Web profile 实测安装、加载、两个组件运行与设置页渲染；对话与媒体调用仍需真实 Key —— 见 [VALIDATION.md](VALIDATION.md) |
| Node.js | `>=22.19.0` | CI 在 Linux 与 Windows 上跑 Node 22.19 与 24 |
| MiniMax | 官方开放平台，国际 `api.minimax.io` 或国内 `api.minimaxi.com` / `api.minimax.cn` | 对话已用真实 Key 在国内 M Plan 路线实测跑通；媒体端点仅依据官方文档 —— 见 [VALIDATION.md](VALIDATION.md) |
| 其他 dsh 0.2.x | 在 `engines.dsh` 区间内 | 未逐版本验证 |

`engines.dsh` 是兼容性闸门；`peerDependencies` 只固定源码用到的 SDK 包，不决定兼容性，dsh 升级后需要重跑集成测试。

## 连接方式与两种 Key

MiniMax 签发两类凭据，插件在协议层把它们同等对待：

| | 按量付费 API Key | M Plan 订阅 Key |
| --- | --- | --- |
| 前缀 | 常规 Key | `sk-cp-…` |
| 请求头 | `Authorization: Bearer <key>` | **完全相同** —— `Authorization: Bearer sk-cp-…` |
| 域名 | 相同域名 | 相同域名 |
| 计费 | 扣账户余额 | 扣 M Plan 额度，再扣积分，再扣余额 |
| 可用模型档位 | 全部可用模型 | 由订阅档位决定哪些模型可调 |

两类 Key 使用同一套协议，差别只在计费来源与可用模型档位。插件把 Key 存在 dsh 凭据服务中，引用名固定为 `MINIMAX_API_KEY`，配置里不落明文。

国内两个官方域名等价：`api.minimaxi.com`（预设默认）与 `api.minimax.cn`（当前国内 OpenAPI 规范列出的域名）。对话、媒体与额度查询在两者上行为一致；需要另一个写法时用 `custom` 手填。

### 接入方式

`connection.plan` 会同时填好 API 地址与对话协议：

| 预设 | API 地址 | 对话协议 |
| --- | --- | --- |
| `payg-global` —— 按量付费（国际） | `https://api.minimax.io/v1` | `openai-completions` |
| `payg-cn` —— 按量付费（国内） | `https://api.minimaxi.com/v1` | `openai-completions` |
| `coding-global` —— M Plan（国际） | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `coding-cn` —— M Plan（国内） | `https://api.minimaxi.com/anthropic` | `anthropic-messages` |
| `custom` —— 自定义地址 | 空 | `openai-completions` |

官方主机上地址与协议是配对的：`/v1` 说 OpenAI 兼容，`/anthropic` 说 Anthropic 兼容。在设置页切换协议会自动把地址改成对应路径，切换接入方式则两者一起填；自定义地址不会被改写。

设置页默认就是 **`coding-cn` + `anthropic-messages`**，即新装好就指向 `https://api.minimaxi.com/anthropic`——国内 M Plan 走官方推荐协议。协议选择在地址左边，改协议时地址会跟着换。

**官方推荐 Anthropic 兼容通道**（文档里标注「推荐」，SDK 示例也以它为主）。它用同一把 Bearer Key 提供同样两款模型，而且是唯一让思考深度走 `output_config.effort` 的通道。想按推荐默认值用，选 `coding-global` / `coding-cn`；两类 Key 在这条通道上都能用。

### M Plan 额度

`minimax_quota` 调用 `GET https://www.minimax.io/v1/token_plan/remains`（国内为 `https://www.minimax.cn/v1/token_plan/remains`），返回 5 小时滚动窗口与周窗口的余量、已用量与重置时间；服务端给出按模型拆分时也会一并返回。

- **只有订阅 Key 能查。** 按量付费 Key 会被服务端拒绝，工具会如实说明，而不是静默失败。
- 文本、图像、语音等非视频能力同时受两个窗口限制；视频模型只受周窗口限制；未用完的额度不结转。
- 上游没有公开字段表：MiniMax 的 issue 记录指出 `current_*_usage_count` 返回的是**剩余**而不是已用。插件按「剩余」解析，若该数值大于 total 则回退成「已用」解读。最终以 MiniMax 控制台用量页为准。
- 额度按需读取，不做轮询也不缓存。

## 安装

**从 npm 安装（推荐）：**

```powershell
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add dsh-minimax-byapi
```

**从 git 安装：**

```powershell
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add "git+https://github.com/NingYuanLee/dsh-minimax-byapi.git"
```

**从本地目录安装（开发）：**

```powershell
git clone https://github.com/NingYuanLee/dsh-minimax-byapi.git
cd dsh-minimax-byapi
npm install --ignore-scripts
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add "$PWD"   # bash/zsh: "$(pwd)"
```

`--dump-config` 会基于默认 profile 创建新 profile 并打印合并后的配置，不会启动服务。`dsh plugin add` 会把该 bundle 记录到 profile 里，不需要手改 YAML。本包没有 `prepare` 或 `postinstall` 脚本，安装过程不执行任何构建代码，也不需要 `allowBuilds` 条目。

用该 profile 启动 dsh：

```powershell
dsh --profile minimax-test --no-open
```

建议先放在独立 profile 里试用，把提供方、工具和设置隔在日常环境之外。想完全隔离，可以把 `DSH_HOME` 指向一个临时目录。

## 更新与卸载

git 安装的更新方式是先移除再添加新提交；本地目录安装用 `git pull` 加 `npm install --ignore-scripts`；npm 安装在移除并重新添加插件后取到新版本。之后重启 dsh。

```powershell
dsh plugin --profile minimax-test remove dsh-minimax-byapi
```

卸载会把插件的各层从 profile 中移除：提供方、13 个工具和设置页都会消失。但**已生成的媒体与任务记录不会被删除，凭据也不会被删除**。要清掉文件请自行删除数据目录：

```powershell
Remove-Item -Recurse -Force "$env:DSH_HOME\plugins\dsh-minimax-byapi"
```

不再需要的话，请一并删除 dsh 中的凭据。

## 配置

常规设置请用插件设置页。也可以在 profile 的 `cordis.patch.yml` 里手写配置，但并非必需：

```yaml
- id: minimax-byapi
  name: dsh-minimax-byapi
  config:
    connection:
      plan: coding-cn
      baseURL: https://api.minimaxi.com/anthropic
      api: anthropic-messages
      apiKeyEnv: MINIMAX_API_KEY
      verify: true
      timeoutMs: 60000
    media:
      imageModel: image-01
      videoModel: MiniMax-H3
      speechModel: speech-2.8-hd
      musicModel: ''
      dataDir: ''
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `connection.plan` | `coding-cn` | 接入方式：`payg-global`、`payg-cn`、`coding-global`、`coding-cn`、`custom`，用于填 `baseURL` 与 `api`。默认是国内 M Plan + 官方推荐的 Anthropic 兼容。 |
| `connection.baseURL` | `https://api.minimaxi.com/anthropic` | API 地址。非本机地址必须使用 HTTPS，路径会被规整成 `/v1` 或 `/anthropic`。 |
| `connection.apiKey` | 空 | 直接填写调用密钥，优先于凭据引用。仅供本地测试，正常使用请留空。 |
| `connection.apiKeyEnv` | `MINIMAX_API_KEY` | dsh 凭据服务中的引用名。 |
| `connection.api` | `anthropic-messages` | 对话协议：`openai-completions`、`openai-responses` 或 `anthropic-messages`。 |
| `connection.verify` | `true` | 保存设置时用已保存的密钥校验一次 `GET {root}/v1/models`。 |
| `connection.timeoutMs` | `60000` | 单次请求超时（毫秒，1000–600000）。 |
| `media.imageModel` | 空 | 调用未指定 `model` 时使用的图片模型。 |
| `media.videoModel` | 空 | 调用未指定 `model` 时使用的视频模型。 |
| `media.speechModel` | 空 | 调用未指定 `model` 时使用的语音合成模型。 |
| `media.musicModel` | 空 | 调用未指定 `model` 时使用的音乐模型。官方已退役，只有存量付费账号可调用。 |
| `media.dataDir` | 空 | 媒体输出目录；留空表示 `$DSH_HOME/plugins/dsh-minimax-byapi`。 |
| `modelOverrides` | `[]` | 设置页写入的按模型覆盖项：类别、显示名、图片支持、上下文长度、最大输出、思考等级。下次刷新时生效。 |

`connection`、`media` 与 `modelOverrides` 是 volatile 配置段：保存后 dsh 会重新加载插件层并重新发现模型清单。

设置页会把 API Key 写进 dsh 凭据服务（使用上面的引用名），配置里只保留引用。不要把 Key 手写进 YAML。

## 能力说明

### 对话模型

| 模型 | 上下文 | 推荐输出 | 图片输入 | 思考 |
| --- | --- | --- | --- | --- |
| `MiniMax-M3.1-Flash` | 1,000,000 | 131,072 | 支持 | 常开，档位 `low` / `medium` / `high` / `xhigh` / `max` |
| `MiniMax-M3` | 1,000,000 | 131,072 | 支持 | 自适应，不接受档位参数 |

已退役、不再可调用：`MiniMax-M2`、`M2.1`、`M2.5`、`M2.7`、`M2.7-highspeed`、`M1`、`Text-01`、`VL-01`、`abab6.5`。M Plan 用户会被自动路由到 `MiniMax-M3.1-Flash`。

### 文本模型参数

MiniMax 的文本参数由插件映射到 dsh 本来就负责这些参数的位置。这些参数按请求生效，所以控制入口是 dsh 的模型选择器与插件设置页的模型表，而不是另外一张表单：

| MiniMax 参数 | 插件怎么处理 | 在哪里控制 |
| --- | --- | --- |
| `max_completion_tokens`（Chat Completions）/ `max_tokens`（Anthropic）/ `max_output_tokens`（Responses） | 按所选协议把输出上限写到对应字段；不会下发已废弃的 `max_tokens`（Chat Completions 下） | dsh 每次调用决定上限；模型表的「最大输出」列是目录默认值（推荐 131072，上限 524288） |
| `reasoning_effort`（Chat Completions） | 以 `reasoning_effort` 下发 `low` / `medium` / `high` / `xhigh` / `max`；未选档位时不下发，交给服务端默认值（`max`） | 模型选择器里的推理等级；可选档位来自模型表的思考列 |
| `output_config.effort`（Anthropic 兼容） | 以 `output_config.effort` 下发同样的五个档位 | 同一个推理等级 |
| `thinking` | 只会下发 `adaptive`。Anthropic 通道强制自适应思考，因为 pi-ai 默认会发 `type: "enabled"` + `budget_tokens` 的 Anthropic 原生形式，MiniMax 不接受 | 隐式：`MiniMax-M3.1-Flash` 始终思考；`MiniMax-M3` 在选了档位时思考，否则沿用服务端默认 |
| `reasoning_content` | 作为模型的思考通道解析；不下发开关（`reasoning_split` 默认就是拆分形态） | 只读 |
| `temperature` / `top_p` | 不作为可调项下发；MiniMax 本来也忽略这两个值（固定 1 与 0.95） | 不可用 —— 上游会忽略 |
| `service_tier`、`reasoning_split`、文本接口的 `seed` | 未暴露：适配器没有对应字段 | 不可用 |

两条通道的差异需要知道：`MiniMax-M3` 在 OpenAI 兼容通道默认自适应思考，在 Anthropic 兼容通道默认不思考；`MiniMax-M3.1-Flash` 在两条通道都拒绝 `thinking: disabled`。插件因此从不下发「关闭思考」的请求。

模型清单由 `GET {root}/v1/models` 与插件内置常量合并得到，因此即使发现接口只返回对话模型，媒体模型也仍然在列。设置页的模型表就是模型选择器看到的内容 —— 删掉一行并保存即可隐藏该模型。

### 媒体模型

| 能力 | 模型 |
| --- | --- |
| 图片 | `image-01`（文生图与图生图）、`image-01-live`（同样支持文生图与图生图，另有画风设置） |
| 视频（v2 接口） | `MiniMax-H3`（768P / 2K，4–15 秒）、`MiniMax-H3-Highspeed`（480P / 768P，4–15 秒）、`MiniMax-H3-Lite`（480P / 768P，4–15 秒，不支持 `adaptive` 画幅）、`MiniMax-H3-Max`（480P / 768P，5–15 秒） |
| 视频（v1 接口） | `MiniMax-Hailuo-2.3`、`MiniMax-Hailuo-2.3-Fast`（仅图生视频）、`MiniMax-Hailuo-02` —— 6 秒或 10 秒，512P / 720P / 768P / 1080P |
| 语音合成 | `speech-2.8-hd`、`speech-2.8-turbo`、`speech-2.6-hd`、`speech-2.6-turbo`、`speech-02-hd`、`speech-02-turbo` |
| 语音转文字 | `asr-1.0` |
| 音乐 | `music-3.0`、`music-2.6`、`music-cover` —— 已退役，见下 |

设置页的每个媒体模型下拉下方都会显示当前所选模型的一行简介，选项本身也带同样的悬浮提示。生图支持的宽高比为 `1:1`、`16:9`、`4:3`、`3:2`、`2:3`、`3:4`、`9:16`、`21:9`（`21:9` 仅 `image-01` 支持），`prompt` 不超过 1500 字，`n` 取值 1–9。`image-01` 还支持显式的 `width`/`height`（512–2048 像素、8 的倍数，必须成对）；同时给出时插件以显式宽高为准、不再下发宽高比（官方规则是两者同给时以宽高比为准、会忽略宽高）。`image-01-live` 额外支持 `style`（`style_type` 取 漫画 / 元气 / 中世纪 / 水彩，`style_weight` 取值 (0, 1]）。图生图通过 `subject_reference` 传参考图（人物主体参考：公网 URL 或 `data:image/jpeg;base64,…` Data URL，JPG/JPEG/PNG 且小于 10MB）。

视频生成是三步异步流程：创建任务、查询任务、下载文件。插件会保留任务 id，因此 `minimax_media_status` 能在不重复提交的前提下取回成片。

### 音乐能力已退役

MiniMax 已退役音乐模型，并且自 **2026-08-20** 起音乐 API 不再向新用户开放 —— 只有存量付费账号仍可调用。`minimax_generate_music` 工具与 `media.musicModel` 配置项为这些账号保留，但新账号会在服务端收到错误。请把音乐当作遗留能力，而不是可依赖的能力。

## 权限与隐私

- **网络：** 只访问你配置的 MiniMax 端点。发现调用 `GET {root}/v1/models`，对话走所选通道，媒体工具调用同一主机下的生图、视频、语音、语音转文字与音乐接口。没有遥测、没有分析统计、没有第三方服务。
- **凭据：** Key 存在 dsh 凭据服务中，引用名 `MINIMAX_API_KEY`；不会写进 YAML、日志、任务记录或仓库。媒体下载请求发往 MiniMax 自家的文件域名，不携带额外凭据。
- **文件：** 生成的媒体写入 `$DSH_HOME/plugins/dsh-minimax-byapi`（或 `media.dataDir`）。任务记录里可能含有时效性的上游地址，请按私密信息对待。
- **数据出境：** 你在提示词里写的提示词、附带的参考图、用于转写的音频、要合成的文本，都会原样发给 MiniMax 处理。插件不做过滤、脱敏或二次托管。
- **本插件不做的事：** 读取或复用 MiniMax 命令行令牌、安装或运行其他插件、安装时拉取运行时依赖、调用服务端联网搜索工具、语音克隆与声音设计。

安装任何 dsh 插件都等于以你的用户权限运行第三方代码，工具审批并不能沙箱化插件代码 —— 安装前请审阅源码。安全问题请通过 [SECURITY.md](SECURITY.md) 反馈。

## 使用

- **对话：** 在模型选择器里选择 **MiniMax**。只有对话模型在列；设置页的模型表就是选择器看到的内容，删一行并保存即可隐藏该模型。
- **图片：** 一次调用即生成并保存；用绝对本地路径内联展示 —— `![alt](<D:/path/result-1.png>)`。dsh Web 通过 `/api/file` 提供该文件，单文件上限 20 MiB。
- **视频：** 提交任务后，用返回的 `task_id` 反复调用 `minimax_media_status`，直到结果保存完成或任务失败；状态卡片不会自行刷新。提交状态未知的任务不要重复提交，否则会重复计费。
- **语音：** `minimax_speak` 处理 1 万字符以内的文本并写出音频文件；`minimax_speak_long` 提交异步长文本任务并返回任务 id，用 `minimax_media_status` 取回；`minimax_list_voices` 返回可传给两者的 `voice_id`。`minimax_transcribe` 上传本地音频并返回转写文本。
- **展示：** 视频与音频出现在工具结果卡片播放器里。不要用 Markdown 图片语法内联它们 —— 聊天不会渲染，只会显示裂图。

## 故障排查

以下四项全部通过即安装成功：

1. `dsh --profile minimax-test --dump-config` 列出 `minimax-byapi` 层。
2. 插件页显示本插件的两个组件（`minimax-byapi` 与 `dsh-minimax-media`）均为运行中。
3. `minimax_models` 返回分类后的模型 ID。
4. 执行 `dsh plugin --profile minimax-test remove dsh-minimax-byapi` 后，各层与组件消失。

| 现象 | 处理 |
| --- | --- |
| `dsh plugin add` 失败或报 404 | 改用上面的 git 或本地目录方式；这条路不依赖 npm registry。 |
| 插件已列出但加载不了 | 你的 dsh 不在 `>=0.2.1-rc.2 <0.3.0-0 \|\| >=0.2.2-0 <0.3.0-0` 区间，升级到 0.2.x 版本。 |
| 设置页报 401 或 403 | Key 或地址不对。重新保存 Key，并核对预设地址（`api.minimax.io` 还是 `api.minimaxi.com`）。 |
| 提示「该地址没有开放模型列表接口」 | 该地址没有开放 `GET /v1/models`，自检会被跳过，改用内置模型常量。 |
| 连接被拒或超时 | 端点不可达，或账户余额不足。`timeoutMs` 决定单次请求上限。 |
| 模型选择器里没有 MiniMax 模型 | `/v1/models` 返回的内容没有被分类为 chat；用 `minimax_models` 刷新并补覆盖项。 |
| 模型没被发现或类别不对 | 先 `minimax_models` 刷新，再在设置页里改类别。 |
| 对话正常但媒体调用失败 | 账号没有该模型或该能力的权限 —— 新账号调用音乐就会这样失败。 |
| 视频一直处于生成中 | 用 `minimax_media_status` 查询；提交状态未知的任务不要重复提交。 |
| 任务已完成但下载失败 | 用 `minimax_media_retry_download`，它只重试下载，绝不重新生成。 |

更多实测结论与限制：[VALIDATION.md](VALIDATION.md)。

## 开发与测试

```bash
npm install --ignore-scripts
npm test             # 自动化测试
npm run check        # 源码语法检查
npm run build        # 由 src/client.js 重新构建 lib/client.js
npm pack --dry-run
```

CI（`.github/workflows/ci.yml`）在 Linux 与 Windows 上以 Node 22.19 与 24 运行：安装依赖、测试、语法检查、构建、校验 `lib/client.js` 与构建产物一致、以及打包试运行。推送 `v*` 标签会触发 `.github/workflows/release.yml`：校验标签与 `package.json` 版本一致、重复上述检查、把打包产物挂到 GitHub Release，并通过 trusted publishing（OIDC）发布到 npm —— workflow 里不存放任何 npm 令牌，由 GitHub 现场签发短时 OIDC 令牌。

trusted publishing 需要为该包登记一次。用 npm CLI 11.16 及以上版本可以直接在命令行登记（需先登录 npm）：

```bash
npm trust github dsh-minimax-byapi --file release.yml --repo NingYuanLee/dsh-minimax-byapi --allow-publish
```

`--file` 只写 workflow 文件名，`--repo` 写 `owner/repo`，`--allow-publish` 表示允许该 trusted publisher 执行 `npm publish`（`npm stage publish` 始终允许）。也可以在 npmjs.com 网页上登记：**Packages → `dsh-minimax-byapi` → Settings → Trusted publishing**

| 字段 | 填写内容 |
| --- | --- |
| Organization or user | `NingYuanLee` |
| Repository | `dsh-minimax-byapi` |
| Workflow filename | `release.yml` |
| Environment name | 留空 |

Workflow filename 只写文件名 —— `release.yml`，要与 `.github/workflows/release.yml` 完全一致，大小写也必须相同。

### 本地手动发布

npm 已吊销全部 classic token，granular access token 也不能直接发布新版本，因此本地发布走 `npm login --auth-type=web` 建立的两小时会话令牌：

```bash
npm login --auth-type=web   # 打开命令打印出来的链接，在浏览器里完成 WebAuthn / TOTP
npm publish --otp <code>    # <code> 是验证器里的 6 位一次性验证码
```

发布时必须完成 2FA 一次性验证码授权；不带 `--otp` 时 `npm publish` 会在命令行里交互提问。令牌与验证码不要写进仓库、日志或提交信息。

延伸阅读：[docs/connection-and-keys.md](docs/connection-and-keys.md) 讲接入方式、两类 Key 与模型状态；[docs/media-workflow.md](docs/media-workflow.md) 讲媒体任务生命周期；[docs/minimax-api-notes.md](docs/minimax-api-notes.md) 是本插件所依据的上游 API 调研笔记。这些页面只存在于仓库中 —— `docs/` 不在发布包的 `files` 白名单里。

## 社区、许可与免责声明

- Bug 与功能请求：[Issues](https://github.com/NingYuanLee/dsh-minimax-byapi/issues)（仓库自带 bug 报告与功能请求模板）。
- 安全问题：[SECURITY.md](SECURITY.md) —— 请使用 GitHub 私密漏洞报告。
- 许可：[MIT](LICENSE)。版权所有 (c) 2026 NingYuanLee。
- 仓库：<https://github.com/NingYuanLee/dsh-minimax-byapi>。这是社区插件项目，不是 DeepSeek 或 MiniMax 的官方产品。“ByAPI” 指插件通过官方 API 用你自己的 Key 访问 MiniMax，并不等于实现了 MiniMax 的全部产品能力。
