# Changelog

All notable changes to `dsh-minimax-byapi` are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

First release. The plugin is renamed and reworked from the previous Grok gateway plugin to talk to the official MiniMax open platform.

### Added

- Native dsh LLM provider under the route `minimax-byapi`, display name **MiniMax**, serving chat through the official pi-ai adapter.
- Five connection presets in `connection.plan`: `payg-global`, `payg-cn`, `coding-global`, `coding-cn` and `custom`. Each preset fills the API base URL and the chat protocol — the OpenAI-compatible `/v1` route for pay-as-you-go, the Anthropic-compatible `/anthropic` route for M Plan.
- Support for both MiniMax key types with one protocol: the pay-as-you-go API key and the M Plan subscription key (`sk-cp-…`) are both sent as `Authorization: Bearer <key>`. The difference is billing and model tier, not the wire format.
- Model discovery through `GET {root}/v1/models`, merged with the plugin's built-in model constants so media models stay listed even when the endpoint only returns chat models. Models are auto-categorized as chat, image, video, speech, music, research or unknown; only chat models enter the model picker.
- Built-in chat model metadata for `MiniMax-M3.1-Flash` and `MiniMax-M3` (1,000,000 context, 131,072 recommended output, image input, reasoning-effort levels for M3.1-Flash).
- Media tools in the `dsh-minimax-media` component: `minimax_generate_image`, `minimax_edit_image`, `minimax_generate_video`, `minimax_speak`, `minimax_transcribe`, `minimax_generate_music`, `minimax_media_status`, `minimax_media_retry_download`, `minimax_media_list`; plus `minimax_models` in the `minimax-byapi` component. Ten tools in total.
- MiniMax-native media calls: image generation with aspect-ratio and `n` (1–9) control and `subject_reference` for image-to-image, the v2 video endpoint for the MiniMax-H3 family (4–15 s), the v1 video endpoint for the Hailuo family (6 s or 10 s), text-to-speech, and speech-to-text with `asr-1.0`.
- Durable, session-scoped media tasks: task records survive restarts, downloads are written to a `.part` file and renamed after validation, and a failed download can be retried without regenerating the result, so nothing is billed twice.
- Settings page with access mode, API address, API key, key verification, timeout, the chat-model table and media-model selection. The API key is written to the dsh credential service under the reference name `MINIMAX_API_KEY`; the configuration keeps only the reference.
- English and Chinese README, a bilingual settings page, tool result cards and media player that follow the dsh interface language.

### Changed

- The plugin was renamed from `dsh-grok-byapi` to `dsh-minimax-byapi`; the package name, display name (`MiniMax ByAPI`), the two component ids (`minimax-byapi` and `dsh-minimax-media`) and the credential reference (`MINIMAX_API_KEY`) all follow the new provider.
- The credential reference renamed from `GROK_ALL_API_KEY` to `MINIMAX_API_KEY`.
- The default base URL is now `https://api.minimax.io/v1` and the default chat protocol is `openai-completions`. The China preset points at `https://api.minimax.cn/v1`; the legacy host `api.minimaxi.com` still answers but is no longer the documented one.
- The media data directory is now `$DSH_HOME/plugins/dsh-minimax-byapi`.
- Documentation was rewritten for MiniMax: bilingual README, `SECURITY.md`, `VALIDATION.md` and the API research notes under `docs/`.

### Removed

- The Grok-specific gateway integration, the Grok Imagine media component and every `grok_*` tool.
- The video-editing and video-extension tools of the previous plugin.
- The Grok demo assets under `docs/assets/`, the screenshot manifest and the old planning documents.

### Known limitations

- Music generation is retired upstream: MiniMax closed the music API to new users on 2026-08-20 and lists all music models as retired. The tool stays for existing paying accounts only.
- Realtime voice conversation (audio-in / audio-out), voice cloning, voice design and MiniMax's server-side web search tool are not provided.
- Video results are snapshots: the result card does not refresh itself, the finished file has to be fetched with `minimax_media_status`.
- The package is not published to npm yet; install from git or from a local checkout.
- No end-to-end run with a real MiniMax key has been performed — see `VALIDATION.md`.

## 未发布（Unreleased）

Corrections made after the first release text was written, checked against the official API reference (`platform.minimax.cn/docs/api-reference`).

### Fixed

- **Text parameters on the Anthropic-compatible route.** pi-ai's default thinking form (`type: "enabled"` with `budget_tokens`) is not accepted by MiniMax; the plugin now forces adaptive thinking, so the request carries `thinking: { type: "adaptive" }` and `output_config.effort` instead. Verified by a request-body test.
- **Missing H3 video variants.** `MiniMax-H3-Highspeed` and `MiniMax-H3-Lite` were absent from the built-in catalog, so they could not be selected even though the v2 endpoint serves them.
- **`image-01-live` was described as image-to-image only.** The official OpenAPI allows it for text-to-image and gives it a `style` object; the note is corrected and the style parameters are exposed.

### Added

- `reasoning_effort` is now sent explicitly with `supportsReasoningEffort` on the Chat Completions route, and the output cap always uses `max_completion_tokens` (the deprecated `max_tokens` is never sent). Covered by a request-body test.
- Image parameters: `style_type` / `style_weight` for `image-01-live`, an explicit `width` / `height` pair for `image-01`, and `aigc_watermark` for images and videos. Local validation rejects a style on the wrong model, `21:9` on `image-01-live`, and an unpaired or out-of-range pixel size.
- Video v2 parameters: `aigc_watermark`, `prompt_expansion_mode` (MiniMax-H3-Max only), the per-model resolution and duration rules, and the ratio rules — text-to-video requires a concrete ratio, image-to-video is fixed to `adaptive`, and `MiniMax-H3-Lite` rejects `adaptive`. The v2 prompt limit is 7000 characters while v1 stays at 2000.
- A "Text model parameters" section in both READMEs and the parameter table in `VALIDATION.md`, listing what the plugin controls and what the adapter cannot send (`service_tier`, `reasoning_split`, disabling thinking on MiniMax-M3, text `seed`).

### Changed

- Image width/height versus aspect ratio: the official rule is that `aspect_ratio` wins when both are given; the plugin instead honours the explicit pixel size and stops sending `aspect_ratio`, so an explicit value is never silently dropped. Documented in both READMEs.

[Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html
