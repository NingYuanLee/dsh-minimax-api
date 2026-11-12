# Changelog

All notable changes to `dsh-minimax-api` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0

### Added
- **MiniMax section in the settings dialog.** The plugin registers a `MiniMax API` section through `settings.section`, so the connection, chat-model and media configuration can be edited from `Settings → MiniMax` as well as from the plugin page. The section has no `form` prop and reads/writes through `remote.settings`; the model rows keep the single-line table with horizontal scrolling when the column is narrow, and the delete action is now an icon-only button so the row needs less width.
- **M Plan balance in the left sidebar.** The sidebar foot now carries a MiniMax balance row: it shows the official MiniMax waveform mark, the `MiniMax` label and the remaining percentages of both the 5-hour and the weekly limit inline (for example `MiniMax · 5h 82% · Week 45%`), so the weekly share is visible without clicking. Opening it shows a panel with both limits, the remaining counts and how long until each limit resets. The widget refreshes itself every five minutes and can be refreshed by hand. Querying needs the API key, and keys never leave the dsh credential store, so the query runs in the host process and the web client calls the host over `/api/minimaxQuota/quota`; no key crosses the wire. A pay-as-you-go key has no M Plan quota at all, so the row hides itself instead of showing an error.

### Fixed
- **The MiniMax provider card tests connectivity automatically.** Opening the Models page fires one host-side probe with the saved key (`/v1/models`, via `/api/minimaxProbe/test`) and shows only an independent gray/green/red dot next to the plugin tag; no button and no visible result copy. Hovering the dot reveals the latency or failure reason, and the key never reaches the browser.
- **The MiniMax row's Edit button opens the MiniMax settings tab.** Clicking 编辑 on the Models-page row now switches the settings dialog to the MiniMax section instead of opening the host's read-only inline editor; the redirect is suppressed if that tab is unavailable.
- **MiniMax sorts before custom providers on the Models page.** The provider-card extension gives rows carrying the host's custom tag a flex `order: 1`, so MiniMax stays in the default group ahead of custom routes. Display-only; host data and provider registration are unchanged.
- **The MiniMax row on the Models page carries a plugin tag.** A `settings.models.provider-card` registration keyed by `minimax-api` renders a small `插件 · dsh-minimax-api` chip immediately after the provider name, matching the host's own row-tag styling.
- **The balance popover no longer gets clipped by the sidebar.** The panel was a `264px` content-box placed inside the sidebar, so padding pushed its rendered width to `288px`, and the sidebar clips overflow — the right edge of the panel was cut off. It is now viewport-fixed with a border-box width clamped to the viewport, its height is capped to the room above the row, and it follows the row when the sidebar scrolls or the window resizes.
- **M Plan quota parsing now matches the real response.** The live `/v1/token_plan/remains` answer keeps the window data inside `model_remains[]` (one entry per model) and reports the remaining share as `current_interval_remaining_percent` / `current_weekly_remaining_percent`, with the counters at zero. The previous parser only understood top-level counters, so a real subscription account reported empty windows. The counter-shaped response is still parsed as a fallback, and when several models are listed the tightest window wins.

### Changed
- **The settings tab is named `MiniMax API`.** The section label and the Models-page Edit redirect use the new name.
- **Settings page: language models, split media sections, floating effort menu.** Chat models are now labeled language models. Language models and media models are both always open: the language-model table no longer collapses, and media models are split into always-open image, video and speech cards. Every section title gets an icon. The reasoning-effort menu now renders as a viewport-fixed popup, so it no longer adds a scrollbar to the model table or gets clipped; it closes on outside click and Escape.
- **Renamed to `dsh-minimax-api`.** The package name, plugin display name (`MiniMax API接入` / `MiniMax API Access`), Cordis layer ids (`minimax-api`, `dsh-minimax-media`), LLM provider route, settings namespace and default media directory are now `minimax-api`-based. Existing model selections and saved plugin settings keyed to `minimax-byapi` are not migrated: after upgrading, re-select the MiniMax models and save the connection settings again. Old generated media stays in `$DSH_HOME/plugins/dsh-minimax-byapi`; new files go to `$DSH_HOME/plugins/dsh-minimax-api`. The GitHub repository name is unchanged.
- **The sidebar usage row matches the native account row.** It is 44px tall with the same 6px padding, 12px radius and 14px label as the user row, and the MiniMax mark is 24px tall; collapsed, it is a 44×44 icon button.
- **Balance is now usage.** The sidebar row label, panel title and accessible name read `MiniMax 用量` / `MiniMax usage`, matching the used-quota display inside.
- **The usage display shows used quota.** Each limit's percentage now sits right-aligned on the limit-name row and reports usage (`已用 75%` / `75% used`), the bar fills by usage, and the counts line shows used/total, matching the official console. The sidebar row's inline summary also reports used percentages (`5h 75% · w 25%`).
- **Quota refreshes over the network every minute.** The balance widget now re-queries `/api/minimaxQuota/quota` once a minute instead of every five minutes, and the 30-second local countdown tick is gone: the reset countdown is recomputed from the server's `resetAt` on each fetch. The reset countdown is shown for both windows at any percentage, including 100%.
- **Shorter copy on the configuration page.** The connection, credential, chat and error hints were tightened, and the media model notes now keep only the essentials; the English strings got the same treatment.
- **Music is gone from the media settings.** MiniMax retired the music models (closed to new users since 2026-08-20), so the 生成音乐 picker was removed from both the plugin page and the settings tab; the `minimax_generate_music` tool stays registered for accounts that can still call it.
- **Media model pickers show their notes inline.** The four media pickers no longer use a native `<select>` (an `<option>` cannot color part of its text): they open a small listbox where each entry shows the model id and its note in parentheses in a muted color, so the description is readable at the point of choice. The list is viewport-fixed and flips above the control when there is no room below, so the settings dialog's scroll container does not clip it.
- **Reset times read as a countdown.** The balance panel shows how long until each limit resets (`2 小时 5 分后重置` / `Resets in 2h 5m`) instead of an absolute timestamp; the text is recomputed from each quota refresh.
- **The plugin icon is the official mark.** `icon.svg` (and the media component's `assets/media.svg`) no longer draw a gradient tile with a generic letter M; both embed the official MiniMax waveform mark taken from the brand logo on minimax.io.
- The release workflow now publishes to npm through [trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) instead of a repository npm secret: the workflow holds no npm token and asks GitHub for a short-lived OIDC token through `id-token: write`. The trusted publisher is registered once per package, on npmjs.com (organization or user `NingYuanLee`, repository `dsh-minimax-byapi`, workflow filename `release.yml`, environment empty) or with `npm trust github dsh-minimax-api --file release.yml --repo NingYuanLee/dsh-minimax-byapi --allow-publish`, and a local release now goes through `npm login --auth-type=web` (two-hour session token) plus `npm publish --otp <code>`.

## 0.1.2

### Changed
- Unify the README badge row (CI, npm, MIT license, Node, DSH range, `dsh-plugin` topic, powered by dsh) so the badge states the same range as `engines.dsh`.

## 0.1.1

### Fixed

- **The declared host range excluded the host the plugin is verified on.** `engines.dsh` was `>=0.2.1-rc.2 <0.3.0-0`, which — by the same prerelease rule that affected the peer ranges — does not admit `0.2.2-rc.1`, the dsh build this plugin is developed and verified against. The range now covers both prerelease tuples: `>=0.2.1-rc.2 <0.3.0-0 || >=0.2.2-0 <0.3.0-0`. The Discover index publishes this range to users, so it has to name the hosts the plugin actually runs on.

## 0.1.0

First release. The plugin is renamed and reworked from the previous Grok gateway plugin to talk to the official MiniMax open platform, then corrected against the official API reference (`platform.minimax.cn/docs/api-reference`).

### Added

- Native dsh LLM provider under the route `minimax-byapi`, display name **MiniMax**, serving chat through the official pi-ai adapter.
- Five connection presets in `connection.plan`: `payg-global`, `payg-cn`, `coding-global`, `coding-cn` and `custom`. Each preset fills the API base URL and the chat protocol — the OpenAI-compatible `/v1` route for pay-as-you-go, the Anthropic-compatible `/anthropic` route for M Plan.
- Support for both MiniMax key types with one protocol: the pay-as-you-go API key and the M Plan subscription key (`sk-cp-…`) are both sent as `Authorization: Bearer <key>`. The difference is billing and model tier, not the wire format.
- Model discovery through `GET {root}/v1/models`, merged with the plugin's built-in model constants so media models stay listed even when the endpoint only returns chat models. Models are auto-categorized as chat, image, video, speech, music, research or unknown; only chat models enter the model picker.
- Built-in chat model metadata for `MiniMax-M3.1-Flash` and `MiniMax-M3` (1,000,000 context, 131,072 recommended output, image input, reasoning-effort levels for M3.1-Flash).
- Media tools in the `dsh-minimax-media` component: `minimax_generate_image`, `minimax_edit_image`, `minimax_generate_video`, `minimax_list_voices`, `minimax_speak`, `minimax_speak_long`, `minimax_transcribe`, `minimax_generate_music`, `minimax_media_status`, `minimax_media_retry_download`, `minimax_media_list`; plus `minimax_models` and `minimax_quota` in the `minimax-byapi` component. Thirteen tools in total.
- MiniMax-native media calls: image generation with aspect-ratio and `n` (1–9) control and `subject_reference` for image-to-image, the v2 video endpoint for the MiniMax-H3 family (4–15 s), the v1 video endpoint for the Hailuo family (6 s or 10 s), text-to-speech, and speech-to-text with `asr-1.0`.
- Durable, session-scoped media tasks: task records survive restarts, downloads are written to a `.part` file and renamed after validation, and a failed download can be retried without regenerating the result, so nothing is billed twice.
- Settings page with access mode, API address, API key, key verification, timeout, the chat-model table and media-model selection. The API key is written to the dsh credential service under the reference name `MINIMAX_API_KEY`; the configuration keeps only the reference.
- English and Chinese README, a bilingual settings page, tool result cards and media player that follow the dsh interface language.
- `minimax_quota` reads the M Plan remaining quota from `GET https://www.{minimax.io|minimax.cn}/v1/token_plan/remains` — the 5-hour and weekly windows with total, remaining, used, percentage and reset time, plus a per-model split when the server returns one. It reports a readable error for a pay-as-you-go key, which the endpoint refuses.
- Voice tooling: `minimax_list_voices` lists the `voice_id` values an account can use (`system` / `voice_cloning` / `voice_generation` / `all`), and `minimax_speak_long` runs asynchronous long-form speech through `/v1/t2a_async_v2` → `/v1/query/t2a_async_query_v2` → `/v1/files/retrieve`, up to 100,000 characters per call.
- `reasoning_effort` is now sent explicitly with `supportsReasoningEffort` on the Chat Completions route, and the output cap always uses `max_completion_tokens` (the deprecated `max_tokens` is never sent). Covered by a request-body test.
- Image parameters: `style_type` / `style_weight` for `image-01-live`, an explicit `width` / `height` pair for `image-01`, and `aigc_watermark` for images and videos. Local validation rejects a style on the wrong model, `21:9` on `image-01-live`, and an unpaired or out-of-range pixel size.
- Video v2 parameters: `aigc_watermark`, `prompt_expansion_mode` (MiniMax-H3-Max only), the per-model resolution and duration rules, and the ratio rules — text-to-video requires a concrete ratio, image-to-video is fixed to `adaptive`, and `MiniMax-H3-Lite` rejects `adaptive`. The v2 prompt limit is 7000 characters while v1 stays at 2000.
- A "Text model parameters" section in both READMEs and the parameter table in `VALIDATION.md`, listing what the plugin controls and what the adapter cannot send (`service_tier`, `reasoning_split`, disabling thinking on MiniMax-M3, text `seed`).

### Changed

- The plugin was renamed from `dsh-grok-byapi` to `dsh-minimax-byapi`; the package name, display name (`MiniMax ByAPI`), the two component ids (`minimax-byapi` and `dsh-minimax-media`) and the credential reference (`MINIMAX_API_KEY`) all follow the new provider.
- The credential reference renamed from `GROK_ALL_API_KEY` to `MINIMAX_API_KEY`.
- The default access mode is now `coding-cn` with `anthropic-messages`: a fresh install points at `https://api.minimaxi.com/anthropic`, the China M Plan route on the protocol MiniMax recommends. `connection.baseURL` and `connection.api` follow that default. Both China hosts answer identically (`api.minimaxi.com` and `api.minimax.cn`); the preset uses `api.minimaxi.com`, and switching to the other spelling is a `custom` address.
- The settings page puts the API protocol selector to the left of the address field, and changing it rewrites the official address path.
- Image width/height versus aspect ratio: the official rule is that `aspect_ratio` wins when both are given; the plugin instead honours the explicit pixel size and stops sending `aspect_ratio`, so an explicit value is never silently dropped. Documented in both READMEs.
- The media data directory is now `$DSH_HOME/plugins/dsh-minimax-byapi`.
- Documentation was rewritten for MiniMax: bilingual README, `SECURITY.md`, `VALIDATION.md` and the API research notes under `docs/`.

### Fixed

- **Every chat request failed with "pi-ai request header preparation failed".** The plugin applies the official pi-ai adapter to a scope of its own, and that scope did not answer the host's request-header seam: pi-ai `0.2.2-rc.1` composes every provider route's headers through `ctx.waterfall("llm-pi-ai/request-headers", …)`. The route therefore registered and the models were listed, but the first request threw a `TypeError` before any byte reached MiniMax. The scope now delegates that seam to the host context and forwards any other member the official adapter captures, so a later pi-ai release cannot break the route the same way again.
- **The declared peer ranges rejected the host's own versions.** `package.json` pinned `@deepseek-ai/cordis` to `~4.0.4`, `@deepseek-ai/schemastery` to `~3.18.4` and the `dsh-*` peers to `>=0.2.1-0 <0.3.0`, while the host ships cordis `4.1.0`, schemastery `3.19.0` and the `0.2.2-rc.1` line. The `dsh-*` range rejected the host outright: npm only lets a prerelease satisfy a range whose comparators mention that same `[major, minor, patch]` tuple. The ranges now match the sibling plugins — `>=4.0.4 <5.0.0`, `>=3.18.4 <4.0.0` and `>=0.2.1-0 <0.3.0-0 || >=0.2.2-0 <0.3.0-0` — and the development tree resolves to the host's versions, so the test suite exercises the same pi-ai the host runs.
- **The API address now follows the protocol.** On the official hosts `/v1` and `/anthropic` are paired with the OpenAI-compatible and Anthropic-compatible protocols; switching the protocol rewrites the path and re-derives the access mode from the address-plus-protocol pair, so the settings page can no longer produce "`/v1` with `anthropic-messages`". Custom endpoints are left untouched.
- **Text parameters on the Anthropic-compatible route.** pi-ai's default thinking form (`type: "enabled"` with `budget_tokens`) is not accepted by MiniMax; the plugin now forces adaptive thinking, so the request carries `thinking: { type: "adaptive" }` and `output_config.effort` instead. Verified by a request-body test.
- **Missing H3 video variants.** `MiniMax-H3-Highspeed` and `MiniMax-H3-Lite` were absent from the built-in catalog, so they could not be selected even though the v2 endpoint serves them.
- **`image-01-live` was described as image-to-image only.** The official OpenAPI allows it for text-to-image and gives it a `style` object; the note is corrected and the style parameters are exposed.

### Removed

- The Grok-specific gateway integration, the Grok Imagine media component and every `grok_*` tool.
- The video-editing and video-extension tools of the previous plugin.
- The Grok demo assets under `docs/assets/`, the screenshot manifest and the old planning documents.

### Known limitations

- Music generation is retired upstream: MiniMax closed the music API to new users on 2026-08-20 and lists all music models as retired. The tool stays for existing paying accounts only.
- Realtime voice conversation (audio-in / audio-out), voice cloning, voice design and MiniMax's server-side web search tool are not provided.
- Video results are snapshots: the result card does not refresh itself, the finished file has to be fetched with `minimax_media_status`.
- An end-to-end chat turn with a real MiniMax key has been performed (2026-11-06); media generation has not — see `VALIDATION.md`.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html
