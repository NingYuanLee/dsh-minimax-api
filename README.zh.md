# dsh-minimax-byapi

为 DeepSeek Harness 接入原生 MiniMax：既可以用订阅 Key（M Plan）也可以用按量付费 API Key 对话，并提供基于官方 MiniMax API 的生图、视频、语音、语音转文字与音乐工具。

[![CI](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml/badge.svg)](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![Node >=22.19](https://img.shields.io/badge/node-%3E%3D22.19.0-339933.svg)](#兼容性与限制) [![dsh 0.2.x](https://img.shields.io/badge/dsh-0.2.x-blue.svg)](#兼容性与限制) [![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-6f42c1.svg)](https://github.com/topics/dsh-plugin)

[English](README.md) | 中文

> **尚未发布到 npm。** 请先用 git 或本地目录安装 —— 见[安装](#安装)。安装命令里的 npm 写法一并保留，发布后可直接照用。

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

插件注册两个组件：`minimax-byapi`（对话、模型清单、设置页）与 `dsh-minimax-media`（媒体工具），合计 10 个工具：

| 工具 | 作用 |
| --- | --- |
| `minimax_models` | 刷新模型清单，按能力分组返回。可选 `verify_key` 用一次 `GET /v1/models` 校验地址与密钥。 |
| `minimax_generate_image` | 文生图：`prompt`，可选 `model`、宽高比、`n`（1–9，默认 1）。 |
| `minimax_edit_image` | 图生图：`prompt` 加一张参考图（`subject_reference`）。 |
| `minimax_generate_video` | 文生视频。V2 模型（MiniMax-H3 系列）4–15 秒；V1 模型（Hailuo 系列）6 秒或 10 秒。 |
| `minimax_speak` | 文字转语音：`input`，可选 `model` 与 `voice`。 |
| `minimax_transcribe` | 语音转文字：上传音频文件并返回转写文本。 |
| `minimax_generate_music` | 文本生成音乐。官方已退役 —— 见[音乐能力已退役](#音乐能力已退役)。 |
| `minimax_media_list` | 列出当前会话创建过的媒体任务。 |
| `minimax_media_status` | 查询任务状态并在结果就绪时下载保存：`task_id`。 |
| `minimax_media_retry_download` | 重试下载失败的结果，不重新生成：`task_id`。 |

不提供：实时语音对话（音频进 / 音频出）、语音克隆、声音设计、MiniMax 服务端联网搜索工具，以及实时任务看板。视频任务提交后在进程内轮询，但结果卡片是快照、不会自行刷新 —— 需要用 `minimax_media_status` 取回成片。模型分类基于规则，不构成保证。

## 兼容性与限制

| 组件 | 要求 | 已验证情况 |
| --- | --- | --- |
| dsh | `engines.dsh` 要求 `>=0.2.1-rc.2 <0.3.0-0` | 已在 `0.2.2-rc.1` 的独立 Web profile 实测安装、加载、两个组件运行与设置页渲染；对话与媒体调用仍需真实 Key —— 见 [VALIDATION.md](VALIDATION.md) |
| Node.js | `>=22.19.0` | CI 在 Linux 与 Windows 上跑 Node 22.19 与 24 |
| MiniMax | 官方开放平台，国际 `api.minimax.io` 或国内 `api.minimax.cn` | 仅依据官方文档，尚未用真实 Key 实测调用 |
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

国内旧域名 `api.minimaxi.com` 目前仍可访问，但官方文档已切换到 `api.minimax.cn`，请优先使用 `api.minimax.cn` 预设。

### 接入方式

`connection.plan` 会同时填好 API 地址与对话协议：

| 预设 | API 地址 | 对话协议 |
| --- | --- | --- |
| `payg-global` —— 按量付费（国际） | `https://api.minimax.io/v1` | `openai-completions` |
| `payg-cn` —— 按量付费（国内） | `https://api.minimax.cn/v1` | `openai-completions` |
| `coding-global` —— M Plan（国际） | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `coding-cn` —— M Plan（国内） | `https://api.minimax.cn/anthropic` | `anthropic-messages` |
| `custom` —— 自定义地址 | 空 | `openai-completions` |

## 安装

**从 git 安装（发布到 npm 前的推荐方式）：**

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

**从 npm 安装（发布之后）：**

```powershell
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add dsh-minimax-byapi
```

`--dump-config` 会基于默认 profile 创建新 profile 并打印合并后的配置，不会启动服务。`dsh plugin add` 会把该 bundle 记录到 profile 里，不需要手改 YAML。本包没有 `prepare` 或 `postinstall` 脚本，安装过程不执行任何构建代码，也不需要 `allowBuilds` 条目。

用该 profile 启动 dsh：

```powershell
dsh --profile minimax-test --no-open
```

建议先放在独立 profile 里试用，把提供方、工具和设置隔在日常环境之外。想完全隔离，可以把 `DSH_HOME` 指向一个临时目录。

## 更新与卸载

git 安装的更新方式是先移除再添加新提交；本地目录安装用 `git pull` 加 `npm install --ignore-scripts`。之后重启 dsh。

```powershell
dsh plugin --profile minimax-test remove dsh-minimax-byapi
```

卸载会把插件的各层从 profile 中移除：提供方、10 个工具和设置页都会消失。但**已生成的媒体与任务记录不会被删除，凭据也不会被删除**。要清掉文件请自行删除数据目录：

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
      plan: payg-global
      baseURL: https://api.minimax.io/v1
      api: openai-completions
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
| `connection.plan` | `payg-global` | 接入方式：`payg-global`、`payg-cn`、`coding-global`、`coding-cn`、`custom`，用于填 `baseURL` 与 `api`。 |
| `connection.baseURL` | `https://api.minimax.io/v1` | API 地址。非本机地址必须使用 HTTPS，路径会被规整成 `/v1` 或 `/anthropic`。 |
| `connection.apiKey` | 空 | 直接填写调用密钥，优先于凭据引用。仅供本地测试，正常使用请留空。 |
| `connection.apiKeyEnv` | `MINIMAX_API_KEY` | dsh 凭据服务中的引用名。 |
| `connection.api` | `openai-completions` | 对话协议：`openai-completions`、`openai-responses` 或 `anthropic-messages`。 |
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

模型清单由 `GET {root}/v1/models` 与插件内置常量合并得到，因此即使发现接口只返回对话模型，媒体模型也仍然在列。设置页的模型表就是模型选择器看到的内容 —— 删掉一行并保存即可隐藏该模型。

### 媒体模型

| 能力 | 模型 |
| --- | --- |
| 图片 | `image-01`、`image-01-live` |
| 视频（v2 接口） | `MiniMax-H3`、`MiniMax-H3-Max` —— 4–15 秒 |
| 视频（v1 接口） | `MiniMax-Hailuo-2.3`、`MiniMax-Hailuo-2.3-Fast`、`MiniMax-Hailuo-02` —— 6 秒或 10 秒，512P / 720P / 768P / 1080P |
| 语音合成 | `speech-2.8-hd`、`speech-2.8-turbo`、`speech-2.6-hd`、`speech-2.6-turbo`、`speech-02-hd`、`speech-02-turbo` |
| 语音转文字 | `asr-1.0` |
| 音乐 | `music-3.0`、`music-2.6`、`music-cover` —— 已退役，见下 |

生图支持的宽高比为 `1:1`、`16:9`、`4:3`、`3:2`、`2:3`、`3:4`、`9:16`、`21:9`，`prompt` 不超过 1500 字，`n` 取值 1–9。图生图通过 `subject_reference` 传参考图。

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
- **语音：** `minimax_speak` 写出音频文件；`minimax_transcribe` 上传本地音频并返回转写文本。
- **展示：** 视频与音频出现在工具结果卡片播放器里。不要用 Markdown 图片语法内联它们 —— 聊天不会渲染，只会显示裂图。

## 故障排查

以下四项全部通过即安装成功：

1. `dsh --profile minimax-test --dump-config` 列出 `minimax-byapi` 层。
2. 插件页显示本插件的两个组件（`minimax-byapi` 与 `dsh-minimax-media`）均为运行中。
3. `minimax_models` 返回分类后的模型 ID。
4. 执行 `dsh plugin --profile minimax-test remove dsh-minimax-byapi` 后，各层与组件消失。

| 现象 | 处理 |
| --- | --- |
| `dsh plugin add` 失败或报 404 | 改用上面的 git 或本地目录方式；包还没有发布到 npm。 |
| 插件已列出但加载不了 | 你的 dsh 不在 `>=0.2.1-rc.2 <0.3.0-0` 区间，升级到 0.2.x 版本。 |
| 设置页报 401 或 403 | Key 或地址不对。重新保存 Key，并核对预设地址（`api.minimax.io` 还是 `api.minimax.cn`）。 |
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

CI（`.github/workflows/ci.yml`）在 Linux 与 Windows 上以 Node 22.19 与 24 运行：安装依赖、测试、语法检查、构建、校验 `lib/client.js` 与构建产物一致、以及打包试运行。推送 `v*` 标签会触发 `.github/workflows/release.yml`：校验标签与 `package.json` 版本一致、重复上述检查、把打包产物挂到 GitHub Release，并在配置了 `NPM_TOKEN` secret 时才发布到 npm。

延伸阅读：[docs/connection-and-keys.md](docs/connection-and-keys.md) 讲接入方式、两类 Key 与模型状态；[docs/media-workflow.md](docs/media-workflow.md) 讲媒体任务生命周期；[docs/minimax-api-notes.md](docs/minimax-api-notes.md) 是本插件所依据的上游 API 调研笔记。这些页面只存在于仓库中 —— `docs/` 不在发布包的 `files` 白名单里。

## 社区、许可与免责声明

- Bug 与功能请求：[Issues](https://github.com/NingYuanLee/dsh-minimax-byapi/issues)（仓库自带 bug 报告与功能请求模板）。
- 安全问题：[SECURITY.md](SECURITY.md) —— 请使用 GitHub 私密漏洞报告。
- 许可：[MIT](LICENSE)。版权所有 (c) 2026 NingYuanLee。
- 仓库：<https://github.com/NingYuanLee/dsh-minimax-byapi>。这是社区插件项目，不是 DeepSeek 或 MiniMax 的官方产品。“ByAPI” 指插件通过官方 API 用你自己的 Key 访问 MiniMax，并不等于实现了 MiniMax 的全部产品能力。
