# MiniMax (稀宇科技) Open-Platform API — Research Report

Compiled 2026-11-05 from official docs only (`platform.minimax.io/docs`, `platform.minimaxi.com/docs`).
Docs are fetched as raw markdown at `<page>.md`; the index is `https://platform.minimax.io/docs/llms.txt`.

> **IMPORTANT FOR PLUGIN AUTHORS — the platform has moved on since the models named in the original request.**
> `MiniMax-M2`, `M2.1`, `M2.5`, `M2.7`, `M1`, `MiniMax-Text-01`, `MiniMax-VL-01`, `MiniMax-VL-01-Dyecomm` and `abab6.5`
> are all listed as **Retired** and no longer available. The current flagship LLMs are `MiniMax-M3.1-Flash` and
> `MiniMax-M3`. The China base URL is now **`api.minimax.cn`**, not `api.minimaxi.com` (the old host still answers).
> "Coding Plan" is now branded **M Plan** (the successor of "Token Plan").

---

## 1. Base URLs and regions

| Purpose | International | China (mainland) |
|---|---|---|
| OpenAI-compatible base | `https://api.minimax.io/v1` | `https://api.minimax.cn/v1` |
| Anthropic-compatible base | `https://api.minimax.io/anthropic` | `https://api.minimax.cn/anthropic` |
| Docs / console | `https://platform.minimax.io` | `https://platform.minimax.cn` (docs mirrored at `https://platform.minimaxi.com/docs`) |

- Environment-variable reference (international): `ANTHROPIC_BASE_URL=https://api.minimax.io/anthropic`,
  `OPENAI_BASE_URL=https://api.minimax.io/v1`, `MINIMAX_API_KEY=<YOUR_API_KEY>`
  (https://platform.minimax.io/docs/guides/quickstart-preparation.md)
- Same table for China: `ANTHROPIC_BASE_URL=https://api.minimax.cn/anthropic`,
  `OPENAI_BASE_URL=https://api.minimax.cn/v1` (https://platform.minimaxi.com/docs/guides/quickstart-preparation.md)
- **Verified by live probe** (2026-11-05, unauthenticated GET `/v1/models`): `api.minimax.io`, `api.minimax.cn` and
  `api.minimaxi.com` all returned HTTP **401** — i.e. all three hosts are alive. `api.minimaxi.com` is the legacy
  China host and still routes, but the current documented China host is `api.minimax.cn`. **Recommend `api.minimax.cn`.**

### Endpoints (relative to the base host)

| Path | Purpose |
|---|---|
| `POST /v1/chat/completions` | OpenAI Chat Completions compatible (https://platform.minimax.io/docs/api-reference/text-chat-openai.md) |
| `POST /v1/responses` | OpenAI Responses API compatible (https://platform.minimax.io/docs/api-reference/responses-create.md) |
| `POST /v1/responses/input_tokens` | Estimate input tokens without calling the model (https://platform.minimax.io/docs/api-reference/responses-input-tokens.md) |
| `POST /anthropic/v1/messages` | Anthropic Messages compatible (https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md) |
| `POST /anthropic/v1/messages/count_tokens` | Anthropic-compatible input-token counting (listed in API Overview; not independently fetched) |
| `GET /v1/models`, `GET /v1/models/{id}` | OpenAI-compatible model list / detail (https://platform.minimax.io/docs/api-reference/models/openai/list-models.md) |
| `GET /anthropic/v1/models` | Anthropic-compatible model list (https://platform.minimax.io/docs/api-reference/models/anthropic/list-models.md) |

**Anthropic-compatible endpoint exists**: `POST /anthropic/v1/messages`, base URL `https://api.minimax.io/anthropic`
(China: `https://api.minimax.cn/anthropic`). It serves the **same two models** (`MiniMax-M3.1-Flash`, `MiniMax-M3`)
as the OpenAI-compatible route — the difference is protocol, not model set.
Note: when using `@ai-sdk/anthropic`-style adapters that append `/messages` themselves, the base URL must include
`/v1` (`https://api.minimax.io/anthropic/v1`) — https://platform.minimax.io/docs/m-plan/opencode.md

**`/v1/responses` IS supported.** It is a first-class documented endpoint with its own OpenAPI spec
(`api-reference/text/api/openapi-responses.json`) and supports streaming, tools, multimodal input and the
`web_search` server tool. (Note: an older GitHub issue, MiniMax-AI/MiniMax-M2#112, requested it — that request
predates the current API and is now obsolete.)

---

## 2. Authentication

- **Header**: `Authorization: Bearer <API_KEY>`. The Anthropic route also accepts `x-api-key: <API_KEY>`;
  if both are present, `Authorization` wins. (https://platform.minimax.io/docs/api-reference/text-chat-anthropic.md)
- **GroupId: no longer required.** It does not appear in any current OpenAPI spec, and the official Dify
  setup says to *"set API Base to `https://api.minimax.io/anthropic`, and leave **Group ID** blank"*
  (https://platform.minimax.io/docs/m-plan/other-tools.md). The legacy error string still mentions
  *"token not match group"* under error code 1004, but GroupId is not part of any documented request.

### Two kinds of keys

| | Pay-as-you-go **API Key** | **M Plan Subscription Key** (a.k.a. "Coding Plan"/Token Plan) |
|---|---|---|
| Where created | `Account > API Keys` → https://platform.minimax.io/user-center/basic-information/interface-key | `Billing > M Plan` → https://platform.minimax.io/console/plan (CN: https://platform.minimax.cn/user-center/payment/token-plan) |
| Key prefix | (standard key) | `sk-cp-…` (mentioned repeatedly in the M Plan guides) |
| Header | `Authorization: Bearer <key>` | **Identical** — `Authorization: Bearer sk-cp-…` |
| Base URL | same hosts | **Same hosts** — `https://api.minimax.io/v1`, `https://api.minimax.io/anthropic` |
| Billing | deducts account balance | deducts M Plan quota (5-hour + weekly windows), then Credits, then balance |

- **Yes — the subscription key works against the standard OpenAI-compatible `/v1/chat/completions` path.**
  The official "Other tools" page documents exactly this: Base URL `https://api.minimax.io/v1`, API Key =
  M Plan API key (`sk-cp-…`), Model ID `MiniMax-M3.1-Flash`; and it shows Open WebUI / LangChain / Zed /
  OpenHands / nanobot all using `https://api.minimax.io/v1` with the `sk-cp-…` key.
  (https://platform.minimax.io/docs/m-plan/other-tools.md)
- "M Plan API keys are separate from standard pay-as-you-go API Keys and **cannot be used interchangeably**" —
  meaning the *billing source* differs, not the protocol. (https://platform.minimax.io/docs/m-plan/faq.md)
- **Model allowlist differs.** M Plan tiers Go / Explore / Build include `MiniMax-M3.1-Flash` (text) + image and
  audio models for all tiers; **H3 video only on Explore and Build**, not on Go. (https://platform.minimax.io/docs/m-plan/intro.md)
  M Plan is aimed at individual interactive use; pay-as-you-go is recommended for production.
- **Rate limits differ.** M Plan is governed by usage *windows* (5-hour + weekly for non-video; weekly-only for
  video) rather than the pay-as-you-go RPM/TPM tables. Errors `2062` (M Plan rate limit reached),
  `2067` (usage limit reached, credit auto-consumption off), `2068` (plan tier does not support this model),
  `2056` (usage limit exceeded), `2069` (model no longer available) are M-Plan-specific.
- Usage query endpoint (note: on the **www** host, not the API host):
  `curl 'https://www.minimax.io/v1/token_plan/remains' -H 'Authorization: Bearer <M Plan API key>'`
- Measured response shape (2026-11, M Plan subscription key, China host `www.minimax.cn`): the window data sits
  inside `model_remains[]` (one entry per model, e.g. `general`), the remaining share is reported directly as
  `current_interval_remaining_percent` / `current_weekly_remaining_percent`, the counters
  (`current_interval_total_count`, `current_interval_usage_count`, weekly equivalents) are `0`, and the reset
  times are epoch milliseconds (`end_time`, `weekly_end_time`) with `remains_time` / `weekly_remains_time` as
  countdowns. The international host `www.minimax.io` rejects the same key with `status_code 2049`, so the host
  follows the configured API host (`www.minimax.cn` / `www.minimaxi.com` for China).
- Error `2057` = "not token plan token — Please call this endpoint with your M Plan Subscription Key" (i.e. some
  endpoints require the subscription key specifically). Error `2061` = "your current token plan not support model".

---

## 3. Chat models available now

Only two LLMs are currently available (https://platform.minimax.io/docs/faq/models.md,
https://platform.minimax.io/docs/api-reference/api-overview.md):

| Model id | Context window | Max output tokens | Image input | Video input | Reasoning / thinking |
|---|---|---|---|---|---|
| `MiniMax-M3.1-Flash` | 1,000,000 | recommended **131072** (128K), max **524288** (512K) | ✅ | ✅ | Always on. Depth tunable via `reasoning_effort` / `output_config.effort` / `reasoning.effort` ∈ `low, medium, high, xhigh, max` (default `max`). `thinking: {"type":"disabled"}` → HTTP 400. |
| `MiniMax-M3` | 1,000,000 | recommended **131072** (128K), max **524288** (512K) | ✅ | ✅ | Thinking **off by default**; enable with `thinking: {"type":"adaptive"}` (Anthropic) or `reasoning.effort` (Responses). `thinking.type=disabled` skips thinking. `effort` is ignored by M3 (only M3.1-Flash tunes depth). |

- "The maximum token count refers to the total number of input and output tokens" for the 1M context.
- Legacy models are documented with recommended 65536 / max 204800 output — but all M2.x are retired, so irrelevant.
- `MiniMax-M3.1-Flash-Preview` is **retired**; requests with the old name are auto-served by `MiniMax-M3.1-Flash`.
- Chat-completions specifics: `max_completion_tokens` is the current field; `max_tokens` is **deprecated**.
  `temperature` and `top_p` are accepted but **have no effect** (always 1 and 0.95 respectively).
  `n` is not documented for chat completions. `tool_choice` supports `auto` / `none`.
  Roles accepted: `system`, `user`, `assistant`, `tool` — **`developer` is not in the enum** (there is a known
  GitHub issue about `developer` role being rejected with `2013`; the Anthropic route's role enum is
  `user, assistant, user_system, group, sample_message_user, sample_message_ai`).
- Multimodal content parts (OpenAI route): `type` ∈ `text` | `image_url` | `video_url`.
  `image_url` = `{ url, detail?: low|default|high, max_long_side_pixel? }`; JPEG/PNG/GIF/WEBP, ≤10 MB.
  `video_url` = `{ url, detail?, fps?: 0.2–5 (default 1), max_long_side_pixel? }`; MP4/AVI/MOV/MKV, ≤50 MB
  (Files API `mm_file://{file_id}` up to 512 MB). Request body ≤ 64 MB (413 beyond).
- Thinking content field: OpenAI chat → `choices[0].message.reasoning_content`; Anthropic → `thinking` content
  block (`type: "thinking"`, with `thinking` + `signature`); Responses → `output[]` item `type: "reasoning"`.
- `reasoning_split` (OpenAI route): `true` (default) puts thinking in `reasoning_content`; `false` inlines it in
  `content` wrapped in `<think>` tags — **not supported by M3.1-Flash**.
- `service_tier`: `standard` (default) | `priority` (1.5× price). Not supported by `MiniMax-M3.1-Flash`.

**Retired / unavailable** (https://platform.minimax.io/docs/faq/models.md): `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`,
`MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2.1-highspeed`, `MiniMax-M2`, `M2-her`.
M2.5/M2.7 stopped being available to new users on **Oct 19, 2026** and are **retired Nov 18, 2026**; for M Plan /
Token Plan users they are auto-routed to `MiniMax-M3.1-Flash`.
**`MiniMax-M1`, `MiniMax-Text-01`, `MiniMax-VL-01`, `MiniMax-VL-01-Dyecomm` and `abab6.5` do not appear in the
current model list at all** — they are long gone; I could not confirm any current availability for them.
Error `2069` = "model is no longer available", `2022` = "model is not exist".

### Example — OpenAI Chat Completions

```bash
curl https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "MiniMax-M3.1-Flash",
    "thinking": {"type": "adaptive"},
    "messages": [{"role": "user", "content": "Which is bigger, 9.11 or 9.9?"}],
    "max_completion_tokens": 500,
    "reasoning_effort": "max"
  }'
```

```json
{
  "id": "066b366b8e8beeafd3b8b49f89e00648",
  "choices": [{
    "finish_reason": "stop",
    "index": 0,
    "message": {
      "content": "**9.9 is bigger than 9.11.** ...",
      "reasoning_content": "The user is asking which is bigger...",
      "role": "assistant",
      "name": "MiniMax AI"
    }
  }],
  "created": 1780220779,
  "model": "MiniMax-M3.1-Flash",
  "object": "chat.completion",
  "usage": {
    "total_tokens": 484,
    "prompt_tokens": 172,
    "completion_tokens": 312,
    "prompt_tokens_details": {"cached_tokens": 159}
  },
  "input_sensitive": false,
  "output_sensitive": false,
  "base_resp": {"status_code": 0, "status_msg": ""}
}
```

### Example — Anthropic Messages

```bash
curl https://api.minimax.io/anthropic/v1/messages \
  -H "x-api-key: $MINIMAX_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"MiniMax-M3.1-Flash","max_tokens":4096,"output_config":{"effort":"max"},
       "messages":[{"role":"user","content":"Hi"}]}'
```

```json
{
  "id": "066b367ba949a58a9d6829b4bf8cbcd4",
  "type": "message",
  "role": "assistant",
  "model": "MiniMax-M3.1-Flash",
  "content": [
    {"thinking": "The user is asking which is bigger...", "signature": "6d03...", "type": "thinking"},
    {"text": "**9.9 is bigger than 9.11.**", "type": "text"}
  ],
  "usage": {"input_tokens": 13, "output_tokens": 149,
            "cache_creation_input_tokens": 0, "cache_read_input_tokens": 159},
  "stop_reason": "end_turn"
}
```

### Example — OpenAI Responses (`POST /v1/responses`)

Request: `{"model":"MiniMax-M3.1-Flash","reasoning":{"effort":"max"},"input":"Which is bigger, 9.11 or 9.9?"}`
Response shape: `{"id":..., "object":"response", "created_at":..., "model":..., "status":"completed",
"output":[{"type":"reasoning","content":[{"type":"reasoning_text","text":...}]},
{"type":"message","role":"assistant","content":[{"type":"output_text","text":...,"annotations":[]}]}],
"output_text":"<aggregated text>", "usage":{"input_tokens":218,"output_tokens":68,"total_tokens":286,
"input_tokens_details":{"cached_tokens":189},"output_tokens_details":{"reasoning_tokens":36}},
"error":null, "incomplete_details":null, ...}`

Multimodal parts on this route: `type` ∈ `input_text` | `output_text` | `input_image` | `input_video`;
`input_image.image_url` is a plain string **or** `{url, detail}`; `input_video.video_url` is a string or
`{url, fps, detail, max_long_side_pixel}`.

---

## 4. Image generation

**Endpoint: `POST /v1/image_generation`** — one path serves both text-to-image and image-to-image.
(https://platform.minimax.io/docs/api-reference/image-generation-t2i.md and .../image-generation-i2i.md)

Request fields:

| Field | Type | Notes |
|---|---|---|
| `model` | string | **Required.** `image-01` (t2i + i2i); `image-01-live` also allowed for i2i (image + reference, extra style settings) |
| `prompt` | string | **Required**, ≤ 1500 characters |
| `aspect_ratio` | string | default `1:1`. Allowed: `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16`, `21:9` |
| `width` / `height` | int | image-01 only; both must be set together; range [512, 2048], divisible by 8. **`aspect_ratio` takes priority** if both given |
| `response_format` | string | `url` (default) or `base64`. **URL expires in 24 hours** |
| `seed` | int64 | same seed + params ⇒ reproducible |
| `n` | int | **1–9**, default 1 |
| `prompt_optimizer` | bool | default `false` |
| `subject_reference` | array | i2i only. Each item: `{"type":"character","image_file":"<url or data:image/jpeg;base64,...>"}` — `type` currently only `character` (portrait); JPG/JPEG/PNG, <10 MB; best with a single front-facing portrait |

Aspect-ratio → pixel map (from the spec): `1:1`=1024x1024, `16:9`=1280x720, `4:3`=1152x864, `3:2`=1248x832,
`2:3`=832x1248, `3:4`=864x1152, `9:16`=720x1280, `21:9`=1344x576.

Response shape — **image URL or base64 lives under `data`**:

```json
{
  "id": "03ff3cd0820949eb8a410056b5f21d38",
  "data": {
    "image_urls": ["<url>", "<url>", "<url>"]
  },
  "metadata": {"success_count": "3", "failed_count": "0"},
  "base_resp": {"status_code": 0, "status_msg": "success"}
}
```

- `response_format: "url"` → `data.image_urls` (array of strings)
- `response_format: "base64"` → `data.image_base64` (array of base64 strings)
- `metadata.success_count` / `metadata.failed_count` (failed = blocked by content safety)

Request example:
```json
{
  "model": "image-01",
  "prompt": "A man in a white t-shirt, full-body, standing front view, outdoors, with the Venice Beach sign in the background, Los Angeles. Fashion photography in 90s documentary style, film grain, photorealistic.",
  "aspect_ratio": "16:9",
  "response_format": "url",
  "n": 3,
  "prompt_optimizer": true
}
```

Image-to-image example:
```json
{
  "model": "image-01",
  "prompt": "A girl looking into the distance from a library window",
  "aspect_ratio": "16:9",
  "subject_reference": [
    {"type": "character", "image_file": "https://cdn.hailuoai.com/prod/.../cover.jpg"}
  ],
  "n": 2
}
```

Pricing: `image-01` $0.0035 per image. Rate limit: **10 RPM** for image generation.

---

## 5. Video generation

Two generations of API coexist. **V2 is the current one** (MiniMax-H3 family); V1 is the legacy Hailuo/T2V-01 family.

### V2 (current) — `POST /v2/video_generation`

- Request (https://platform.minimax.io/docs/api-reference/video-generation-v2-create.md):
  - `model` (required): `MiniMax-H3` | `MiniMax-H3-Highspeed` | `MiniMax-H3-Lite` | `MiniMax-H3-Max`
  - `content` (required): array of multimodal items. `type` ∈ `text` | `image_url` | `video_url` | `audio_url`.
    **Every request must contain one non-empty `text` item** (≤7000 chars) or you get error `2013`.
    `role` ∈ `first_frame` | `last_frame` | `reference_image` | `reference_video` | `reference_audio`.
    **Image-to-video and reference-to-video are mutually exclusive.**
    URLs may be public URLs, `mm_file://{file_id}`, or base64 data URIs. Limits: images ≤30 MB (≤9 reference images),
    videos ≤50 MB (≤3, 2–15 s each, total ≤15 s), audio ≤15 MB (≤3, WAV/MP3), body ≤64 MB.
  - `resolution` (required): `480P` | `768P` | `2K` (only `MiniMax-H3` supports `2K`)
  - `duration` (required): integer 4–15 (`MiniMax-H3-Max`: 5–15)
  - `ratio`: `adaptive` (default) | `21:9` | `16:9` | `4:3` | `1:1` | `3:4` | `9:16`.
    Text-to-video **requires** a concrete ratio (not `adaptive`); image-to-video is always `adaptive`.
  - `extra`: `{"prompt_expansion_mode": "disabled"|"balanced"|"quality"}` (default `balanced`, `MiniMax-H3-Max` only)
  - `callback_url`: optional push; MiniMax sends a `challenge` you must echo within 3 s, then POSTs status updates.
    Callback `status` values: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- **Response field holding the task id: `task_id`** → `{"task_id": "424010985738629"}`

- Query: `GET /v2/query/video_generation/{task_id}`
  (https://platform.minimax.io/docs/api-reference/video-generation-v2-query.md). Only tasks from the last **7 days**
  are queryable. Response: `{"task": {...}}` with
  `id`, `model`, `status` ∈ `queued|running|succeeded|failed|cancelled`, `created_at`, `updated_at`,
  `content.url` (video download URL on success) or `content.prompt` (for `task_type=h3_context_ir`),
  `resolution`, `duration`, `ratio`, `task_type` ∈ `generation|h3_context_ir|regeneration`, `modality` ∈ `video|text`,
  `usage` (`total_seconds`, `input_seconds`, `output_seconds`, `input_image_count`, `input_audio_seconds`,
  `total_tokens`, `prompt_tokens`, `completion_tokens`), and on failure `error: {code, message}`.
  **No `file_id` in V2** — the video URL is in `task.content.url` and is time-limited.
- Also: `GET /v2/query/video_generation` (list, paginated), `POST /v2/h3_context_ir` (H3-Context-IR task),
  `POST /v2/video_regeneration` (768P → 2K regeneration).

### V1 (legacy Hailuo / T2V-01 family)

- Create: `POST /v1/video_generation` — **the same path for all four v1 variants**, discriminated by model + fields.
  - T2V: `model` ∈ `MiniMax-Hailuo-2.3` | `MiniMax-Hailuo-02` | `T2V-01-Director` | `T2V-01`;
    fields `prompt` (≤2000 chars), `prompt_optimizer` (default true), `fast_pretreatment` (default false,
    Hailuo-2.3/Hailuo-02 only), `duration` (default 6; 6 or 10), `resolution` ∈ `720P|768P|1080P`,
    `callback_url`. (https://platform.minimax.io/docs/api-reference/video-generation-t2v.md)
  - I2V: `model` ∈ `MiniMax-Hailuo-2.3` | `MiniMax-Hailuo-2.3-Fast` | `MiniMax-Hailuo-02` | `I2V-01-Director` |
    `I2V-01-live` | `I2V-01`; requires `first_frame_image` (URL or `data:image/jpeg;base64,...`, JPG/JPEG/PNG/WebP,
    <20 MB, short edge >300 px, aspect 2:5..5:2) plus optional `prompt`;
    `resolution` ∈ `512P|720P|768P|1080P`. (https://platform.minimax.io/docs/api-reference/video-generation-i2v.md)
  - FL2V (first & last frame) and S2V (subject reference) also use `POST /v1/video_generation`
    (https://platform.minimax.io/docs/api-reference/video-generation-fl2v.md,
    https://platform.minimax.io/docs/api-reference/video-generation-s2v.md)
  - `video-01` is **not** a documented model id — could not confirm it.
  - Response: `{"task_id": "106916112212032", "base_resp": {"status_code": 0, "status_msg": "success"}}`
- Query: `GET /v1/query/video_generation?task_id=<id>`
  (https://platform.minimax.io/docs/api-reference/video-generation-query.md). Response:
  `{"task_id": "...", "status": "Preparing|Queueing|Processing|Success|Fail", "file_id": "176844028768320",
  "video_width": 1920, "video_height": 1080, "base_resp": {...}}` — **`file_id` is returned on success**;
  note the **Capitalised** status values here (vs lowercase `succeeded` in V2).
- Download: `GET /v1/files/retrieve?file_id=<id>`
  (https://platform.minimax.io/docs/api-reference/video-generation-download.md). Response:
  `{"file": {"file_id":..., "bytes":..., "created_at":..., "filename":"output_aigc.mp4",
  "purpose":"video_generation", "download_url":"<url, valid for 1 hour>"}, "base_resp": {...}}`
- Raw bytes: `GET /v1/files/retrieve_content?file_id=<id>` returns the binary body directly
  (https://platform.minimax.io/docs/api-reference/file-management-retrieve-content.md).

**Async semantics**: both V1 and V2 are asynchronous — create returns a task id, you poll the query endpoint, then
fetch the file. V1 additionally supports `callback_url` push (callback `status` values
`"processing" | "success" | "failed"`); V2 callback uses `queued|running|succeeded|failed|cancelled`.

### Video model summary (current + legacy)

`MiniMax-H3` (768P/2K, 4–15 s), `MiniMax-H3-Highspeed` (480P/768P), `MiniMax-H3-Lite` (480P/768P),
`MiniMax-H3-Max` (480P/768P, 5–15 s), `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast`, `MiniMax-Hailuo-02`,
`T2V-01`, `T2V-01-Director`, `I2V-01`, `I2V-01-live`, `I2V-01-Director`, `S2V-01`.

---

## 6. Text to speech

### Synchronous HTTP: `POST /v1/t2a_v2`
(https://platform.minimax.io/docs/api-reference/speech-t2a-http.md)

Model ids accepted by the endpoint: `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`,
`speech-02-hd`, `speech-02-turbo`, `speech-01-hd`, `speech-01-turbo`.
**`speech-2.5-hd-preview` and `speech-2.5-turbo-preview` are NOT in the current spec** — could not confirm them.
Current flagship speech models per the model list: speech-2.8-hd / -turbo, speech-2.6-hd / -turbo, speech-02-hd / -turbo.

Request fields:

| Field | Type | Notes |
|---|---|---|
| `model` | string | **Required** |
| `text` | string | **Required**, < 10,000 characters. Streaming recommended over 3,000 chars. Pause markers `<#x#>` (0.01–99.99 s). Inline pronunciation via `(pinyin/IPA/Jyutping)`. Interjection tags `(laughs)`, `(sighs)`, … on speech-2.8 only |
| `stream` | bool | default false |
| `stream_options` | object | `exclude_aggregated_audio` (bool, default false) |
| `voice_setting` | object | **Required** in practice → `voice_id` (string); `speed` [0.5, 2] default 1; `vol` (0, 10] default 1; `pitch` [-12, 12] default 0; `emotion` ∈ `happy,sad,angry,fearful,disgusted,surprised,calm,fluent,whisper`; `text_normalization` (deprecated → `text_normalization_mode`); `latex_read` (bool) |
| `audio_setting` | object | `sample_rate` ∈ `8000,16000,22050,24000,32000,44100`; `bitrate` ∈ `32000,64000,128000,256000` (mp3 only); `format` ∈ **`mp3`, `pcm`, `flac`, `wav`, `pcmu_raw`, `pcmu_wav`, `opus`** (default mp3); `channel` ∈ `1,2` (default 1); `force_cbr` (bool) |
| `language_boost` | string | e.g. `Chinese`, `Chinese,Yue`, `English`, `auto`, … 40 languages; default null |
| `text_normalization_mode` | string | `basic` (rule-based) or `quality` (LLM+rules, non-streaming only, 2.6/2.8 models) |
| `pronunciation_dict` | object | `{"tone": ["omg/oh my god", ...]}` |
| `timbre_weights` | array | `[{voice_id, weight}]`, weight 1–100, up to 4 voices mixed |
| `voice_modify` | object | `pitch` [-100,100], `intensity` [-100,100], `timbre` [-100,100], `sound_effects` ∈ `spacious_echo, auditorium_echo, lofi_telephone, robotic` (one at a time) |
| `subtitle_enable` | bool | default false |
| `subtitle_type` | string | `sentence` (default) | `word` | `word_streaming` |
| `output_format` | string | `hex` (default) or `url` (valid 24 h). Only effective non-streaming; streaming is hex-only |

**Response shape — yes, audio is returned as HEX in `data.audio`:**

```json
{
  "data": {
    "audio": "<hex encoded audio>",
    "status": 2
  },
  "extra_info": {
    "audio_length": 11124,
    "audio_sample_rate": 32000,
    "audio_size": 179926,
    "bitrate": 128000,
    "word_count": 163,
    "invisible_character_ratio": 0,
    "usage_characters": 163,
    "audio_format": "mp3",
    "audio_channel": 1
  },
  "trace_id": "01b8bf9bb7433cc75c18eee6cfa8fe21",
  "base_resp": {"status_code": 0, "status_msg": "success"}
}
```

- `data.status`: **1 = synthesizing, 2 = completed**. `data` may be null → null-check required.
- `extra_info.audio_format` is documented as `mp3 | pcm | flac` (wav is requestable; the response enum lists only those three).
- Streaming: SSE (`text/event-stream`), each chunk `{"data":{"audio":"<hex>","status":1}, "trace_id":..., "base_resp":{...}}`,
  last chunk `status: 2` and carries `extra_info`.
- Subtitles: non-streaming → `data.subtitle_file` (download URL, JSON); streaming → `data.subtitle` / `data.subtitles`.

### Async long-text TTS: `POST /v1/t2a_async_v2`
(https://platform.minimax.io/docs/api-reference/speech-t2a-async-create.md)

- Same models as sync. `model` + `voice_setting` required. Either `text` (≤100,000 chars) **or** `text_file_id`
  (txt/zip, ≤100,000 chars per file, ≤1,000,000 per zip task) — mutually exclusive, one required.
- `audio_setting` here uses **`audio_sample_rate`** (not `sample_rate`), default 32000, `channel` default **2**.
- Response: `{"task_id": 95157322514444, "task_token": "eyJhbGciOiJSUz", "file_id": 95157322514444,
  "usage_characters": 101, "base_resp": {"status_code":0,"status_msg":"success"}}`
- Workflow: create task → poll `POST /v1/t2a_async_v2` query endpoint
  (https://platform.minimax.io/docs/api-reference/speech-t2a-async-query.md) → on success use the returned
  `file_id` with the File API to download. **The download URL is valid for 9 hours (32,400 s).**
- Outputs per input: audio file + sentence-level subtitle file + extra JSON file (per txt/json field).

### Voice IDs (real values)

From the System Voice ID list (https://platform.minimax.io/docs/faq/system-voice-id.md) and the Get Voice API:

| voice_id | Language | Style |
|---|---|---|
| `English_expressive_narrator` | English | Expressive Narrator |
| `English_Graceful_Lady` | English | Graceful Lady |
| `English_Persuasive_Man` | English | Persuasive Male |
| `English_Lucky_Robot` | English | Lucky Robot |
| `Chinese (Mandarin)_News_Anchor` | Chinese (Mandarin) | News Anchor (female, broadcast tone) |
| `Chinese (Mandarin)_Reliable_Executive` | Chinese (Mandarin) | Steady/reliable male executive |
| `Chinese (Mandarin)_HK_Flight_Attendant` | Chinese (Mandarin) | HK Flight Attendant |
| `Chinese (Mandarin)_Lyrical_Voice` | Chinese (Mandarin) | Lyrical Voice |
| `Cantonese_GentleLady` | Cantonese | Gentle Lady (use `language_boost: "Chinese,Yue"`) |
| `Cantonese_ProfessionalHost (F)` | Cantonese | Professional Female Host |
| `Japanese_Whisper_Belle` | Japanese | Whisper Belle |
| `Korean_CalmLady` | Korean | Calm Lady |
| `Spanish_Narrator` | Spanish | Narrator |
| `French_FemaleAnchor` | French | Female Anchor |
| `German_SweetLady` | German | Sweet Lady |
| `Russian_ReliableMan` | Russian | Reliable Man |

List programmatically: `POST /v1/get_voice` with `{"voice_type": "system"|"voice_cloning"|"voice_generation"|"all"}`
→ `system_voice[]`, `voice_cloning[]`, `voice_generation[]` each `{voice_id, voice_name, description[], created_time}`.
(https://platform.minimax.io/docs/api-reference/voice-management-get.md)

Other speech endpoints: WebSocket sync TTS, bidirectional streaming TTS
(https://platform.minimax.io/docs/api-reference/speech-t2a-websocket.md, .../speech-t2a-websocket-bidi.md),
voice cloning (`/v1/voice_clone` + upload endpoints), voice design, `GET /v1/get_voice`, delete voice.
Cloned/designed voices are **temporary**: deleted if unused for 168 h (7 days).

---

## 7. Music generation

**Endpoint: `POST /v1/music_generation`** (https://platform.minimax.io/docs/api-reference/music-generation.md)

⚠️ **Availability**: since **Aug 20, 2026** the paid music/lyrics APIs are **closed to new users** (existing paying
users can continue); the free variants (`music-3.0-free`, `music-2.6-free`, `music-cover-free`) are discontinued.
All music models are listed as **Retired** in the model list. The model list still shows `music-3.0` as the
latest music model. (https://platform.minimax.io/docs/faq/models.md)

- Model ids: `music-3.0` (recommended), `music-2.6`, `music-cover`, `music-3.0-free`, `music-2.6-free`,
  `music-cover-free`. **`music-01`, `music-1.5`, `music-2.0` are not current ids** — `Music-2.0` and `Music-2.5`
  appear only as *retired* pricing rows.
- Request fields:
  - `model` (required)
  - `prompt` (style/mood/scenario; 1–2000 chars; required for `music-cover`; optional for instrumental)
  - `lyrics` (≤3500 chars; `\n` separates lines; supports structure tags `[Intro] [Verse] [Chorus] [Bridge]
    [Outro] [Hook] [Inst] [Solo]` etc.)
  - `output_format`: `hex` (default) or `url` (url expires 24 h; streaming = hex only)
  - `audio_setting`: `sample_rate` ∈ `16000,24000,32000,44100`; `bitrate` ∈ `32000,64000,128000,256000`;
    `format` ∈ `mp3`, `wav`, `pcm`
  - `lyrics_optimizer` (bool, default false), `is_instrumental` (bool, default false)
  - `audio_url` / `audio_base64` / `cover_feature_id` — cover flow only; mutually exclusive.
    Reference audio: 6 s–6 min, ≤50 MB.
  - `stream` (bool, default false)
- **Response shape — hex audio, same pattern as TTS:**
  ```json
  {
    "data": {"audio": "hex-encoded audio data", "status": 2},
    "trace_id": "04ede0ab069fb1ba8be5156a24b1e081",
    "extra_info": {
      "music_duration": 25364,
      "music_sample_rate": 44100,
      "music_channel": 2,
      "bitrate": 256000,
      "music_size": 813651
    },
    "analysis_info": null,
    "base_resp": {"status_code": 0, "status_msg": "success"}
  }
  ```
  `data.status`: 1 = in progress, 2 = completed. With `output_format: "url"` the URL is returned instead of hex.
- Related: `POST /v1/lyrics_generation` (lyrics), `POST /v1/music_cover_preprocess` (returns `cover_feature_id`,
  valid 24 h) (https://platform.minimax.io/docs/api-reference/lyrics-generation.md,
  https://platform.minimax.io/docs/api-reference/music-cover-preprocess.md)
- Pricing (existing paying users): Music-3.0 / Music-2.6 / Music-2.5+ / Music-2.5 $0.15 per track (≤5 min);
  Lyrics $0.01/song; Music-2.0 $0.03/track. Rate limit 120 RPM (3 RPM for `-free`).

---

## 8. Other capabilities a plugin could expose as tools

| Capability | Available over HTTP? | How |
|---|---|---|
| **Image understanding / VLM** | ✅ | `image_url` content part on `/v1/chat/completions`, `/v1/responses`, `/anthropic/v1/messages` (JPEG/PNG/GIF/WEBP, ≤10 MB, base64 data URL or public URL). `detail`: `low`/`default`/`high`; `max_long_side_pixel`. Rough token cost: low ≈ few hundred–600, default ≈ 1k–3k (up to 5k), high ≈ several thousand (15k+) |
| **Video understanding** | ✅ | `video_url` content part (same three endpoints). MP4/AVI/MOV/MKV; URL/base64 ≤50 MB, Files API `mm_file://{file_id}` ≤512 MB; `fps` 0.2–5 (default 1); `detail`; `max_long_side_pixel` |
| **OCR** | ⚠️ No dedicated OCR endpoint documented | Do it via image understanding (VLM) on the chat endpoints. `API-vlm` is priced at $0.01/request in the MCP tool pricing table |
| **Speech-to-text / ASR** | ✅ | `POST /v1/speech_to_text`, `multipart/form-data`, model `asr-1.0`. (https://platform.minimax.io/docs/api-reference/speech-to-text.md) |
| **Server-side web search** | ✅ (Beta) | Anthropic Messages API: `tools: [{"type":"web_search_20250305","name":"web_search"}]`; OpenAI Responses API: `tools: [{"type":"web_search"}]`. (https://platform.minimax.io/docs/guides/server-tools.md) |
| **Speech-to-speech / realtime** | ❌ Not found | The docs expose WebSocket TTS (one-way and bidirectional text→audio streaming), but **no realtime speech-to-speech or audio-in/audio-out endpoint** appears in `llms.txt` or the API overview. Could not confirm one exists. |
| **Video Agent (templates)** | ✅ | `POST` create task + query task endpoints (https://platform.minimax.io/docs/api-reference/video-agent-create.md, .../video-agent-query.md) |
| **MCP servers (official)** | ✅ | https://github.com/MiniMax-AI/MiniMax-MCP (Python) and https://github.com/MiniMax-AI/MiniMax-MCP-JS — tools: `text_to_audio`, `list_voices`, `voice_clone`, `voice_design`, `play_audio`, `generate_video`, `image_to_video`, `query_video_generation`, `text_to_image`. (https://platform.minimax.io/docs/guides/mcp-guide.md) |

### ASR details (`POST /v1/speech_to_text`)
- `multipart/form-data`; fields: `model` (`asr-1.0`), `file` (binary), `response_format` ∈ `json`|`verbose_json`|`srt`|`vtt` (default `json`), `timestamp_level` ∈ `''`|`sentence`|`word`, `stream` (bool).
- Optional header `language`: BCP-47 tag — `zh, yue, en, ja, ko, th, vi, id, ms, fil, ar, tr, fr, de, es, it, pt, pl, ru, uk`. Omit for mixed-language.
- Audio constraints: formats wav/aiff/flac/alac(m4a)/mp3/aac/opus/ogg; ≤500 s (400 if over); ≤50 MB (413 if over); raw PCM not supported.
- Response (`json`): `{"text": "...", "duration": 26.325, "trace_id": "..."}`.
  `verbose_json` adds `n_speakers` and `segments[]` = `{id, start, end, speaker, text}`.
- Streaming emits SSE lines `data: {"index":0,"delta":"Hello","finish":false}` … final `{"finish":true,"duration":26.325}`.

---

## 9. Rate limits, quotas and error shapes

### Rate limits (https://platform.minimax.io/docs/guides/rate-limits.md)

| API | Model | RPM | Other |
|---|---|---|---|
| LLM | MiniMax-M3.1-Flash, MiniMax-M3 | **200** | **TPM 10,000,000** |
| Video (V1) | Hailuo series | 20 | — |
| Video (V2) | MiniMax-H3 | 300 | max **30** inflight tasks |
| T2A | speech-2.8-turbo/hd, speech-2.6-turbo/hd, speech-02-turbo/hd | 60 | — |
| Voice Cloning | — | 60 | — |
| Voice Design | — | 20 | — |
| Speech to Text | asr-1.0 | — | CONN 2, TPM 30,000 (TPM counts **audio seconds**) |
| Image Generation | image-01 | 10 | — |
| Music Generation | music-3.0 / music-2.6 / music-cover / music-2.0 | 120 | CONN 20 (free variants 3 RPM) |

Notes: Speech-to-Text is **paid accounts only** (not free tier). Growth limits exist as separate error codes
(`2045` rate growth, `2046` token growth, `2047` conn growth) — avoid sudden ramps.
M Plan users are instead governed by usage windows (5-hour + weekly for non-video; weekly-only for video).

### Error shapes — two distinct conventions

**(a) OpenAI-style error body** (used by video V2, ASR, and other OAI-style endpoints):
HTTP status = the real code; body:
```json
{
  "type": "error",
  "error": {
    "type": "bad_request_error",
    "message": "invalid params, content must include a non-empty text item (prompt is required) (2013)",
    "http_code": "400"
  },
  "request_id": "021785229015510a2c883cf675b9804d"
}
```
`error.type` values: `authorized_error` (401), `bad_request_error` (400), `rate_limit_error` (429),
`insufficient_balance_error` (402), `unprocessable_entity_error` (422), `overloaded_error` (529),
`server_error` (500), `invalid_request_error` (413). The **internal numeric code is in parentheses at the end of
`message`** (e.g. `(2013)`).

**(b) Anthropic-style error body** (used by `/anthropic/v1/messages`):
```json
{
  "type": "error",
  "request_id": "req_xxxxxxxx",
  "error": {"type": "permission_error", "message": "No permission to access this model or path."}
}
```
`error.type` ∈ `invalid_request_error, authentication_error, permission_error, not_found_error,
request_too_large, rate_limit_error, api_error, overloaded_error`. Status codes documented: 400, 401, 403,
404, 413, 429, 500, 529. During streaming, errors arrive as an `event: error` SSE with the same body.

**(c) Legacy `base_resp` convention** (used by image generation, video V1, T2A, music, file APIs):
HTTP 200 with `base_resp.status_code` != 0:
```json
{"base_resp": {"status_code": 2013, "status_msg": "invalid params"}}
```
Chat Completions also carries `base_resp` (`status_code`, `status_msg`) alongside `input_sensitive` /
`output_sensitive` (+ `_type` ints) fields.

**Status code → HTTP mapping** observed across endpoints: 1002 rate limit → 429; 1004 auth failed → 401;
1008 insufficient balance → 402; 1026/1027 sensitive content → 422; 2013 invalid params → 400; 2049 invalid
API key → 401; 1000/1024 internal error → 500.

### Full error-code table (https://platform.minimax.io/docs/api-reference/errorcode.md)

`1000` unknown error · `1001` request timeout · `1002` rate limit · `1004` not authorized/token not match group ·
`1008` insufficient balance · `1024` internal error · `1026` input sensitive · `1027` output sensitive ·
`1033` system error/mysql failed · `1039` token limit · `1040` input audio sensitive · `1041` conn limit ·
`1042` invisible character ratio limit · `1043` ASR similarity check failed · `1044` clone prompt similarity failed ·
`1045` rate limit exceeded (task concurrency) · `1046` prompt rejected by identity policy ·
`2013` invalid params · `20132` invalid samples or voice_id · `2014` empty input · `2022` model is not exist ·
`2037` voice duration too short/long · `2038` voice clone user forbidden · `2039` voice clone voice id duplicate ·
`2042` no access to this voice_id · `2043` model does not support this voice_id · `2045` rate growth limit ·
`2046` token growth limit · `2047` conn growth limit · `2048` prompt audio too long · `2049` invalid API Key ·
`2051` audio quality check failed · `2052` insufficient voice slot · `2053` insufficient credit · `2054` voice id not exist ·
`2056` usage limit exceeded (5-hour window) · `2057` not token plan token · `2061` current token plan not support model ·
`2062` M Plan rate limit reached · `2064` server cluster under high load · `2066` request timed out while processing ·
`2067` usage limit reached and credit auto consumption off · `2068` current plan tier does not support this model ·
`2069` model is no longer available · `2160` speech recognition temporarily unavailable.

---

## Explicitly NOT confirmed

- `MiniMax-M1`, `MiniMax-Text-01`, `MiniMax-VL-01`, `MiniMax-VL-01-Dyecomm`, `abab6.5` — absent from the current
  model list; no current context-window / modality data could be found. Treat as retired.
- `speech-2.5-hd-preview` / `speech-2.5-turbo-preview` — not in the current `t2a_v2` model enum.
- `music-01`, `music-1.5` — not current model ids; `Music-2.0`/`Music-2.5` appear only as retired pricing rows.
- `video-01` — not a documented model id anywhere I checked.
- Whether `api.minimaxi.com` is officially still supported (it answered HTTP 401 live, so it is alive, but the
  current docs only document `api.minimax.cn` for China).
- Whether GroupId is *ever* still required — it is absent from all current specs and docs say leave it blank.
- A realtime / speech-to-speech HTTP endpoint — none found in the docs index or API overview.
- Whether `POST /anthropic/v1/messages/count_tokens` exists as described — listed in the API Overview endpoint
  summary but the page itself was not fetched.
- Detailed per-request field docs for `POST /v2/query/video_generation` (list) and the video-agent endpoints —
  only linked, not fetched.
