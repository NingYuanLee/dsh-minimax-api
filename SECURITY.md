# Security

[English](#english) | [中文](#中文)

## English

### Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repository (**Security → Report a vulnerability**) and include the affected version, a reproduction and the impact. Expect an initial reply within a few days.

### What this plugin can access

- **Network**: it talks only to the MiniMax endpoint you configure (`connection.baseURL`, normally `https://api.minimax.io/v1` or `https://api.minimax.cn/v1`). Model discovery calls `GET {root}/v1/models`; chat uses the configured OpenAI-compatible or Anthropic-compatible route; the media tools call the image, video, speech, speech-to-text and music endpoints on the same host. There is no telemetry, no analytics and no third-party service besides MiniMax.
- **Credentials**: the API key is stored through the DeepSeek Harness credential service under the reference name `MINIMAX_API_KEY` (or the reference you configure). It is never written to YAML, logs, task records or the repository. Media downloads from MiniMax's own file host are requested without any separate credential. `connection.apiKey` exists only as a local-testing override and takes precedence over the credential when set — leave it empty in normal use.
- **Files**: generated media is written under `$DSH_HOME/plugins/dsh-minimax-api` (or `media.dataDir`), isolated per connection and per task. Task records may contain time-limited upstream URLs and are private data. The plugin writes a `.part` file first and renames it after the download is validated, so a partial file is never presented as a finished result.
- **What leaves your machine**: prompts, reference images you attach, audio you upload for transcription and the text you synthesize are sent to MiniMax for processing, exactly as you write them. The plugin does not filter, redact, cache publicly or re-host that content.
- **What this plugin does not do**: it does not read or reuse a MiniMax CLI token, does not install or run other plugins, does not add runtime dependencies at install time, and does not call the server-side web search tool, voice cloning or voice design. It has no `prepare`/`postinstall` script, so `dsh plugin add` does not execute build code.

### Trust boundary

Installing any dsh plugin runs third-party code with your user permissions, and tool approvals do not sandbox plugin code. Review the source before installing.

## 中文

### 报告漏洞

安全问题请不要开公开 issue，请使用本仓库的 GitHub 私有漏洞报告（**Security → Report a vulnerability**），附上版本、复现步骤与影响。会在几天内回复。

### 这个插件能访问什么

- **网络**：只访问你配置的 MiniMax 端点（`connection.baseURL`，通常是 `https://api.minimax.io/v1` 或 `https://api.minimax.cn/v1`）。模型发现请求 `GET {root}/v1/models`；对话走所选的 OpenAI 兼容或 Anthropic 兼容路由；媒体工具调用同一主机下的生图、视频、语音、语音转文字与音乐接口。没有遥测、没有分析统计，除 MiniMax 外不请求任何第三方。
- **凭据**：调用密钥通过 dsh 凭据服务保存，引用名为 `MINIMAX_API_KEY`（或你配置的引用名），不会写入 YAML、日志、任务记录或仓库。从 MiniMax 自家文件域名下载媒体时不携带任何额外凭据。`connection.apiKey` 只是本地测试用的直填覆盖项，填了会优先于凭据引用，正常使用请留空。
- **文件**：生成物保存在 `$DSH_HOME/plugins/dsh-minimax-api`（或 `media.dataDir`），按连接与任务隔离。任务记录可能含有时效性的上游地址，属于私有数据。下载先写 `.part` 临时文件、校验通过后再改名，因此半截文件不会被当成完整结果交付。
- **数据出境**：你写下的提示词、附带的参考图、用于转写的音频、要合成的文本，都会原样发给 MiniMax 处理。插件不做过滤、脱敏、公开缓存或二次托管。
- **不做的事**：不读取或复用 MiniMax 命令行令牌，不安装或执行其他插件，不在安装期拉取运行时依赖，不调用服务端联网搜索工具、语音克隆与声音设计。没有 `prepare`/`postinstall` 脚本，`dsh plugin add` 不会执行构建代码。

### 信任边界

安装任何 dsh 插件都等于以你的用户权限运行第三方代码，工具审批并不能沙箱化插件代码。安装前请审阅源码。
