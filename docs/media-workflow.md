# 媒体任务与工具流程

本文说明 `dsh-minimax-media` 组件提供的工具、每种能力的上游接口形态，以及媒体任务的落盘与重试语义。

## 工具清单

| 工具 | 能力 | 上游接口 |
| --- | --- | --- |
| `minimax_generate_image` | 文生图 | `POST {root}/v1/image_generation` |
| `minimax_edit_image` | 图生图（参考图） | `POST {root}/v1/image_generation` |
| `minimax_generate_video` | 文生视频 / 图生视频 | `POST {root}/v2/video_generation`（H3 系）或 `POST {root}/v1/video_generation`（Hailuo 系） |
| `minimax_list_voices` | 查询可用音色 ID | `POST {root}/v1/get_voice` |
| `minimax_speak` | 同步文字转语音（≤10000 字符） | `POST {root}/v1/t2a_v2` |
| `minimax_speak_long` | 异步长文本语音（≤100000 字符） | 创建 `POST {root}/v1/t2a_async_v2` → 查询 `GET {root}/v1/query/t2a_async_query_v2?task_id=…` → 文件 `GET {root}/v1/files/retrieve?file_id=…` |
| `minimax_transcribe` | 语音转文字 | `POST {root}/v1/speech_to_text` |
| `minimax_generate_music` | 文本生成音乐 | `POST {root}/v1/music_generation`（官方已退役） |
| `minimax_media_status` | 查询任务状态并取回结果 | 查询 + 下载 |
| `minimax_media_retry_download` | 只重试下载 | 下载 |
| `minimax_media_list` | 列出本会话的媒体任务 | 本地记录 |
| `minimax_models` | 刷新模型清单（`minimax-byapi` 组件） | `GET {root}/v1/models` |

媒体工具与当前对话模型无关：任何聊天模型都能调用它们，不要求当前会话正在用 MiniMax 对话。

## 生图

- 模型：`image-01`、`image-01-live`（两者都支持文生图与图生图）。
- 宽高比：`1:1`、`16:9`、`4:3`、`3:2`、`2:3`、`3:4`、`9:16`、`21:9`（`21:9` 仅 `image-01`）。
- `image-01` 可显式给 `width`/`height`（必须成对，512–2048，8 的倍数）；与宽高比同时给出时以宽高比为准。
- `image-01-live` 额外支持 `style`（`style_type` 取 漫画 / 元气 / 中世纪 / 水彩，`style_weight` 取值 (0, 1]）。
- `prompt` 上限 1500 字符；`n` 取值 1–9；`aigc_watermark` 默认为 false。
- 图生图通过 `subject_reference` 传参考图（`type` 目前只有 `character`，人物主体参考），参考图支持公网 URL 或 `data:image/jpeg;base64,...`，格式 JPG/JPEG/PNG 且小于 10MB。
- 上游返回 `data.image_urls`（默认 URL 形态，24 小时有效）或 `data.image_base64`；插件下载到本地后再交回路径，因此结果不依赖上游链接的有效期。

## 视频：两代接口与三步异步

MiniMax 有两代视频接口并存，插件按模型选择：

| 代 | 模型 | 时长 | 分辨率 | 创建 | 查询 | 下载 |
| --- | --- | --- | --- | --- | --- | --- |
| v2 | `MiniMax-H3`（768P/2K）、`MiniMax-H3-Highspeed`（480P/768P）、`MiniMax-H3-Lite`（480P/768P）、`MiniMax-H3-Max`（480P/768P） | 4–15 秒（Max 为 5–15 秒） | 见左 | `POST /v2/video_generation` | `GET /v2/query/video_generation/{task_id}` | 成片地址直接在 `task.content.url` |
| v1 | `MiniMax-Hailuo-2.3`、`MiniMax-Hailuo-2.3-Fast`、`MiniMax-Hailuo-02` | 6 秒或 10 秒 | 512P / 720P / 768P / 1080P | `POST /v1/video_generation` | `GET /v1/query/video_generation?task_id=…` | `GET /v1/files/retrieve?file_id=…` 取 `download_url` |

v2 的画幅规则：文生视频（只含文本）必须给具体比例，不能用 `adaptive`；图生视频（带首帧）比例固定为 `adaptive`；`MiniMax-H3-Lite` 暂不支持 `adaptive`。v2 的提示词上限 7000 字符，v1 为 2000。

三步流程对用户是一样的：

1. `minimax_generate_video` 提交任务，返回任务 id；
2. `minimax_media_status` 查询任务；还没结束就继续等；
3. 任务完成后 `minimax_media_status` 把成片下载到本地并返回路径。

注意：

- 结果卡片是**快照**，不会自行刷新；要拿成片必须调用 `minimax_media_status`。
- 提交状态未知（例如提交后网络中断）时不要重投 —— 重投会被计费两次。任务记录里会保留提交状态，用来区分这种情况。
- v1 的 `file_id` 只在成功时有；v2 没有 `file_id`，成片地址在 `task.content.url`，且有时效。

## 语音与转写

- **音色查询**：`POST /v1/get_voice`，`voice_type` 取 `system` / `voice_cloning` / `voice_generation` / `all`，返回 `system_voice[]`（含 `voice_id`、`voice_name`、`description`）以及复刻、文生两类音色。复刻与文生音色只有在成功用于一次语音合成后才会被列出来。
- **同步文字转语音**：`POST /v1/t2a_v2`，模型 `speech-2.8-hd` / `-turbo`、`speech-2.6-hd` / `-turbo`、`speech-02-hd` / `-turbo`，单次最多 10000 字符。响应 `data.audio` 是 **hex 编码**的音频，插件会解码成二进制再落盘。`data.status` 为 1 表示合成中、2 表示完成。
- **异步长文本语音**：先 `POST /v1/t2a_async_v2` 创建任务（单次最多 100000 字符，音频字段用 `audio_sample_rate`、默认双声道），拿到 `task_id` 后用 `GET /v1/query/t2a_async_query_v2?task_id=…` 查询（`Processing` / `Success` / `Failed` / `Expired`，每秒最多查询 10 次），成功后用返回的 `file_id` 走 `GET /v1/files/retrieve?file_id=…` 拿下载地址。**下载地址只有 9 小时有效期**，过期后结果即丢失，所以任务完成后要尽快用 `minimax_media_status` 取回。
- **语音转文字**：`POST /v1/speech_to_text`，multipart 上传，模型 `asr-1.0`，返回 `text`（`verbose_json` 还会给分段与说话人数）。音频最长约 500 秒、50 MB 以内。

## 音乐已退役

`music-3.0`、`music-2.6`、`music-cover` 在官方模型列表里都标记为已退役，且自 2026-08-20 起音乐 API 不再向新用户开放，只剩存量付费账号可调用。插件仍保留 `minimax_generate_music` 工具与 `media.musicModel` 配置项，但新账号会直接收到服务端错误 —— 这是预期行为，不是插件故障。

## 任务记录与落盘

- 媒体任务**按会话隔离**并持久化到磁盘：进程重启后任务仍在，可以继续用 `minimax_media_status` 取回结果。
- 任务记录保存在 `media.dataDir`（默认 `$DSH_HOME/plugins/dsh-minimax-byapi`），按连接再分目录隔离，避免把不同端点的远端任务 id 混在一起。
- 下载先写 `.part` 临时文件，校验通过后再改名成最终文件，因此不会把半截文件当成成品交付。
- `minimax_media_retry_download` **只重试下载**，不会重新生成，因此不会重复计费；如果没有可下载的结果，它会拒绝而不是重新生成。
- 卸载插件不会删除这些文件，需要时自行清理 `$DSH_HOME/plugins/dsh-minimax-byapi`。

## 参考来源

- 生图：<https://platform.minimax.io/docs/api-reference/image-generation-t2i.md>、<https://platform.minimax.io/docs/api-reference/image-generation-i2i.md>
- 视频 v2：<https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md>、<https://platform.minimax.io/docs/api-reference/video-generation-v2-query.md>
- 视频 v1：<https://platform.minimax.io/docs/api-reference/video-generation-t2v.md>、<https://platform.minimax.io/docs/api-reference/video-generation-download.md>
- 语音合成：<https://platform.minimax.io/docs/api-reference/speech-t2a-http.md>
- 语音转文字：<https://platform.minimax.io/docs/api-reference/speech-to-text.md>
- 音乐：<https://platform.minimax.io/docs/api-reference/music-generation.md>

更详细的原始调研记录见 [`minimax-api-notes.md`](minimax-api-notes.md)。
