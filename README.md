# dsh-minimax-api

Native MiniMax for DeepSeek Harness: chat with a subscription (M Plan) key or a pay-as-you-go API key, image, video, speech and speech-to-text tools on the official MiniMax API, and a MiniMax usage row in the sidebar.

[![CI](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml/badge.svg)](https://github.com/NingYuanLee/dsh-minimax-byapi/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/dsh-minimax-api.svg)](https://www.npmjs.com/package/dsh-minimax-api) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![Node >=22.19](https://img.shields.io/badge/node-%3E%3D22.19.0-339933.svg)](#compatibility) [![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.2%20%3C0.3.0--0%20%7C%7C%20%3E%3D0.2.2--0%20%3C0.3.0--0-6f42c1)](#compatibility) [![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-6f42c1.svg)](https://github.com/topics/dsh-plugin) [![powered by dsh](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

English | [中文](README.zh.md)

> **Published on npm.** `dsh plugin add dsh-minimax-api` installs the released package; a git clone or a local checkout works too — see [Install](#install).

One plugin, one MiniMax connection. Chat models appear in the model picker; image, video, speech and music models stay out of it and are used through tools instead. Any chat model — MiniMax or another provider — can call those tools. The plugin talks to the official MiniMax open platform, keeps the API key in the dsh credential service, and saves generated media locally. A MiniMax row at the foot of the sidebar shows how much of the 5-hour and weekly M Plan limits you have used, and the `MiniMax API` settings tab edits the connection, the language models and the media models in one place. It is not an OAuth client, does not issue credentials or grant quota, and does not read any MiniMax CLI token.

## Features

| Area | Current scope |
| --- | --- |
| Chat provider | Registers a native dsh LLM provider: route `minimax-api`, display name **MiniMax**. Streaming text and tool calls go through the official pi-ai adapter, over either the OpenAI-compatible or the Anthropic-compatible route. |
| Model catalog | `GET {root}/v1/models` discovery, merged with the plugin's built-in model constants, auto-categorized as chat, image, video, speech, music, research, or unknown. Only chat models enter the picker. Per-model overrides are available. |
| Connection presets | Five access modes: pay-as-you-go (international / China) and M Plan subscription (international / China), plus a custom endpoint. The preset fills the base URL and the chat protocol. |
| Settings page | Access mode, API address, API key, verification, timeout, the language-model table (the picker's source of truth), and separate image, video and speech model sections. The same form opens from `Settings → MiniMax API`. Copy follows the dsh language (English or Chinese). |
| Usage in the sidebar | A MiniMax row at the foot of the sidebar shows the used share of the 5-hour and weekly M Plan limits; its panel adds the used/total counts and a reset countdown. It refreshes over the network every minute. A pay-as-you-go key has no M Plan quota, so the row hides itself. |
| Connection probe | Opening the Models page tests the saved key once against `GET /v1/models` in the host and shows a single gray/green/red dot after the plugin tag; hovering it reveals the latency or the failure reason. The key never reaches the browser. |
| Durable media tasks | Task records are per session and survive restarts. Downloads write `.part` files and are renamed after validation. A failed download can be retried without regenerating, so nothing is billed twice. |
| Results in chat | Tool result cards, file preview, and a sidebar player for MP4, MP3 and WAV. Tool cards and the player follow the dsh language. |

The plugin registers two components: `minimax-api` (chat, model catalog, settings page) and `dsh-minimax-media` (media tools). Together they register 13 tools:

| Tool | What it does |
| --- | --- |
| `minimax_models` | Refreshes the catalog and returns models grouped by capability. Optional `verify_key` checks address and key with one `GET /v1/models`. |
| `minimax_quota` | Reads the M Plan remaining quota and reset times (5-hour and weekly windows). Subscription key only — a pay-as-you-go key is refused. |
| `minimax_generate_image` | Text to image: `prompt`, optional `model`, aspect ratio, `n` (1–9, default 1), style settings for `image-01-live`. |
| `minimax_edit_image` | Image to image: `prompt` plus a reference image (`subject_reference`). |
| `minimax_generate_video` | Text to video. V2 models (MiniMax-H3 family) run 4–15 s; V1 models (Hailuo family) run 6 s or 10 s. |
| `minimax_list_voices` | Lists the `voice_id` values this account can use (`system` / `voice_cloning` / `voice_generation` / `all`). |
| `minimax_speak` | Synchronous text to speech: `text` up to 10000 characters, optional `model`, `voice_id`, speed, volume, pitch, emotion and format. |
| `minimax_speak_long` | Asynchronous long-form speech: `text` up to 100000 characters, returns a task id to fetch with `minimax_media_status`. |
| `minimax_transcribe` | Speech to text: uploads an audio file and returns the transcript. |
| `minimax_generate_music` | Text to music. Retired by MiniMax — see [Music](#music-is-retired). |
| `minimax_media_list` | Lists media tasks created in the current session. |
| `minimax_media_status` | Checks a task and downloads the result when ready: `task_id`. |
| `minimax_media_retry_download` | Retries a failed download without regenerating: `task_id`. |

Not provided: realtime voice conversation (audio-in / audio-out), voice cloning, voice design, MiniMax's server-side web search tool, and a live task dashboard. Video jobs are polled in-process after submit, but the result card is a snapshot and does not refresh itself — call `minimax_media_status` to fetch the finished file. Model classification is rule-based, not a guarantee.

## Compatibility

| Component | Requirement | Verified |
| --- | --- | --- |
| dsh | `>=0.2.1-rc.2 <0.3.0-0 \|\| >=0.2.2-0 <0.3.0-0` via `engines.dsh` | `0.2.2-rc.1` in an isolated Web profile: install, load, both components running, settings page rendered. Chat and media calls still need a real key — see [VALIDATION.md](VALIDATION.md) |
| Node.js | `>=22.19.0` | CI runs Node 22.19 and 24 on Linux and Windows |
| MiniMax | Official open platform, international (`api.minimax.io`) or China (`api.minimaxi.com` / `api.minimax.cn`) | Chat verified live with a real key on the China M Plan route; the media endpoints are documented only — see [VALIDATION.md](VALIDATION.md) |
| Other dsh 0.2.x | Inside the `engines.dsh` range | Not individually verified |

`engines.dsh` is the compatibility gate; `peerDependencies` pin the SDK packages the source uses but do not decide compatibility, so rerun the integration tests after a dsh upgrade.

## Connection and the two kinds of key

MiniMax issues two kinds of credential, and the plugin treats them the same way on the wire:

| | Pay-as-you-go API key | M Plan subscription key |
| --- | --- | --- |
| Prefix | standard key | `sk-cp-…` |
| Header | `Authorization: Bearer <key>` | **Identical** — `Authorization: Bearer sk-cp-…` |
| Hosts | same hosts | same hosts |
| Billing | deducts account balance | deducts M Plan quota, then credits, then balance |
| Model tiers | all available models | plan tier decides which models you may call |

Both key types speak the same protocol; only the billing source and the available model tiers differ. The plugin stores the key in the dsh credential service under the reference name `MINIMAX_API_KEY` and never writes it into the configuration.

Both China hosts answer: `api.minimaxi.com` (the preset default) and `api.minimax.cn` (the host the current CN OpenAPI specs list). They behave identically for chat, media and quota; switch to `custom` if you need the other spelling.

### Access modes

`connection.plan` fills the base URL and the chat protocol:

| Plan | Base URL | Chat protocol |
| --- | --- | --- |
| `payg-global` — pay-as-you-go, international | `https://api.minimax.io/v1` | `openai-completions` |
| `payg-cn` — pay-as-you-go, China | `https://api.minimaxi.com/v1` | `openai-completions` |
| `coding-global` — M Plan, international | `https://api.minimax.io/anthropic` | `anthropic-messages` |
| `coding-cn` — M Plan, China | `https://api.minimaxi.com/anthropic` | `anthropic-messages` |
| `custom` — bring your own endpoint | empty | `openai-completions` |

On the official hosts the address and the protocol are paired: `/v1` speaks OpenAI-compatible, `/anthropic` speaks Anthropic-compatible. Changing the protocol in the settings page rewrites the path for you, and changing an access preset fills both. Custom endpoints are never rewritten.

The settings page defaults to **`coding-cn` with `anthropic-messages`**, so a fresh install points at `https://api.minimaxi.com/anthropic` — the China M Plan route on MiniMax's recommended protocol.

**MiniMax recommends the Anthropic-compatible route** (the docs label it "recommended" and the SDK examples lead with it). It serves the same two models with the same bearer key, and it is the only route where the thinking depth travels as `output_config.effort`. Use `coding-global` / `coding-cn` if you want that default; both key types work there.

### M Plan quota

`minimax_quota` calls `GET https://www.minimax.io/v1/token_plan/remains` (China: `https://www.minimax.cn/v1/token_plan/remains`) and returns the remaining and used quota with reset times for the 5-hour rolling window and the weekly window, plus a per-model split when the server provides one.

- **Subscription key only.** A pay-as-you-go key is refused by the service; the tool reports that instead of failing silently.
- Text, image, audio and other non-video capabilities are limited by both windows; video models are limited by the weekly window only, and unused quota does not carry over.
- The response field names are not documented upstream. The live answer (subscription key, measured) keeps the window data inside `model_remains[]` with one entry per model and reports the remaining share as `current_interval_remaining_percent` / `current_weekly_remaining_percent`; the counters are zero in that shape. The plugin reads that shape, and when several models are listed the tightest window wins. The older counter-shaped answer (top-level `current_*_usage_count`, reported by MiniMax issue trackers as *remaining* rather than used) is still parsed as a fallback. Treat the MiniMax console usage page as authoritative.
- The quota is read on demand, never polled or cached.

**Usage in the left sidebar.** The sidebar foot carries a MiniMax usage row that shows the used share of both the 5-hour and the weekly limit without opening anything; clicking it opens a panel with both limits, their used amounts and percentages, and how long until each limit resets. The widget refreshes itself over the network every minute and can be refreshed by hand.

**MiniMax settings tab.** `Settings → MiniMax API` opens the same connection, language-model and media configuration as the plugin detail page. Model rows stay single-line and scroll horizontally when needed; the delete action is an icon-only button.

- Querying needs the API key, and keys stay in the dsh credential store and never cross the wire, so the query runs in the host process and the web client calls the host over `/api/minimaxQuota/quota`.
- A pay-as-you-go key has no M Plan quota at all, so the usage row hides itself instead of showing an error.

## Install

**From npm (recommended):**

```powershell
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add dsh-minimax-api
```

**From git:**

```powershell
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add "git+https://github.com/NingYuanLee/dsh-minimax-byapi.git"
```

**From a local checkout (development):**

```powershell
git clone https://github.com/NingYuanLee/dsh-minimax-byapi.git
cd dsh-minimax-byapi
npm install --ignore-scripts
dsh --profile minimax-test --from-default-profile web --dump-config
dsh plugin --profile minimax-test add "$PWD"   # bash/zsh: "$(pwd)"
```

`--dump-config` creates the profile from your default profile and prints the merged configuration without starting a server. `dsh plugin add` records the bundle in that profile — no manual YAML edit. The package has no `prepare` or `postinstall` script, so installation runs no build code and needs no `allowBuilds` entry.

Start dsh with that profile:

```powershell
dsh --profile minimax-test --no-open
```

Keep the plugin in a dedicated profile until you are satisfied; this keeps the provider, tools and settings out of your daily environment. For a fully isolated trial, point `DSH_HOME` at a scratch directory.

## Update and uninstall

Updating a git install means removing it and adding the new commit; local installs update with `git pull` and `npm install --ignore-scripts`; an npm install picks up the new version when you remove and re-add the plugin. Restart dsh afterwards.

```powershell
dsh plugin --profile minimax-test remove dsh-minimax-api
```

Removing the plugin takes its layers out of the profile: the provider, the 13 tools and the settings page are gone. Generated media and task records are **not** deleted, and the credential is **not** removed either. Delete the data directory yourself if you want the files gone:

```powershell
Remove-Item -Recurse -Force "$env:DSH_HOME\plugins\dsh-minimax-api"
```

Delete the credential in dsh if you no longer need it.

## Configuration

Use the plugin settings page for normal setup. Manual configuration in the profile's `cordis.patch.yml` is possible but optional:

```yaml
- id: minimax-api
  name: dsh-minimax-api
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

| Key | Default | Notes |
| --- | --- | --- |
| `connection.plan` | `coding-cn` | Access mode: `payg-global`, `payg-cn`, `coding-global`, `coding-cn`, `custom`. Fills `baseURL` and `api`. The default is the China M Plan route on the recommended Anthropic-compatible protocol. |
| `connection.baseURL` | `https://api.minimaxi.com/anthropic` | API address. Non-local addresses must be HTTPS; the path is normalized to `/v1` or `/anthropic`. |
| `connection.apiKey` | empty | Direct key override for local testing; takes precedence over the credential. Leave empty in normal use. |
| `connection.apiKeyEnv` | `MINIMAX_API_KEY` | Credential reference name in the dsh credential service. |
| `connection.api` | `anthropic-messages` | Chat protocol: `openai-completions`, `openai-responses` or `anthropic-messages`. |
| `connection.verify` | `true` | Verify `GET {root}/v1/models` with the saved key when settings are saved. |
| `connection.timeoutMs` | `60000` | Request timeout in milliseconds (1000–600000). |
| `media.imageModel` | empty | Image model used when a call omits `model`. |
| `media.videoModel` | empty | Video model used when a call omits `model`. |
| `media.speechModel` | empty | TTS model used when a call omits `model`. |
| `media.musicModel` | empty | Music model used when a call omits `model`. Retired upstream; only existing paying accounts can call it. |
| `media.dataDir` | empty | Media output directory; empty means `$DSH_HOME/plugins/dsh-minimax-api`. |
| `modelOverrides` | `[]` | Per-model overrides written by the settings page: category, display name, image support, context window, max output, reasoning efforts. Applied on the next refresh. |

`connection`, `media` and `modelOverrides` are volatile sections: after saving, dsh reloads the plugin layer and the model catalog is discovered again.

The settings page writes the API key into the dsh credential service under the reference name above; the configuration keeps only the reference. Do not hand-write a key into YAML.

## Capabilities

### Chat models

| Model | Context | Recommended output | Image input | Thinking |
| --- | --- | --- | --- | --- |
| `MiniMax-M3.1-Flash` | 1,000,000 | 131,072 | yes | Always on; depth `low` / `medium` / `high` / `xhigh` / `max` |
| `MiniMax-M3` | 1,000,000 | 131,072 | yes | Adaptive; no effort dial |

Retired and no longer callable: `MiniMax-M2`, `M2.1`, `M2.5`, `M2.7`, `M2.7-highspeed`, `M1`, `Text-01`, `VL-01` and `abab6.5`. M Plan users are routed to `MiniMax-M3.1-Flash` automatically.

### Text model parameters

The plugin maps MiniMax's text parameters onto the dsh surfaces that own them. Parameters are per request, so they live in dsh's model picker and the plugin settings page's model table, not in a separate form:

| MiniMax parameter | What the plugin does | Where you control it |
| --- | --- | --- |
| `max_completion_tokens` (Chat Completions) / `max_tokens` (Anthropic) / `max_output_tokens` (Responses) | Sends the request's output cap under the field that protocol expects — `max_tokens` is never sent, it is deprecated upstream | dsh picks the cap per call; the model table's max-output column is the catalog default (131,072 recommended, 524,288 hard cap) |
| `reasoning_effort` (Chat Completions) | Sent as `reasoning_effort` with `low` / `medium` / `high` / `xhigh` / `max`; nothing is sent when no level is chosen, so the server keeps its default (`max`) | Reasoning level in the model picker; the levels on offer come from the model table's reasoning column |
| `output_config.effort` (Anthropic-compatible) | Sent as `output_config.effort` with the same five levels | Same reasoning level |
| `thinking` | Only `adaptive` is ever sent. On the Anthropic route the plugin forces adaptive thinking, because pi-ai's default budget form (`type: "enabled"`, `budget_tokens`) is not accepted by MiniMax | Implicit: `MiniMax-M3.1-Flash` always thinks; `MiniMax-M3` thinks when a level is selected, otherwise the server default stands |
| `reasoning_content` | Parsed as the model's thinking channel; no switch is sent (`reasoning_split` defaults to the split form) | Read-only |
| `temperature` / `top_p` | Not sent as user knobs; MiniMax ignores them anyway (fixed at 1 and 0.95) | Not available — upstream ignores the value |
| `service_tier`, `reasoning_split`, `seed` for text | Not exposed: the adapter has no field for them | Not available |

Two route differences worth knowing: `MiniMax-M3` defaults to adaptive thinking on the OpenAI-compatible route but to no thinking on the Anthropic-compatible route, and `MiniMax-M3.1-Flash` rejects `thinking: disabled` on both. The plugin therefore never sends a disable request.

The catalog is the merge of `GET {root}/v1/models` and the plugin's built-in constants, so the media models below stay listed even when the discovery endpoint only returns chat models. The settings page's model table is what the picker shows — delete a row and save to hide that model.

### Media models

| Capability | Models |
| --- | --- |
| Image | `image-01` (text and image to image), `image-01-live` (same, plus style settings) |
| Video (v2 endpoint) | `MiniMax-H3` (768P / 2K, 4–15 s), `MiniMax-H3-Highspeed` (480P / 768P, 4–15 s), `MiniMax-H3-Lite` (480P / 768P, 4–15 s, no `adaptive` ratio), `MiniMax-H3-Max` (480P / 768P, 5–15 s) |
| Video (v1 endpoint) | `MiniMax-Hailuo-2.3`, `MiniMax-Hailuo-2.3-Fast` (image to video only), `MiniMax-Hailuo-02` — 6 s or 10 s, 512P / 720P / 768P / 1080P |
| Speech | `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo` |
| Speech to text | `asr-1.0` |
| Music | `music-3.0`, `music-2.6`, `music-cover` — retired, see below |

Each media picker in the settings page shows a one-line description of the currently selected model, and the options carry the same text as a tooltip. Image generation accepts an aspect ratio of `1:1`, `16:9`, `4:3`, `3:2`, `2:3`, `3:4`, `9:16` or `21:9` — `21:9` is `image-01` only — a prompt of at most 1500 characters and `n` between 1 and 9. `image-01` also accepts an explicit `width`/`height` pair (512–2048 px, multiples of 8, both required); when both are given the plugin honours the explicit pixel size and does not send `aspect_ratio` (upstream would otherwise ignore `width`/`height`). `image-01-live` additionally accepts a `style` object (`style_type` 漫画 / 元气 / 中世纪 / 水彩, `style_weight` in (0, 1]). Image-to-image passes the reference image as `subject_reference` (a `character` reference: a public URL or a `data:image/jpeg;base64,…` Data URL, JPG/JPEG/PNG under 10 MB).

Video generation is asynchronous in three steps: create the task, query the task, then download the file. The plugin keeps the task id, so `minimax_media_status` can fetch the finished clip without submitting a new one.

### Music is retired

MiniMax has retired the music models, and since **2026-08-20** the music API is closed to new users — only existing paying accounts can still call it. The `minimax_generate_music` tool and the `media.musicModel` setting remain in place for those accounts, but a new account will get an error from the server. Treat music as a legacy capability, not as something to plan around.

## Permissions and privacy

- **Network:** only the MiniMax endpoint you configure. Discovery calls `GET {root}/v1/models`, chat uses the configured route, and the media tools call the image, video, speech, speech-to-text and music endpoints on the same host. No telemetry, no analytics, no third-party service.
- **Credentials:** the key lives in the dsh credential service under the reference name `MINIMAX_API_KEY`; it is not written to YAML, to logs, to task records or to the repository. Media download requests are sent to MiniMax's own file host and carry no separate credential.
- **Files:** generated media goes to `$DSH_HOME/plugins/dsh-minimax-api` (or `media.dataDir`). Task records may contain time-limited upstream URLs; treat them as private.
- **Data leaves your machine:** prompts, the reference images you attach, the audio you upload for transcription and the text you synthesize are sent to MiniMax to be processed, exactly as you send them in the chat prompt. The plugin does not filter, redact or re-host that content.
- **Not done by this plugin:** reading or reusing a MiniMax CLI token, installing or running other plugins, fetching runtime dependencies at install time, calling the server-side web search tool, voice cloning or voice design.

Installing any dsh plugin runs third-party code with your user permissions, and tool approvals do not sandbox plugin code — review the source before installing. Please report security issues through [SECURITY.md](SECURITY.md).

## Usage

- **Chat:** choose **MiniMax** in the model picker. Only chat models are listed; the settings page's model table is what the picker shows, so delete a row and save to hide that model.
- **Images:** one call generates and saves; inline the result with an absolute local path — `![alt](<D:/path/result-1.png>)`. dsh Web serves it through `/api/file`; the limit is 20 MiB per file.
- **Video:** submits a job. Call `minimax_media_status` with the returned `task_id` until the result is saved or the task failed; the status card does not refresh by itself. Do not resubmit a job whose submission status is unknown — that would be billed twice.
- **Speech:** `minimax_speak` writes an audio file for text up to 10000 characters; `minimax_speak_long` submits an asynchronous job for long text and returns a task id to fetch with `minimax_media_status`; `minimax_list_voices` returns the `voice_id` values to pass to either. `minimax_transcribe` uploads a local audio file and returns the transcript as text.
- **Display:** video and audio appear in the tool result card player. Do not inline them with Markdown image syntax — the chat does not render them and shows a broken image instead.

## Troubleshooting

Installation is successful when all four checks pass:

1. `dsh --profile minimax-test --dump-config` lists the `minimax-api` layer.
2. The Plugins page shows this plugin with both components (`minimax-api` and `dsh-minimax-media`) running.
3. `minimax_models` returns categorized model IDs.
4. After `dsh plugin --profile minimax-test remove dsh-minimax-api`, the layers and components are gone.

| Symptom | Fix |
| --- | --- |
| `dsh plugin add` fails or reports 404 | Use the git or local-checkout form above; that path does not depend on the npm registry. |
| Plugin is listed but does not load | Your dsh is outside `>=0.2.1-rc.2 <0.3.0-0 \|\| >=0.2.2-0 <0.3.0-0`. Upgrade to a 0.2.x build. |
| 401 or 403 in settings | Wrong key or base URL. Re-save the key and check the address preset (`api.minimax.io` vs `api.minimaxi.com`). |
| "该地址没有开放模型列表接口" | That address does not expose `GET /v1/models`; the self-check is skipped and the built-in model constants are used. |
| Connection refused or timeout | The endpoint is unreachable, or the account has no balance left. `timeoutMs` caps each request. |
| No MiniMax models in the picker | `/v1/models` returned nothing classified as chat; refresh with `minimax_models` and add overrides. |
| Model not discovered or wrong category | Refresh `minimax_models`, then correct the category in the settings page. |
| Media call fails while chat works | The account does not have access to that model or capability — a music call on a new account fails this way by design. |
| Video stays generating | Query `minimax_media_status`; do not resubmit a task whose submission status is unknown. |
| Download failed but the task is done | Call `minimax_media_retry_download`; it retries the download only and never regenerates. |

More measured behavior and limits: [VALIDATION.md](VALIDATION.md).

## Development and testing

```bash
npm install --ignore-scripts
npm test             # automated tests
npm run check        # syntax checks for the source files
npm run build        # rebuilds lib/client.js from src/client.js
npm pack --dry-run
```

CI (`.github/workflows/ci.yml`) runs on Linux and Windows with Node 22.19 and 24: install, tests, syntax checks, build, a check that `lib/client.js` matches the build output, and a pack dry run. Pushing a `v*` tag runs `.github/workflows/release.yml`, which verifies that the tag matches `package.json`, repeats the checks, attaches the packed tarball to a GitHub Release, and publishes to npm through trusted publishing (OIDC) — the workflow stores no npm token and lets GitHub mint a short-lived OIDC token instead.

Trusted publishing has to be registered for the package once. With npm CLI 11.16 or newer the registration can be done from the command line (an npm login is required first):

```bash
npm trust github dsh-minimax-api --file release.yml --repo NingYuanLee/dsh-minimax-byapi --allow-publish
```

`--file` takes the workflow file name only, `--repo` the `owner/repo` pair, and `--allow-publish` lets this trusted publisher run `npm publish` (`npm stage publish` is always allowed). The same registration can be made on npmjs.com under **Packages → `dsh-minimax-api` → Settings → Trusted publishing**:

| Field | Value |
| --- | --- |
| Organization or user | `NingYuanLee` |
| Repository | `dsh-minimax-byapi` |
| Workflow filename | `release.yml` |
| Environment name | leave empty |

The workflow filename is the file name only — `release.yml`, matching `.github/workflows/release.yml` exactly, including case.

### Publishing from a local checkout

npm revoked every classic token, and a granular access token can no longer publish a new version directly, so a local release goes through the two-hour session token that `npm login --auth-type=web` sets up:

```bash
npm login --auth-type=web   # open the printed URL and finish WebAuthn / TOTP in the browser
npm publish --otp <code>    # <code> is the 6-digit one-time passcode from your authenticator
```

The one-time passcode is required at publish time; `npm publish` asks for it interactively when `--otp` is omitted. Keep tokens and passcodes out of the repository, out of logs and out of commit messages.

Further reading: [docs/connection-and-keys.md](docs/connection-and-keys.md) for the access modes, key types and model status; [docs/media-workflow.md](docs/media-workflow.md) for the media task lifecycle; [docs/minimax-api-notes.md](docs/minimax-api-notes.md) for the upstream API research this plugin is built on. These pages live in the repository only — `docs/` is not part of the published package.

## Community, license and disclaimer

- Bugs and feature requests: [Issues](https://github.com/NingYuanLee/dsh-minimax-byapi/issues) (bug report and feature request templates are provided).
- Security: [SECURITY.md](SECURITY.md) — please use GitHub's private vulnerability reporting.
- License: [MIT](LICENSE). Copyright (c) 2026 NingYuanLee.
- Repository: <https://github.com/NingYuanLee/dsh-minimax-byapi>. This is a community plugin project, not an official DeepSeek or MiniMax product. "API access" means the plugin reaches MiniMax through the official API with your own key; it does not implement every MiniMax product feature.
