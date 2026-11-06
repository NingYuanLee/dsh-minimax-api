# 验收记录 / Validation record

本文件区分三类结论：**本地实测**（在本机可复现）、**来自官方文档**（引用上游链接，尚未用真实凭据调用）、**未验证**（明确留白，不做承诺）。

- 插件：`dsh-minimax-byapi`，版本 `0.1.0`
- 记录日期：2026-11-05
- 记录范围：本轮改造（由 Grok 网关插件改造为 MiniMax 官方 API 插件）

## 结论总览

| 结论 | 来源 | 状态 |
| --- | --- | --- |
| 源码语法检查通过 | 本地实测 | ✅ 已实测 |
| 打包产物包含运行时与展示资源，不含 `docs/`、`test/` | 本地实测 | ✅ 已实测 |
| 模型分类、覆盖项与地址规整规则 | 本地实测 + 单元测试 | ✅ 已实测 |
| 接入方式预设、两种 Key 同协议 | 官方文档 | 📄 文档结论，未用真实 Key 实测 |
| 对话模型清单与退役列表 | 官方文档 | 📄 文档结论，未用真实 Key 实测 |
| 生图 / 视频 / 语音 / 转写端点与参数 | 官方文档 | 📄 文档结论，未用真实 Key 实测 |
| 音乐能力已退役、2026-08-20 起不向新用户开放 | 官方文档 | 📄 文档结论 |
| 端到端对话（真实凭据，经 `minimax-byapi` 路由） | 本地实测 | ✅ 已实测（媒体生成仍未验证） |
| dsh `0.2.2-rc.1` 独立 Web profile 安装、加载与设置页渲染 | 本地实测 | ✅ 已实测（媒体调用仍需真实凭据） |

## 一、本地实测

以下命令在本仓库根目录执行，可复现：

```powershell
npm install --ignore-scripts
npm run check          # 语法检查：src/index.js、src/adapter.js、src/catalog.js、src/lock.js、
                       # src/media.js、src/media-entry.js、src/minimax-api.js、src/service.js、
                       # src/client.js、scripts/build-client.mjs
npm pack --dry-run --ignore-scripts
```

- ✅ `npm run check` 通过（2026-11-05）。
- ✅ `npm pack --dry-run --ignore-scripts` 的产物清单为：`CHANGELOG.md`、`LICENSE`、`README.md`、`README.zh.md`、`SECURITY.md`、`assets/media.svg`、`cordis.patch.yml`、`icon.svg`、`lib/client.js`、`locale/en.json`、`locale/media/en.json`、`locale/media/zh.json`、`locale/zh.json`、`package.json`、`scripts/build-client.mjs`、`src/*.js`。
  - `package.json` 的 `files` 白名单**不含 `docs/` 与 `test/`**：仓库里的 `docs/` 说明文档只在仓库站点可见，不随安装包分发。README 的「延伸阅读」链接指向仓库路径，不表示安装包内含 `docs/` 目录。
- ✅ `npm test` 全绿（2026-11-06）：107 项用例全部通过。其中 `test/catalog.test.js`（模型分类、覆盖项、地址规整 `normalizeBaseURL` 与 `apiRootOf`）、`test/adapter.test.js`（对话适配器，含三条通道的请求体断言，以及适配器作用域必须能应答宿主的请求头水位线这一条回归用例）、`test/media.test.js`（媒体任务、hex 音频解码、视频 v1/v2 三步流程、音色查询、异步长文本语音全链路）、`test/quota.test.js`（M Plan 额度归一化、www 主机映射、按量付费 Key 拒绝、自定义地址不发请求）、`test/lock.test.js`（文件锁）、`test/inline-key.test.js`（直填密钥与凭据引用的优先级）、`test/client-i18n.test.js` 与 `test/client-settings.test.js`（前端文案与设置页、13 个工具卡片）、`test/package-meta.test.js`（发布清单与 `engines` 基线、声明的 peer 范围必须被安装树满足）。测试只连 `127.0.0.1` 的桩服务，不访问真实接口。
- ✅ 依赖树与宿主对齐（2026-11-06）：peer 范围放宽后，开发树解析到与宿主同一代依赖 —— `@deepseek-ai/dsh-llm-pi-ai` / `dsh-llm` / `dsh-credentials` / `dsh-tools` 均为 `0.2.2-rc.1`、`@deepseek-ai/cordis` `4.1.0`、`@deepseek-ai/schemastery` `3.19.0`，`npm ci` 可复现。因此仓库自带用例现在跑的就是宿主在跑的 pi-ai。
- ✅ `engines.dsh` 覆盖实测宿主（2026-11-06）：原范围 `>=0.2.1-rc.2 <0.3.0-0` 按 semver 不接受 `0.2.2-rc.1`（预发布元组规则，与 peer 范围同一套问题），已改为联合式 `>=0.2.1-rc.2 <0.3.0-0 || >=0.2.2-0 <0.3.0-0`；该范围由市场索引展示给用户，因此必须与实测宿主一致。
  - 在这套依赖下，用 `git show HEAD:src/adapter.js` 与 `HEAD:test/adapter.test.js` 跑 `node --test test/adapter.test.js`：4 条用例中 3 条失败，报 `pi-ai request header preparation failed for provider "minimax-byapi"`（cause：`TypeError: ctx.waterfall is not a function`）；换成修复版后 8 条全过。即回归用例在仓库内即可复现该故障。
- ✅ 独立 profile 实机安装（2026-11-05，宿主 dsh `0.2.2-rc.1`）：
  ```powershell
  dsh --profile minimax-test --from-default-profile web --dump-config
  dsh plugin --profile minimax-test add "D:\tools\dsh-plugins\dsh-minimax-byapi"
  dsh --profile minimax-test --no-open
  ```
  - `--dump-config` 输出中出现 `minimax-byapi` 与 `dsh-minimax-media` 两层，bundle 解析无错误。
  - 插件页显示 **MiniMax ByAPI v0.1.0** 为启用状态，组件 `minimax-byapi` 与 `dsh-minimax-media` 均为「运行中」。
  - 设置页正常渲染：接入方式（5 项）、API 地址、API 协议（Chat Completions / Responses / Anthropic Messages）、API Key、获取模型 / 保存地址和密钥、对话模型与媒体模型折叠区。
  - 该 profile 未配置真实 Key，因此模型选择器为空、对话与媒体请求未发起；这两项仍属未验证。
  - 参数改造后二次复验（同一天、同一 profile，`link:` 安装随源码更新）：插件详情页正常打开，两个组件仍为「运行中」，接入方式下拉 5 项（含「订阅 M Plan（国际/国内）」）、API 协议下拉 3 项，浏览器控制台无 error / warn。
  - 补齐音色查询与异步长文本语音后三次复验：详情页能力说明中已出现 `minimax_list_voices` 与 `minimax_speak_long`，两个组件仍为「运行中」，控制台无 error / warn。
- ✅ 端到端对话实测（2026-11-06，宿主 dsh `0.2.2-rc.1`，桌面 profile 经 `link:` 安装本仓库）：
  - 修复 `src/adapter.js` 的作用域缺失 `ctx.waterfall` 之后，在插件页禁用并重新启用「MiniMax ByAPI」，插件重新注册 `minimax-byapi` 路由，`/api/llm/listProviders` 与 `/api/session/modelCatalog` 中该路由与 `MiniMax-M3.1-Flash`、`MiniMax-M3` 均在列。
  - 在模型选择器中选中该路由的 `MiniMax M3.1 Flash`（即插件自己注册的那一条，与宿主 `minimaxi` 路由的 `MiniMax-M3.1-Flash` 是两条不同路由），发送一条消息，模型正常回复，状态为「已完成，用时 14 秒」，用量 49.1K tok。真实凭据、真实端点、真实流式响应。
  - 修复前同一路径必然失败，报 `pi-ai request header preparation failed for provider "minimax-byapi"`，底层原因是 `TypeError: ctx.waterfall is not a function`。该结论在 `dsh-llm-pi-ai@0.2.2-rc.1`（宿主实际版本）上用 HEAD 版 `src/adapter.js` 复现、用修复版复验，均为真实 HTTP 请求，非模拟。

### 已实测的行为要点

- **地址规整**（`src/catalog.js` 的 `normalizeBaseURL`）：非本机地址必须 HTTPS；路径被规整到 `/v1` 或 `/anthropic`；根地址补 `/v1`。
- **模型清单合并**（`readCatalog`）：`GET {root}/v1/models` 的返回结果与内置 `CHAT_MODELS` / `MEDIA_MODELS` 常量合并去重，因此发现接口只返回对话模型时，媒体模型仍然在列。
- **分类规则**（`classifyModel`）：内置常量优先，其次用户覆盖项，最后关键字兜底；未知模型归入 `chat`，不会凭空变成媒体模型。
- **选择器过滤**（`chatModels`）：只有 `category === 'chat'` 的模型进入模型选择器；`modelOverrides` 中列出的 ID 会被排除（用于在设置页隐藏某个模型）。
- **凭据解析**（`src/index.js` 的 `readKey`）：`connection.apiKey` 优先，其次按 `connection.apiKeyEnv`（默认 `MINIMAX_API_KEY`）从 dsh 凭据服务解析；两者都没有时报错并提示去设置页填写。

## 二、来自官方文档的结论

以下条目直接来自 MiniMax 官方文档，本轮**没有**用真实 Key 调用验证。原始调研笔记见 [`docs/minimax-api-notes.md`](docs/minimax-api-notes.md)。

### 域名与端点

- 国际：`https://api.minimax.io/v1`（OpenAI 兼容）、`https://api.minimax.io/anthropic`（Anthropic 兼容）；国内：`https://api.minimax.cn/v1`、`https://api.minimax.cn/anthropic`。
- 国内当前文档域名是 `api.minimax.cn`；旧域名 `api.minimaxi.com` 仍会应答（2026-11-05 无凭据探活返回 HTTP 401，说明主机存活），但官方文档已切到 `api.minimax.cn`。
- `GET {root}/v1/models` 存在，插件用它做模型发现（Anthropic 兼容另有 `GET /anthropic/v1/models`）。
- 来源：<https://platform.minimax.io/docs/guides/quickstart-preparation.md>、<https://platform.minimax.io/docs/api-reference/models/openai/list-models.md>、<https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md>

### 两种 Key

- 按量付费 API Key 与 M Plan 订阅 Key（`sk-cp-…`）请求头相同，均为 `Authorization: Bearer <key>`，可用同一批主机；差别在计费来源与可用模型档位。M Plan 另有档位与用量窗口限制（如 H3 视频仅部分档位可用）。
- 来源：<https://platform.minimax.io/docs/m-plan/other-tools.md>、<https://platform.minimax.io/docs/m-plan/faq.md>、<https://platform.minimax.io/docs/m-plan/intro.md>

### 对话模型

- 当前只有两款：`MiniMax-M3.1-Flash` 与 `MiniMax-M3`；上下文均为 1,000,000，推荐输出 131,072（上限 524,288），均支持图片输入。
- `MiniMax-M3.1-Flash` 思考常开，档位 `low` / `medium` / `high` / `xhigh` / `max`；`MiniMax-M3` 为自适应思考，不接受档位参数。
- 已退役：`MiniMax-M2`、`M2.1`、`M2.5`、`M2.7`、`M2.7-highspeed`、`M1`、`Text-01`、`VL-01`、`abab6.5`；M Plan 用户自动路由到 `MiniMax-M3.1-Flash`。
- Chat Completions 用 `max_completion_tokens`（`max_tokens` 已废弃），思考内容在 `choices[0].message.reasoning_content`；`temperature` / `top_p` 被接受但无效。

### 对话参数（文本模型）

- Chat Completions：`max_completion_tokens`（推荐 131072、上限 524288）、`reasoning_effort` ∈ low/medium/high/xhigh/max（仅 `MiniMax-M3.1-Flash` 真正生效，省略时为 `max`），`thinking` ∈ `adaptive` / `disabled`（`MiniMax-M3.1-Flash` 强制开启，传 `disabled` 返回 HTTP 400；`MiniMax-M3` 传 `disabled` 跳过思考），`reasoning_split` 默认拆分到 `reasoning_content`，`service_tier` ∈ standard/priority（`MiniMax-M3.1-Flash` 不支持），`temperature` / `top_p` 固定 1 / 0.95、传入无效。
- Anthropic 兼容：`max_tokens`、`thinking:{type:'adaptive'|'disabled'}`（**只接受这两种 type，没有 `budget_tokens`**）、`output_config:{effort}` ∈ low/medium/high/xhigh/max（仅 `MiniMax-M3.1-Flash`）；`MiniMax-M3` 省略 `thinking` 时默认不思考；`cache_control` 不被这两款模型支持。
- 响应侧：Chat Completions 的思考在 `reasoning_content`；Anthropic 兼容的思考是 `thinking` 内容块（带 `signature`，多轮需原样回带），流式为 `thinking_delta` / `signature_delta`。
- 插件侧的实测证据：`test/adapter.test.js` 用本地桩服务断言了请求体 —— Chat Completions 只发 `reasoning_effort` 与 `max_completion_tokens`（不发 `max_tokens`、不发 `thinking`），Anthropic 通道只发 `thinking:{type:'adaptive'}` 与 `output_config.effort`（不发 `budget_tokens`）。
- 来源：<https://platform.minimax.cn/docs/api-reference/text-chat-openai.md>、<https://platform.minimax.cn/docs/api-reference/text-chat-anthropic.md>
- 来源：<https://platform.minimax.io/docs/faq/models.md>、<https://platform.minimax.io/docs/api-reference/text-chat-openai.md>、<https://platform.minimax.io/docs/api-reference/api-overview.md>

### 媒体能力

- 生图：`POST /v1/image_generation`，模型 `image-01` / `image-01-live`（两者都支持文生图与图生图）；宽高比 `1:1`、`16:9`、`4:3`、`3:2`、`2:3`、`3:4`、`9:16`、`21:9`，其中 `21:9` 仅 `image-01`；`width`/`height` 仅 `image-01` 生效（必须成对、512–2048、8 的倍数；官方规则是两者同给时以宽高比为准，本插件改为以显式宽高为准、不再下发宽高比）；`style` 仅 `image-01-live` 生效（`style_type` 取 漫画 / 元气 / 中世纪 / 水彩，`style_weight` 取值 (0, 1]）；`prompt` ≤ 1500 字符；`n` 1–9；`aigc_watermark` 默认 false；图生图通过 `subject_reference` 传参考图（`type` 目前只有 `character`，参考图为 JPG/JPEG/PNG 且小于 10MB）。
- 视频：V2 接口 `POST /v2/video_generation`（`MiniMax-H3` 768P/2K、`MiniMax-H3-Highspeed` 480P/768P、`MiniMax-H3-Lite` 480P/768P、`MiniMax-H3-Max` 480P/768P；时长前三者 4–15 秒、`MiniMax-H3-Max` 5–15 秒），查询 `GET /v2/query/video_generation/{task_id}`，成片地址在 `task.content.url`；V1 接口 `POST /v1/video_generation`（`MiniMax-Hailuo-2.3` / `-Fast` / `Hailuo-02`，6 或 10 秒，512P / 720P / 768P / 1080P），查询后取 `file_id` 再 `GET /v1/files/retrieve?file_id=…` 下载。两者都是「创建 → 查询 → 下载」三步异步。
- 视频 v2 的画幅规则：文生视频（只含 text）必须给具体比例，不能用 `adaptive`；图生视频（带首帧）比例固定为 `adaptive`；`MiniMax-H3-Lite` 暂不支持 `adaptive`。v2 的 `text` 上限 7000 字符（v1 仍为 2000）。
- 语音合成：`POST /v1/t2a_v2`，模型 `speech-2.8-hd` / `-turbo`、`speech-2.6-hd` / `-turbo`、`speech-02-hd` / `-turbo`；响应 `data.audio` 为 hex 编码音频。
- 音色查询：`POST /v1/get_voice`，`voice_type` 取 `system` / `voice_cloning` / `voice_generation` / `all`；返回 `system_voice[]`（`voice_id` / `voice_name` / `description`）等分组，复刻与文生音色需先成功用于一次合成才会出现。
- 异步长文本语音：创建 `POST /v1/t2a_async_v2`（≤100,000 字符，`audio_setting` 用 `audio_sample_rate`、默认双声道）→ 查询 `GET /v1/query/t2a_async_query_v2?task_id=…`（`Processing` / `Success` / `Failed` / `Expired`，每秒最多 10 次）→ 用 `file_id` 走 `GET /v1/files/retrieve?file_id=…` 取下载地址（**9 小时有效**）。
- 语音转文字：`POST /v1/speech_to_text`（multipart），模型 `asr-1.0`，返回文本。
- 来源：<https://platform.minimax.cn/docs/api-reference/api-overview>、<https://platform.minimax.cn/docs/api-reference/image-generation-t2i.md>、<https://platform.minimax.cn/docs/api-reference/image-generation-i2i.md>、<https://platform.minimax.cn/docs/api-reference/video-generation-v2-create.md>、<https://platform.minimax.io/docs/api-reference/video-generation-v2-query.md>、<https://platform.minimax.io/docs/api-reference/video-generation-t2v.md>、<https://platform.minimax.io/docs/api-reference/video-generation-download.md>、<https://platform.minimax.io/docs/api-reference/speech-t2a-http.md>、<https://platform.minimax.io/docs/api-reference/speech-to-text.md>

### 音乐能力已退役

- `music-3.0`、`music-2.6`、`music-cover` 在官方模型列表中标记为已退役；自 **2026-08-20** 起音乐 / 歌词 API 不再向新用户开放，存量付费账号可继续使用。
- 来源：<https://platform.minimax.io/docs/faq/models.md>、<https://platform.minimax.io/docs/api-reference/music-generation.md>

### M Plan 额度

- 官方 FAQ 给出三种查用量方式：控制台用量页、`mmx quota` CLI、以及 `GET https://www.minimax.io/v1/token_plan/remains`（国内 `https://www.minimax.cn/v1/token_plan/remains`），请求头 `Authorization: Bearer <订阅 Key>`。
- 必须用订阅 Key；按量付费 Key 会被拒绝。文本、图像、语音等非视频能力受 5 小时窗口 + 周窗口限制，视频只受周窗口限制，额度不结转。
- 字段语义上游未公开：MiniMax-M2 issue #99 记录 `current_*_usage_count` 返回的是**剩余**而非已用；插件按剩余解析，`usage > total` 时回退为已用，并保留 `raw`。
- 来源：<https://platform.minimax.io/docs/m-plan/faq.md>、<https://platform.minimaxi.com/docs/m-plan/faq.md>、<https://github.com/MiniMax-AI/MiniMax-M2/issues/99>

### 错误与限流（错误体形状已在插件中映射，数字码未逐条翻译）

- OpenAI 风格错误体（`type` / `error.type` / `message` 末尾括号内的数字码）、Anthropic 风格错误体、以及 `base_resp.status_code` 旧式错误体三套约定并存。插件的 `src/minimax-api.js` 在 `raiseFromPayload` 里统一把这三种形状转成可读错误（例如「MiniMax 返回错误 1008：余额不足」），HTTP 非 2xx 时也会带上状态码。
- 常见码：`1002` 限流、`1004` 鉴权失败、`1008` 余额不足、`2013` 参数非法、`2049` Key 非法、`2056`/`2062`/`2067`/`2068` 为 M Plan 专属、`2069` 模型已下线。
- 来源：<https://platform.minimax.io/docs/api-reference/errorcode.md>、<https://platform.minimax.io/docs/guides/rate-limits.md>

## 三、未验证与已知限制

- ✅ **端到端真实调用（对话）**：已用真实 MiniMax Key 经 `minimax-byapi` 路由跑通一轮对话（2026-11-06，见上）。生图、视频、语音、转写仍未用真实 Key 跑通，因此上游限流、以及错误码到插件提示文案的映射在媒体路径上仍未实测。
- ⚠️ **dsh 实机验收的范围**：已在 dsh `0.2.2-rc.1` 的独立 Web profile 完成安装、加载、组件状态与设置页渲染的实机验证；在桌面 profile 用真实凭据验证了模型选择器中实际出现 MiniMax 模型、对话请求可正常完成。仍未验证保存密钥后的凭据回写、以及媒体文件在会话中的播放（这些都需要真实 Key）。
- ❌ **M Plan 档位差异**：未验证各订阅档位可调用的模型范围（尤其 H3 视频）。
- ❌ **ASR 实测**：`asr-1.0` 的转写只做了接口与字段层面的文档核对，未跑真实音频。
- ❌ **音色查询与异步长文本语音实测**：`/v1/get_voice` 与 `t2a_async_v2` 全链路只用本地桩服务验证了请求与状态机，未用真实账号跑过；真实音色列表内容与 9 小时下载窗口未验证。
- ❌ **M Plan 额度实测**：`/v1/token_plan/remains` 的字段语义依赖社区记录（官方未公开字段表），尚未用真实订阅 Key 核对真实返回；`current_*_usage_count` 到底按剩余还是已用，需要在有订阅 Key 的账号上确认一次。
- ❌ **音乐实测**：新账号必然失败（上游已对新用户关闭）；存量付费账号能否调用未验证。
- ✅ **npm 发布**：包已发布到 npm（`dsh-minimax-byapi`），`latest` 指向首次发布的版本；安装方式为 npm、git 或本地目录。
- ✅ **市场收录**：已向 awesome-dsh-plugin 提交收录条目（PR #12583），等待维护者评审；其他社区列表尚未收录。
- ⚠️ **速率限制**：官方给出 LLM 200 RPM / 10M TPM、生图 10 RPM、视频 V1 20 RPM、V2 300 RPM（最多 30 个在飞任务）、TTS 60 RPM 等限制，插件不做本地限流，完全依赖上游。
- ⚠️ **媒体任务并发**：任务按会话隔离并持久化，但没有实现多 Host 进程共用同一数据目录时的跨进程锁。
- ⚠️ **模型分类**：分类基于内置规则与关键字，不是上游保证；历史模型或研究类模型未必适合当 Agent 工具使用。
- ⚠️ **上游变更**：MiniMax 频繁调整模型与端点（例如本轮内 M2.x 退役、国内域名切换）。文档结论会随官方文档变化而过期，请以 `docs/minimax-api-notes.md` 记录的来源 URL 为准重新核对。

## 不公开的测试材料

独立 profile、日志、凭据引用环境与生成物都放在被忽略的本地测试目录。调用密钥不进入源代码、仓库、任务公开结果或媒体下载请求。
