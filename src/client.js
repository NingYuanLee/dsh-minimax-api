import React, { useEffect, useRef, useState } from 'react';

const EFFORT_ORDER = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
// MiniMax 没有公布按模型分档的思考强度，这里不预勾任何一档。
function defaultImageSupported(id) {
  return /(?:^|-)vl(?:$|-)/i.test(String(id || ''));
}
function defaultReasoningEfforts() {
  return [];
}

// 客户端 UI 字典：扁平 key → 文案，{name} 为模板参数。zh / en 的 key 集合必须完全一致。
// 与 dsh 官方 locale 服务注册为 minimaxByapi 命名空间；组件里的 t 由槽位 locale 声明注入。
export const zh = {
  'tool.running': 'MiniMax · 正在执行 {tool}',
  'tool.errorPrefix': 'MiniMax · ',
  'tool.callFailed': '调用失败',
  'tool.models.title': 'MiniMax 模型目录 · {count} 个',
  'tool.models.empty': '无',
  'tool.categoryLine': '{category}：',
  'tool.category.chat': '对话',
  'tool.category.image': '图片',
  'tool.category.video': '视频',
  'tool.category.speech': '语音',
  'tool.category.music': '音乐',
  'tool.category.research': '研究',
  'tool.category.unknown': '未知',
  'tool.task': '任务：{id}',
  'tool.kind.image': '图片',
  'tool.kind.video': '视频',
  'tool.kind.speech': '语音',
  'tool.kind.music': '音乐',
  'tool.progress': '进度快照：{percent}%',
  'tool.openResult': '打开结果 · {name}',
  'tool.statusHint': '这是本次调用记下的生成快照，不会更新。要看新的快照，调用 minimax_media_status 查询原任务。',
  'tool.state.submitting': '提交中',
  'tool.state.generating': '生成中',
  'tool.state.downloading': '正在保存',
  'tool.state.saved': '已保存',
  'tool.state.failed': '失败',
  'tool.state.submissionUnknown': '提交结果未知，请勿重复生成',
  'tool.state.downloadFailed': '生成完成，保存失败，可重试下载',
  'media.loading': '正在加载媒体文件…',
  'media.playbackFailed': '当前客户端无法播放该文件。请使用文件卡片在系统应用中打开。',
  'media.title': 'MiniMax 媒体播放',
  'provider.summary': 'MiniMax 提供商（只读）',
  'provider.title': 'MiniMax 提供商',
  'provider.notice': '此页只读。改地址、密钥和模型请到「插件 → {pkg} → MiniMax ByAPI」。',
  'provider.row.providerId': '提供商 ID',
  'provider.row.displayName': '显示名称',
  'provider.row.apiAddress': 'API 地址',
  'provider.row.apiKey': 'API Key',
  'provider.row.modelSource': '模型来源',
  'provider.row.configLocation': '详细配置位置',
  'provider.value.credentialStore': 'dsh 凭据库 · {ref}',
  'provider.value.modelSource': '上游 /v1/models 发现 + 本页显式配置',
  'provider.value.configLocation': '插件 → {pkg} → MiniMax ByAPI',
  'settings.connection': '连接',
  'settings.accessMode': '接入方式',
  'settings.plan.payg-global': '按量付费（国际）',
  'settings.plan.payg-cn': '按量付费（国内）',
  'settings.plan.coding-global': '订阅 M Plan（国际）',
  'settings.plan.coding-cn': '订阅 M Plan（国内）',
  'settings.plan.custom': '自定义',
  'settings.plan.hint': '选好接入方式会自动填入 API 地址和协议，之后仍然可以手动修改。',
  'settings.protocolHint': '官方主机上协议与地址是配对的：OpenAI 兼容用 /v1，Anthropic 兼容用 /anthropic；切换协议会自动把地址改成对应路径。官方推荐 Anthropic 兼容（M Plan 订阅 Key 与按量付费 Key 都可用）。',
  'settings.apiAddress': 'API 地址',
  'settings.apiProtocol': 'API 协议',
  'settings.apiKey': 'API Key',
  'settings.apiKeyPlaceholder': '留空沿用已存密钥',
  'settings.credentialHint': '填写后保存即写入 dsh 凭据库（{ref}），不会写进插件配置文件。',
  'settings.action.getModels': '获取模型',
  'settings.action.gettingModels': '获取中…',
  'settings.action.saveConnection': '保存地址和密钥',
  'settings.action.saving': '保存中…',
  'settings.chatModels': '对话模型',
  'settings.chatHint': '这里配置的模型会出现在对话右下角。模型弹窗里的本提供商只读。生成结果默认保存在 ~/.dsh/plugins/dsh-minimax-byapi。',
  'settings.discoveredCount': '已获取 {count} 个模型。',
  'settings.chatEmptyHint': '已有一行空配置。先获取模型，下拉才会出现可选项。',
  'settings.table.modelId': '模型 ID',
  'settings.table.displayName': '显示名称',
  'settings.table.images': '图片',
  'settings.table.context': '上下文',
  'settings.table.maxOutput': '最大输出',
  'settings.table.effort': '思考强度',
  'settings.table.selectModel': '选择模型',
  'settings.getModelsFirst': '先获取模型',
  'settings.table.noRows': '还没有配置行。',
  'settings.table.modelIdAria': '模型 ID {index}',
  'settings.table.displayNameAria': '显示名称 {index}',
  'settings.table.imagesAria': '支持图片 {index}',
  'settings.table.contextAria': '上下文 {index}',
  'settings.table.maxOutputAria': '最大输出 {index}',
  'settings.table.deleteRowAria': '删除第 {index} 行',
  'settings.action.addRow': '添加模型行',
  'settings.action.add': '添加',
  'settings.action.delete': '删除',
  'settings.action.saveChat': '保存对话模型',
  'settings.mediaModels': '媒体模型',
  'settings.action.saveMedia': '保存媒体模型',
  'settings.media.none': '不使用',
  'settings.media.image': '生成图片',
  'settings.media.video': '生成视频',
  'settings.media.speech': '生成语音',
  'settings.media.music': '生成音乐',
  'settings.modelNote.image-01': '文生图与图生图：8 种宽高比、n 1–9，可指定 512–2048 像素宽高；21:9 仅此模型支持。',
  'settings.modelNote.image-01-live': '在 image-01 基础上支持画风（漫画/元气/中世纪/水彩），不支持 21:9。',
  'settings.modelNote.MiniMax-H3': '视频 v2 接口，画质优先：768P/2K，4–15 秒，文生/图生视频。',
  'settings.modelNote.MiniMax-H3-Highspeed': '视频 v2 接口，质量与速度兼顾：480P/768P，4–15 秒。',
  'settings.modelNote.MiniMax-H3-Lite': '视频 v2 接口，轻量版：480P/768P，4–15 秒，不支持 adaptive 画幅。',
  'settings.modelNote.MiniMax-H3-Max': '视频 v2 接口，极速版：480P/768P，5–15 秒。',
  'settings.modelNote.MiniMax-Hailuo-2.3': '视频 v1 接口，Hailuo 系列：6/10 秒，512P–1080P，文生/图生视频。',
  'settings.modelNote.MiniMax-Hailuo-2.3-Fast': '视频 v1 接口，Hailuo 快速版：仅图生视频，6/10 秒。',
  'settings.modelNote.MiniMax-Hailuo-02': '视频 v1 接口，上一代 Hailuo：6/10 秒，文生/图生视频。',
  'settings.modelNote.speech-2.8-hd': '语音合成 HD，最新一代：情绪与语气词表现最好，单次 ≤10000 字符。',
  'settings.modelNote.speech-2.8-turbo': '语音合成 Turbo，最新一代：速度最快，音质略低于 HD。',
  'settings.modelNote.speech-2.6-hd': '语音合成 HD，上一代：韵律与音质均衡。',
  'settings.modelNote.speech-2.6-turbo': '语音合成 Turbo，上一代：低时延、成本低。',
  'settings.modelNote.speech-02-hd': '语音合成 HD，较早一代：音色复刻相似度高。',
  'settings.modelNote.speech-02-turbo': '语音合成 Turbo，较早一代：稳定、小语种支持较好。',
  'settings.modelNote.music-3.0': '音乐模型已退役：2026-08-20 起不向新用户开放，仅存量付费账号可用。',
  'settings.modelNote.music-2.6': '音乐模型已退役：仅存量付费账号可用。',
  'settings.modelNote.music-cover': '音乐翻唱模型已退役：仅存量付费账号可用。',
  'settings.effort.unset': '未设置',
  'settings.effort.aria': '思考强度 {index}',
  'settings.effort.optionsAria': '思考强度选项 {index}',
  'settings.effort.levelAria': '思考强度 {level} {index}',
  'settings.writableBlocked': '当前配置被更高优先级的配置层覆盖，不能从此页修改。',
  'settings.capabilities': '能力',
  'settings.capabilities.hint': '只列这个组件自己的能力。',
  'settings.cap.chatSummary': '对话与模型目录',
  'settings.cap.mediaSummary': '图片、视频、语音、音乐和语音转写',
  'settings.cap.seeMedia': '图片、视频、语音、音乐和语音转写属于组件 dsh-minimax-media。',
  'settings.cap.seeChat': '对话和模型目录属于组件 minimax-byapi。连接、密钥和模型表在插件页。',
  'settings.cap.chat': '对话\n输入：选择器里的 MiniMax 聊天模型，以及本轮消息。\n产出：流式回复。只有聊天模型会进入选择器。',
  'settings.cap.models': 'minimax_models\n输入：可选 refresh（重新拉取）、verify_key（检查地址和密钥，不返回密钥）。\n产出：按对话、图片、视频、语音、音乐分组的模型 ID。',
  'settings.cap.quota': 'minimax_quota\n输入：无。\n产出：M Plan 的 5 小时窗口与周窗口余量、已用量与重置时间；只有订阅 Key 能查，按量付费 Key 会被拒绝并给出可读说明。',
  'settings.cap.image': 'minimax_generate_image 文生图\n输入：prompt（必填，最多 60000 字），可选 model、n（1–4，默认 1）。\n产出：1–4 张本地图片路径。未保存时返回任务状态，不会自动再生成。',
  'settings.cap.imageEdit': 'minimax_edit_image 图生图\n输入：prompt，以及 1–5 张参考图（image_url、image_urls，或已保存图片任务）。本地文件超过 8MB 时改用 HTTPS 地址。\n产出：编辑后的本地图片。',
  'settings.cap.video': 'minimax_generate_video 文生视频 / 图生视频\n输入：prompt，可选 duration（1–15 秒，默认 2）。图生视频再加一张静帧 image_url，或已保存图片任务。\n产出：任务 id，状态为生成中。成片要用 minimax_media_status 取回，得到本地 MP4。',
  'settings.cap.voices': 'minimax_list_voices 查询可用音色\n输入：可选 voice_type（system / voice_cloning / voice_generation / all，默认 system）。\n产出：可用 voice_id 列表（含名称与描述），可直接传给 minimax_speak 与 minimax_speak_long；不产生媒体文件。',
  'settings.cap.speech': 'minimax_speak 同步文字转语音\n输入：text（必填，最多 10000 字），可选 model、voice_id、speed、vol、pitch、emotion、format。\n产出：本地音频文件。超过 10000 字请改用 minimax_speak_long。',
  'settings.cap.speechLong': 'minimax_speak_long 异步长文本语音\n输入：text（必填，最多 100000 字），可选 model、voice_id、speed、vol、pitch、emotion、format、language_boost。\n产出：任务 id（generating）；用 minimax_media_status 取回后保存为本地音频。上游下载链接只有 9 小时有效期。',
  'settings.cap.transcribe': 'minimax_transcribe 语音转文字\n输入：audio_path（本地音频文件）或 audio_url（音频地址），可选 model、response_format、timestamp_level、language。\n产出：转写文本，不产生媒体文件。',
  'settings.cap.music': 'minimax_generate_music 文本生成音乐\n输入：prompt（必填，最多 60000 字），可选 model。\n产出：本地音频文件。音乐模型官方已退役，只有存量付费账号可用，新账号可能直接失败。',
  'settings.cap.status': 'minimax_media_status\n输入：task_id。\n产出：当前状态。结果已生成时保存本地文件。不重新生成。',
  'settings.cap.retry': 'minimax_media_retry_download\n输入：保存失败的 task_id。\n产出：重新下载后的本地文件。没有可下载结果时会拒绝，不会重新生成。',
  'settings.cap.list': 'minimax_media_list\n输入：无。\n产出：本会话创建过的媒体任务列表。',
  'settings.cap.watch': '后台查询\n输入：无。视频任务一提交就在本进程开始。\n产出：把该任务更新为已保存或失败。结果卡片仍是快照，不会自己刷新。',
  'settings.cap.player': '侧栏播放\n输入：已保存的 MP4、MP3 或 WAV。\n产出：侧栏播放器。音视频不要用 Markdown 图片语法插进聊天。',
  'settings.cap.unsupported': '不提供：实时语音、直接 OAuth。\n输入：无。\n产出：无。这两项没有工具。',
  'settings.summary': 'MiniMax 连接、密钥与模型参数',
  'settings.load.missing': '没有读到已保存的 MiniMax ByAPI 配置，先按默认值显示。',
  'settings.load.failed': '读取已保存配置失败，先按默认值显示：{message}',
  'settings.keyFailure.blank': '不能只有空白字符；想沿用已存密钥请留空。',
  'settings.keyFailure.charset': '密钥只能是可打印 ASCII 字符，不能有空格、引号或换行；请只粘贴密钥本身。',
  'settings.credential.writeUnavailable': '当前页面保存不了密钥',
  'settings.credential.writeFailed': '凭据写入失败',
  'settings.discovery.unavailable': '当前页面没有模型发现接口，请改用 minimax_models 工具。',
  'settings.discovery.missingBaseUrl': '还没有可用的 API 地址，无法获取模型。',
  'settings.discovery.invalidResponse': '获取模型失败：返回的不是模型列表。',
  'settings.discovery.found': '已从 MiniMax ByAPI 发现 {count} 个模型，按需添加行并保存。',
  'settings.discovery.failed': '获取模型失败：{message}',
  'settings.validation.contextWindow': '{id}：上下文大小要写成像 500K / 1M / 200000 这样的正数。',
  'settings.validation.maxTokens': '{id}：最大输出 token 要写成像 32K / 64K 这样的正数。',
  'settings.writeUnavailable': '当前页面写不了配置。',
  'settings.save.rejected': '未保存，请检查权限、配置来源或是否被其他窗口更新。',
  'settings.save.failed': '保存失败，草稿已保留，请检查配置或重新加载。',
  'settings.save.addressPending': '地址已保存，正在写入密钥。',
  'settings.save.addressDone': '地址已保存。',
  'settings.save.keyFailed': '地址已保存，但密钥未写入：{message}',
  'settings.save.credentialDone': '地址和密钥已保存。密钥在凭据库（{ref}）。',
  'settings.save.needModels': '先点「获取模型」，或先选择一条对话模型。',
  'settings.save.chatCount': '已保存 {count} 条对话模型。',
  'settings.save.mediaDone': '媒体模型已保存。',
  'quota.title': 'MiniMax 余额',
  'quota.remaining': '剩余 {percent}%',
  'quota.window5h': '5 小时窗口',
  'quota.windowWeekly': '周窗口',
  'quota.resetAt': '{time} 重置',
  'quota.refresh': '刷新',
  'quota.loading': '正在查询额度…',
  'quota.unavailable': '额度不可用',
  'quota.remainingOf': '剩余 {remaining} / {total}',
  'quota.unknown': '暂无数据',
  'error.unknown': '未知错误',
};

export const en = {
  'tool.running': 'MiniMax · Running {tool}',
  'tool.errorPrefix': 'MiniMax · ',
  'tool.callFailed': 'Call failed',
  'tool.models.title': 'MiniMax model catalog · {count}',
  'tool.models.empty': 'None',
  'tool.categoryLine': '{category}:',
  'tool.category.chat': 'Chat',
  'tool.category.image': 'Images',
  'tool.category.video': 'Video',
  'tool.category.speech': 'Speech',
  'tool.category.music': 'Music',
  'tool.category.research': 'Research',
  'tool.category.unknown': 'Other',
  'tool.task': 'Task: {id}',
  'tool.kind.image': 'Image',
  'tool.kind.video': 'Video',
  'tool.kind.speech': 'Speech',
  'tool.kind.music': 'Music',
  'tool.progress': 'Progress snapshot: {percent}%',
  'tool.openResult': 'Open result · {name}',
  'tool.statusHint': 'This is the snapshot recorded by this call. It does not update. Call minimax_media_status to check the original task.',
  'tool.state.submitting': 'Submitting',
  'tool.state.generating': 'Generating',
  'tool.state.downloading': 'Saving',
  'tool.state.saved': 'Saved',
  'tool.state.failed': 'Failed',
  'tool.state.submissionUnknown': 'Submission status unknown; do not generate again',
  'tool.state.downloadFailed': 'Generated; saving failed. You can retry the download',
  'media.loading': 'Loading media file…',
  'media.playbackFailed': 'This client cannot play this file. Open it from the file card in a system app.',
  'media.title': 'MiniMax media player',
  'provider.summary': 'MiniMax provider (read-only)',
  'provider.title': 'MiniMax provider',
  'provider.notice': 'This page is read-only. To change the address, key, or models, go to "Plugins → {pkg} → MiniMax ByAPI".',
  'provider.row.providerId': 'Provider ID',
  'provider.row.displayName': 'Display name',
  'provider.row.apiAddress': 'API address',
  'provider.row.apiKey': 'API key',
  'provider.row.modelSource': 'Model source',
  'provider.row.configLocation': 'Detailed config location',
  'provider.value.credentialStore': 'dsh credential store · {ref}',
  'provider.value.modelSource': 'Upstream /v1/models discovery + explicit configuration on this page',
  'provider.value.configLocation': 'Plugins → {pkg} → MiniMax ByAPI',
  'settings.connection': 'Connection',
  'settings.accessMode': 'Access mode',
  'settings.plan.payg-global': 'Pay-as-you-go (international)',
  'settings.plan.payg-cn': 'Pay-as-you-go (China)',
  'settings.plan.coding-global': 'M Plan subscription (international)',
  'settings.plan.coding-cn': 'M Plan subscription (China)',
  'settings.plan.custom': 'Custom',
  'settings.plan.hint': 'Picking an access mode fills in the API address and protocol; both stay editable afterwards.',
  'settings.protocolHint': 'On the official hosts the protocol and the address are paired: OpenAI-compatible uses /v1, Anthropic-compatible uses /anthropic, and switching the protocol rewrites the path for you. MiniMax recommends the Anthropic-compatible route, which works with both an M Plan key and a pay-as-you-go key.',
  'settings.apiAddress': 'API address',
  'settings.apiProtocol': 'API protocol',
  'settings.apiKey': 'API key',
  'settings.apiKeyPlaceholder': 'Leave blank to keep the saved key',
  'settings.credentialHint': 'Saving writes the key to the dsh credential store ({ref}); it is never written to the plugin config file.',
  'settings.action.getModels': 'Get models',
  'settings.action.gettingModels': 'Getting models…',
  'settings.action.saveConnection': 'Save address and key',
  'settings.action.saving': 'Saving…',
  'settings.chatModels': 'Chat models',
  'settings.chatHint': 'Models configured here appear in the chat model selector. This provider is read-only in the model dialog. Generated results are saved to ~/.dsh/plugins/dsh-minimax-byapi by default.',
  'settings.discoveredCount': '{count} models fetched.',
  'settings.chatEmptyHint': 'There is one empty row. Fetch models first to populate the dropdown.',
  'settings.table.modelId': 'Model ID',
  'settings.table.displayName': 'Display name',
  'settings.table.images': 'Images',
  'settings.table.context': 'Context',
  'settings.table.maxOutput': 'Max output',
  'settings.table.effort': 'Reasoning effort',
  'settings.table.selectModel': 'Select model',
  'settings.getModelsFirst': 'Get models first',
  'settings.table.noRows': 'No rows configured yet.',
  'settings.table.modelIdAria': 'Model ID {index}',
  'settings.table.displayNameAria': 'Display name {index}',
  'settings.table.imagesAria': 'Supports images {index}',
  'settings.table.contextAria': 'Context {index}',
  'settings.table.maxOutputAria': 'Max output {index}',
  'settings.table.deleteRowAria': 'Delete row {index}',
  'settings.action.addRow': 'Add model row',
  'settings.action.add': 'Add',
  'settings.action.delete': 'Delete',
  'settings.action.saveChat': 'Save chat models',
  'settings.mediaModels': 'Media models',
  'settings.action.saveMedia': 'Save media models',
  'settings.media.none': 'None',
  'settings.media.image': 'Image generation',
  'settings.media.video': 'Video generation',
  'settings.media.speech': 'Speech generation',
  'settings.media.music': 'Music generation',
  'settings.modelNote.image-01': 'Text and image to image: 8 aspect ratios, n 1–9, optional 512–2048 px size; 21:9 only on this model.',
  'settings.modelNote.image-01-live': 'image-01 plus style settings (comic / energetic / medieval / watercolor); no 21:9.',
  'settings.modelNote.MiniMax-H3': 'Video v2 endpoint, quality first: 768P/2K, 4–15 s, text or image to video.',
  'settings.modelNote.MiniMax-H3-Highspeed': 'Video v2 endpoint, balanced quality and speed: 480P/768P, 4–15 s.',
  'settings.modelNote.MiniMax-H3-Lite': 'Video v2 endpoint, light version: 480P/768P, 4–15 s, no adaptive ratio.',
  'settings.modelNote.MiniMax-H3-Max': 'Video v2 endpoint, fastest version: 480P/768P, 5–15 s.',
  'settings.modelNote.MiniMax-Hailuo-2.3': 'Video v1 endpoint, Hailuo family: 6 or 10 s, 512P–1080P, text or image to video.',
  'settings.modelNote.MiniMax-Hailuo-2.3-Fast': 'Video v1 endpoint, fast Hailuo: image to video only, 6 or 10 s.',
  'settings.modelNote.MiniMax-Hailuo-02': 'Video v1 endpoint, previous Hailuo generation: 6 or 10 s, text or image to video.',
  'settings.modelNote.speech-2.8-hd': 'Speech HD, newest generation: best emotion and interjections, up to 10000 characters per call.',
  'settings.modelNote.speech-2.8-turbo': 'Speech Turbo, newest generation: fastest, slightly below HD quality.',
  'settings.modelNote.speech-2.6-hd': 'Speech HD, previous generation: balanced prosody and quality.',
  'settings.modelNote.speech-2.6-turbo': 'Speech Turbo, previous generation: low latency, low cost.',
  'settings.modelNote.speech-02-hd': 'Speech HD, earlier generation: strong voice-clone similarity.',
  'settings.modelNote.speech-02-turbo': 'Speech Turbo, earlier generation: stable, better minor-language support.',
  'settings.modelNote.music-3.0': 'Music model retired: closed to new users since 2026-08-20, existing paying accounts only.',
  'settings.modelNote.music-2.6': 'Music model retired: existing paying accounts only.',
  'settings.modelNote.music-cover': 'Music cover model retired: existing paying accounts only.',
  'settings.effort.unset': 'Not set',
  'settings.effort.aria': 'Reasoning effort {index}',
  'settings.effort.optionsAria': 'Reasoning effort options {index}',
  'settings.effort.levelAria': 'Reasoning effort {level} {index}',
  'settings.writableBlocked': 'This configuration is overridden by a higher-priority layer and cannot be modified here.',
  'settings.capabilities': 'Capabilities',
  'settings.capabilities.hint': 'Only the capabilities of this component.',
  'settings.cap.chatSummary': 'Chat and model catalog',
  'settings.cap.mediaSummary': 'Image, video, speech, music, and transcription',
  'settings.cap.seeMedia': 'Image, video, speech, music, and transcription belong to the dsh-minimax-media component.',
  'settings.cap.seeChat': 'Chat and the model catalog belong to the minimax-byapi component. Connection, key, and model settings are on the plugin page.',
  'settings.cap.chat': 'Chat\nInput: a MiniMax chat model from the picker, plus the current message.\nOutput: a streaming reply. Only chat models appear in the picker.',
  'settings.cap.models': 'minimax_models\nInput: optional refresh, and verify_key. The key itself is not returned.\nOutput: model IDs grouped as chat, image, video, speech, and music.',
  'settings.cap.quota': 'minimax_quota\nInput: none.\nOutput: remaining and used quota with reset times for the M Plan 5-hour and weekly windows. Only a subscription key can query it; a pay-as-you-go key is refused with a readable explanation.',
  'settings.cap.image': 'minimax_generate_image, text to image\nInput: prompt (required, up to 60000 characters), optional model and n (1-4, default 1).\nOutput: 1-4 local image paths. If it is not saved, the task status is returned and nothing is generated again.',
  'settings.cap.imageEdit': 'minimax_edit_image, image to image\nInput: prompt, plus 1-5 reference images (image_url, image_urls, or a saved image task). A local file over 8MB must be an HTTPS URL.\nOutput: the edited image, saved locally.',
  'settings.cap.video': 'minimax_generate_video, text to video or image to video\nInput: prompt, optional duration (1-15 seconds, default 2). Image to video also takes one still via image_url or a saved image task.\nOutput: a task id with status generating. Call minimax_media_status to save the MP4.',
  'settings.cap.voices': 'minimax_list_voices, list available voices\nInput: optional voice_type (system / voice_cloning / voice_generation / all, default system).\nOutput: available voice_id values with names and descriptions, ready to pass to minimax_speak and minimax_speak_long; no media file is produced.',
  'settings.cap.speech': 'minimax_speak, synchronous text to speech\nInput: text (required, up to 10000 characters), optional model, voice_id, speed, vol, pitch, emotion and format.\nOutput: a local audio file. Text longer than 10000 characters goes through minimax_speak_long.',
  'settings.cap.speechLong': 'minimax_speak_long, asynchronous long-form speech\nInput: text (required, up to 100000 characters), optional model, voice_id, speed, vol, pitch, emotion, format and language_boost.\nOutput: a task id with status generating; fetch it with minimax_media_status to save the local audio file. The upstream download link is valid for 9 hours only.',
  'settings.cap.transcribe': 'minimax_transcribe, speech to text\nInput: audio_path (a local audio file) or audio_url (an audio address), optional model, response_format, timestamp_level and language.\nOutput: the transcribed text; it does not produce a media file.',
  'settings.cap.music': 'minimax_generate_music, text to music\nInput: prompt (required, up to 60000 characters), optional model.\nOutput: a local audio file. The vendor has retired the music models; only existing paid accounts can still use them, so new accounts may fail.',
  'settings.cap.status': 'minimax_media_status\nInput: task_id.\nOutput: the current status. A finished result is saved locally. Nothing is generated again.',
  'settings.cap.retry': 'minimax_media_retry_download\nInput: the task_id of a failed save.\nOutput: the local file after another download. If there is nothing to download, it refuses instead of generating again.',
  'settings.cap.list': 'minimax_media_list\nInput: none.\nOutput: the media tasks created in this session.',
  'settings.cap.watch': 'Background poll\nInput: none. It starts in this process when a video task is submitted.\nOutput: the task moves to saved or failed. The result card stays a snapshot and does not refresh itself.',
  'settings.cap.player': 'Sidebar player\nInput: a saved MP4, MP3, or WAV.\nOutput: playback in the sidebar. Do not embed audio or video with Markdown image syntax.',
  'settings.cap.unsupported': 'Not provided: live voice, and direct OAuth.\nInput: none.\nOutput: none. These have no tools.',
  'settings.summary': 'MiniMax connection, key, and model parameters',
  'settings.load.missing': 'No saved MiniMax ByAPI configuration found; showing defaults.',
  'settings.load.failed': 'Failed to read the saved configuration; showing defaults: {message}',
  'settings.keyFailure.blank': 'Cannot be whitespace only; leave it blank to keep the saved key.',
  'settings.keyFailure.charset': 'The key must contain printable ASCII characters only, with no spaces, quotes, or line breaks; paste only the key itself.',
  'settings.credential.writeUnavailable': 'This page cannot save the key',
  'settings.credential.writeFailed': 'Failed to write the credential',
  'settings.discovery.unavailable': 'Model discovery is not available on this page; use the minimax_models tool instead.',
  'settings.discovery.missingBaseUrl': 'No API address is available, so models cannot be fetched.',
  'settings.discovery.invalidResponse': 'Failed to fetch models: the response was not a model list.',
  'settings.discovery.found': 'Discovered {count} models from MiniMax ByAPI. Add the rows you need and save.',
  'settings.discovery.failed': 'Failed to fetch models: {message}',
  'settings.validation.contextWindow': '{id}: Context size must be a positive number such as 500K / 1M / 200000.',
  'settings.validation.maxTokens': '{id}: Max output tokens must be a positive number such as 32K / 64K.',
  'settings.writeUnavailable': 'This page cannot write configuration.',
  'settings.save.rejected': 'Not saved. Check permissions, the configuration source, or whether another window updated it.',
  'settings.save.failed': 'Save failed. The draft is preserved; check the configuration or reload the page.',
  'settings.save.addressPending': 'Address saved. Writing the key…',
  'settings.save.addressDone': 'Address saved.',
  'settings.save.keyFailed': 'Address saved, but the key was not written: {message}',
  'settings.save.credentialDone': 'Address and key saved. The key is in the credential store ({ref}).',
  'settings.save.needModels': 'Click "Get models" first, or select a chat model first.',
  'settings.save.chatCount': 'Saved {count} chat models.',
  'settings.save.mediaDone': 'Media models saved.',
  'quota.title': 'MiniMax balance',
  'quota.remaining': '{percent}% left',
  'quota.window5h': '5-hour window',
  'quota.windowWeekly': 'Weekly window',
  'quota.resetAt': 'Resets {time}',
  'quota.refresh': 'Refresh',
  'quota.loading': 'Checking quota…',
  'quota.unavailable': 'Quota unavailable',
  'quota.remainingOf': '{remaining} of {total} left',
  'quota.unknown': 'No data',
  'error.unknown': 'Unknown error',
};

// 生成一个带 {name} 插值的翻译函数；缺 key 时回显 key（与官方 t 行为一致）。
export function createT(dict) {
  const table = dict || {};
  return function translate(key, params) {
    const template = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
    if (typeof template !== 'string') return key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  };
}
// 组件没有拿到框架注入的 t 时（旧宿主/测试）回退中文，保持现有界面不变。
const zhT = createT(zh);

export const inject = ['slots', 'documentPreviews', 'remote', 'remote.llm', 'remote.settings', 'remote.credentials', 'locale'];
const h = React.createElement;
const MEDIA_ID = 'dsh-minimax-byapi/media-preview';
// 侧栏余额组件的槽位 key（同一插槽下的唯一标识）。
const QUOTA_ID = 'dsh-minimax-byapi/quota';
// 设置命名空间 = MiniMax ByAPI 这一行在 profile 里的实例 id（cordis.patch.yml 的 - id:）。
const SETTINGS_NS = 'minimax-byapi';
// 包名 = 插件管理器里「插件包」那一行的标识，槽位 key 用的是它
const PKG_NAME = 'dsh-minimax-byapi';
// provider 路由名 = 后端注册的可配置提供商 id，只读页按它显示。
const PROVIDER_ID = 'minimax-byapi';
// 设置页与只读页里显示的提供商名称。
const PROVIDER_NAME = 'MiniMax';
// 与 Config.connection.baseURL 的 schema 默认值一致（按量付费·国际）。详情页没有表单，首屏 connection 是空的。
// 默认接入方式：国内 M Plan + Anthropic 兼容（官方推荐），与 src/catalog.js 的 DEFAULT_PLAN 保持一致。
const DEFAULT_BASE_URL = 'https://api.minimaxi.com/anthropic';
// 接入方式：预设同时决定 API 地址和协议；custom 保留用户手填的值。
const ACCESS_PLANS = [
  { id: 'payg-global', baseURL: 'https://api.minimax.io/v1', api: 'openai-completions' },
  { id: 'payg-cn', baseURL: 'https://api.minimaxi.com/v1', api: 'openai-completions' },
  { id: 'coding-global', baseURL: 'https://api.minimax.io/anthropic', api: 'anthropic-messages' },
  { id: 'coding-cn', baseURL: 'https://api.minimaxi.com/anthropic', api: 'anthropic-messages' },
  { id: 'custom', baseURL: '', api: '' },
];
const API_PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages'];
// 官方主机：只有这些域名的地址前缀与协议是配对的，其他自建代理不改写。
// 国内两个官方域名等价（api.minimaxi.com 与 api.minimax.cn 都能用），默认用 minimaxi.com。
const MINIMAX_API_HOSTS = ['api.minimax.io', 'api.minimax.cn', 'api.minimaxi.com'];
function planById(id) {
  return ACCESS_PLANS.find(plan => plan.id === id);
}
function resolvePlan(source) {
  const stored = source?.connection?.plan;
  if (typeof stored === 'string' && planById(stored)) return stored;
  const baseURL = typeof source?.connection?.baseURL === 'string' ? source.connection.baseURL.trim() : '';
  const matched = ACCESS_PLANS.find(plan => plan.baseURL && plan.baseURL === baseURL);
  if (matched) return matched.id;
  return baseURL ? 'custom' : 'coding-cn';
}
function resolveApi(source) {
  const api = source?.connection?.api;
  if (typeof api === 'string' && API_PROTOCOLS.includes(api)) return api;
  return planById(resolvePlan(source))?.api || 'anthropic-messages';
}
function resolveBaseURL(source) {
  const raw = source?.connection?.baseURL;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_BASE_URL;
}
function readSettingsEntry(found) {
  const payload = found?.ok ? found.value : found;
  const listed = Array.isArray(payload) ? payload : payload?.namespaces;
  const entry = Array.isArray(listed) ? listed.find(row => row?.ns === SETTINGS_NS) : listed?.[SETTINGS_NS];
  const next = entry?.value || entry;
  if (!next || typeof next !== 'object' || !(next.connection || next.media || next.modelOverrides)) return null;
  return { value: next, revision: entry?.revision ?? 0 };
}
function discoveryErrorText(t, message) {
  if (typeof message === 'string' && /provider route or a baseURL/.test(message)) return t('settings.discovery.missingBaseUrl');
  return message;
}
const STATE_KEYS = {
  submitting: 'tool.state.submitting', generating: 'tool.state.generating', downloading: 'tool.state.downloading', saved: 'tool.state.saved',
  failed: 'tool.state.failed', 'submission-unknown': 'tool.state.submissionUnknown',
  'download-failed': 'tool.state.downloadFailed',
};
function stateText(t, status) {
  const key = STATE_KEYS[status];
  return key ? t(key) : status;
}
const KIND_KEYS = { image: 'tool.kind.image', video: 'tool.kind.video', speech: 'tool.kind.speech', music: 'tool.kind.music' };
function kindText(t, kind) {
  const key = KIND_KEYS[kind];
  return key ? t(key) : (kind || 'MiniMax');
}
function statusTone(status) {
  if (status === 'saved') return 'success';
  if (status === 'failed' || status === 'submission-unknown' || status === 'download-failed') return 'danger';
  return 'neutral';
}
const snap = {
  stack: { display: 'grid', gap: 8 },
  card: { display: 'grid', gap: 8, padding: '12px 14px', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2, transparent)', border: '0.5px solid var(--dsw-alias-border-l3, var(--border-color, #8885))', borderRadius: 'var(--dsw-radius-lg, 16px)' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
  pill: { flex: 'none', fontSize: 11, lineHeight: '18px', padding: '0 8px', borderRadius: 999, border: '0.5px solid var(--dsw-alias-border-l2, #8885)' },
  meta: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.4 },
  id: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 11, lineHeight: 1.4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', overflowWrap: 'anywhere' },
  track: { height: 4, borderRadius: 999, overflow: 'hidden', background: 'var(--dsw-alias-fill-l2, #8882)' },
  fill: { display: 'block', height: '100%', borderRadius: 999, background: 'var(--dsw-alias-brand-primary, currentColor)' },
  files: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  file: { height: 28, padding: '0 10px', font: 'inherit', fontSize: 12, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1, transparent)', border: '0.5px solid var(--dsw-alias-border-l2, #8885)', borderRadius: 'var(--dsw-radius-sm, 8px)' },
  hint: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.5 },
  error: { margin: 0, color: 'var(--dsw-alias-state-error-primary, #c62828)', fontSize: 12, lineHeight: 1.5 },
  alert: { padding: '10px 12px', borderRadius: 'var(--dsw-radius-lg, 16px)', border: '0.5px solid var(--dsw-alias-state-error-primary, #c62828)', color: 'var(--dsw-alias-state-error-primary, #c62828)', fontSize: 13 },
  running: { padding: '10px 12px', borderRadius: 'var(--dsw-radius-lg, 16px)', color: 'var(--dsw-alias-label-secondary)', fontSize: 13 },
};
function pillStyle(tone) {
  if (tone === 'success') return { ...snap.pill, color: 'var(--dsw-alias-state-success-primary, #1b7f4a)', borderColor: 'var(--dsw-alias-state-success-primary, #1b7f4a)' };
  if (tone === 'danger') return { ...snap.pill, color: 'var(--dsw-alias-state-error-primary, #c62828)', borderColor: 'var(--dsw-alias-state-error-primary, #c62828)' };
  return { ...snap.pill, color: 'var(--dsw-alias-label-secondary)' };
}
function SnapshotTask({ task, openFile, t }) {
  const percent = Number.isFinite(task.progress) ? Math.max(0, Math.min(100, task.progress)) : null;
  const files = Array.isArray(task.files) ? task.files : [];
  return h('article', { style: snap.card },
    h('div', { style: snap.head },
      h('p', { style: snap.title }, kindText(t, task.kind)),
      h('span', { style: pillStyle(statusTone(task.status)) }, stateText(t, task.status))),
    task.model ? h('p', { style: snap.meta }, task.model) : null,
    percent === null ? null : h('div', null,
      h('div', { style: snap.track, 'aria-hidden': 'true' }, h('div', { style: { ...snap.fill, width: percent + '%' } })),
      h('p', { style: { ...snap.meta, marginTop: 6 } }, t('tool.progress', { percent }))),
    h('p', { style: snap.id }, t('tool.task', { id: task.id })),
    task.error ? h('p', { role: 'alert', style: snap.error }, typeof task.error === 'string' ? task.error : JSON.stringify(task.error)) : null,
    files.length ? h('div', { style: snap.files }, ...files.map(file => {
      const name = String(file.path || '').split(/[\\/]/).pop();
      return h('button', { key: file.path, type: 'button', disabled: !openFile, onClick: () => openFile?.(file.path), style: { ...snap.file, cursor: openFile ? 'pointer' : 'default' } }, t('tool.openResult', { name }));
    })) : null,
    ['generating', 'submitting'].includes(task.status) ? h('p', { style: snap.hint }, t('tool.statusHint')) : null);
}
function fileName(path) {
  return String(path || '').split(/[\\/]/).pop();
}
function SavedFiles({ files, openFile }) {
  return h('div', { style: snap.files }, ...files.map(file => h('button', {
    key: file.path, type: 'button', disabled: !openFile, onClick: () => openFile?.(file.path),
    style: { ...snap.file, cursor: openFile ? 'pointer' : 'default' },
  }, fileName(file.path))));
}
const tools = ['minimax_models', 'minimax_quota', 'minimax_generate_image', 'minimax_edit_image', 'minimax_generate_video', 'minimax_list_voices', 'minimax_speak', 'minimax_speak_long', 'minimax_generate_music', 'minimax_transcribe', 'minimax_media_status', 'minimax_media_retry_download', 'minimax_media_list'];

export function resultValue(block) {
  try { return JSON.parse((block?.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n')); }
  catch { return undefined; }
}

export function MinimaxToolCard({ toolName, phase, block, openFile, t = zhT }) {
  if (phase !== 'result') return h('div', { role: 'status', style: snap.running }, t('tool.running', { tool: toolName }));
  const value = resultValue(block);
  const tasks = Array.isArray(value) ? value : value?.id ? [value] : [];
  if (!value || block?.isError) return h('div', { role: 'alert', style: snap.alert }, t('tool.errorPrefix') + (block?.content?.filter(x => x.type === 'text').map(x => x.text).join('\n') || t('tool.callFailed')));
  if (value.models) return h('details', { style: snap.card }, h('summary', null, t('tool.models.title', { count: value.models.length })),
    value.error ? h('p', { role: 'alert', style: snap.error }, value.error) : null,
    ...['chat', 'image', 'video', 'speech', 'music', 'research', 'unknown'].map(category => h('div', { key: category }, h('strong', null, t('tool.categoryLine', { category: t('tool.category.' + category) })), value.models.filter(x => x.category === category).map(x => x.id).join('、') || t('tool.models.empty'))));
  return h('div', { style: snap.stack },
    ...tasks.map(task => {
      const files = Array.isArray(task.files) ? task.files : [];
      if (task.status === 'saved' && files.length) return h(SavedFiles, { key: task.id, files, openFile });
      return h(SnapshotTask, { key: task.id, task, openFile, t });
    }),
    tasks.length ? null : h('pre', { style: { whiteSpace: 'pre-wrap', margin: 0 } }, JSON.stringify(value, null, 2)));
}

export function MediaPreview({ content, t = zhT }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const data = content?.kind === 'bytes' ? content.data : undefined;
  useEffect(() => {
    if (!data) { setUrl(null); return; }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const audio = bytes.length >= 3 && ((bytes[0] === 0x49 && bytes[1] === 0x44) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) || (bytes[0] === 0x52 && bytes[1] === 0x49));
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: audio ? (bytes[0] === 0x52 ? 'audio/wav' : 'audio/mpeg') : 'video/mp4' }));
    setUrl({ value: objectUrl, audio }); setFailed(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [data]);
  if (!url) return h('p', { role: 'status' }, t('media.loading'));
  return h('div', { style: { padding: 16 } },
    failed ? h('p', { role: 'alert' }, t('media.playbackFailed')) : null,
    h(url.audio ? 'audio' : 'video', { src: url.value, controls: true, preload: 'metadata', onError: () => setFailed(true), style: { width: '100%', maxHeight: '75vh' } }));
}

const KEY_REF = 'MINIMAX_API_KEY';
const ui = {
  page: { maxWidth: 860, display: 'grid', gap: 16, color: 'var(--dsw-alias-label-primary)' },
  card: { border: '0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l4))', background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2))', borderRadius: 'var(--dsw-radius-xl, 20px)', padding: 16, display: 'grid', gap: 12 },
  title: { margin: 0, fontSize: 14, fontWeight: 600 },
  hint: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: 1.5 },
  label: { display: 'grid', gap: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
  control: { height: 36, boxSizing: 'border-box', font: 'inherit', fontSize: 13, padding: '0 12px', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-md, 12px)' },
  button: { height: 32, padding: '0 14px', font: 'inherit', fontSize: 13, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm, 8px)', cursor: 'pointer' },
  danger: { height: 32, padding: '0 14px', font: 'inherit', fontSize: 13, color: 'var(--dsw-alias-state-error-primary, #c62828)', background: 'var(--dsw-alias-bg-layer-1)', border: '0.5px solid var(--dsw-alias-state-error-primary, #c62828)', borderRadius: 'var(--dsw-radius-sm, 8px)', cursor: 'pointer' },
  primary: { height: 32, padding: '0 14px', font: 'inherit', fontSize: 13, color: 'var(--dsw-alias-bg-base, #fff)', background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))', border: 0, borderRadius: 'var(--dsw-radius-sm, 8px)', cursor: 'pointer' },
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 },
  head: { textAlign: 'left', padding: '8px 6px', color: 'var(--dsw-alias-label-tertiary)', fontWeight: 500, borderBottom: '0.5px solid var(--dsw-alias-border-l3)' },
  status: { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
  alert: { margin: 0, color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
};
// 与官方模型配置同一套写法：密钥写进 dsh 凭据库（credentials/set），
// 配置里只保留引用名 apiKeyEnv；输入框 type=password，草稿留空表示沿用已存密钥。
const LEGAL_API_KEY = /^[\x21-\x7E]+$/;
function keyFailureOf(draft, t) {
  if (draft.length === 0) return undefined;
  const value = draft.trim();
  if (value.length === 0) return t('settings.keyFailure.blank');
  if (!LEGAL_API_KEY.test(value)) return t('settings.keyFailure.charset');
  return undefined;
}

const SIZE_UNITS = { '': 1, k: 1000, m: 1000000 };
// 思考强度是模型覆盖项里可选的档位；MiniMax 没有公开按模型分档的默认值，所以默认全不勾。
const ALL_EFFORTS = EFFORT_ORDER;
const CHAT_CAPABILITY_KEYS = ['settings.cap.chat', 'settings.cap.models', 'settings.cap.quota', 'settings.cap.seeMedia'];
const MEDIA_CAPABILITY_KEYS = ['settings.cap.image', 'settings.cap.imageEdit', 'settings.cap.video', 'settings.cap.voices', 'settings.cap.speech', 'settings.cap.speechLong', 'settings.cap.transcribe', 'settings.cap.music', 'settings.cap.status', 'settings.cap.retry', 'settings.cap.list', 'settings.cap.watch', 'settings.cap.player', 'settings.cap.unsupported', 'settings.cap.seeChat'];
// 媒体模型下拉按类别筛选：优先用上游给的类别，没有类别时按模型 ID 的常见命名判断。
// 兜底命名覆盖 MiniMax 官方在用的模型名：image-01、speech-2.8-hd、music-3.0、MiniMax-H3 等。
const MEDIA_FIELDS = [
  ['imageModel', 'settings.media.image', 'image'],
  ['videoModel', 'settings.media.video', 'video'],
  ['speechModel', 'settings.media.speech', 'speech'],
  ['musicModel', 'settings.media.music', 'music'],
];
const MEDIA_CATEGORY_PATTERNS = {
  image: [/image/i],
  video: [/video/i, /t2v/i, /i2v/i, /hailuo/i, /(^|-)h3($|-)/i],
  speech: [/speech/i, /tts/i, /voice/i],
  music: [/music/i],
};
const MEDIA_CATEGORIES = ['image', 'video', 'speech', 'music'];
// 媒体模型简介：设置页下拉下方展示一行说明，选中时更新；key 必须与字典里的 settings.modelNote.* 一致。
const MEDIA_NOTE_IDS = new Set([
  'image-01', 'image-01-live',
  'MiniMax-H3', 'MiniMax-H3-Highspeed', 'MiniMax-H3-Lite', 'MiniMax-H3-Max',
  'MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'MiniMax-Hailuo-02',
  'speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo', 'speech-02-hd', 'speech-02-turbo',
  'music-3.0', 'music-2.6', 'music-cover',
]);
function modelNoteOf(id, t) {
  return id && MEDIA_NOTE_IDS.has(id) ? t('settings.modelNote.' + id) : '';
}
function matchesMediaCategory(id, category, want) {
  if (category) return category === want;
  return (MEDIA_CATEGORY_PATTERNS[want] || []).some(pattern => pattern.test(String(id || '')));
}
function blankChatRow() {
  return { id: '', displayName: '', contextWindow: '', maxTokens: '', image: false, efforts: [] };
}
function EffortPicker({ index, efforts, disabled, onChange, t = zhT }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const selected = Array.isArray(efforts) ? efforts : [];
  const summary = selected.length ? selected.join('|') : t('settings.effort.unset');
  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (root.current && root.current.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return h('div', { ref: root, style: { position: 'relative' } },
    h('button', {
      type: 'button', disabled, 'aria-label': t('settings.effort.aria', { index }), 'aria-expanded': open ? 'true' : 'false',
      onClick: () => setOpen(value => !value),
      style: { ...ui.control, height: 32, width: 'auto', padding: '0 6px', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'left', cursor: disabled ? 'default' : 'pointer' },
    }, summary),
    open ? h('div', {
      role: 'group', 'aria-label': t('settings.effort.optionsAria', { index }),
      style: { position: 'absolute', zIndex: 20, top: 36, left: 0, minWidth: 148, display: 'grid', gap: 6, padding: 8,
        background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))', border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-md, 12px)' },
    }, ...ALL_EFFORTS.map(level => h('label', { key: level, style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 } },
      h('input', {
        type: 'checkbox', checked: selected.includes(level), 'aria-label': t('settings.effort.levelAria', { level, index }),
        onChange: event => {
          const next = event.target.checked ? [...selected, level] : selected.filter(item => item !== level);
          onChange(ALL_EFFORTS.filter(item => next.includes(item)));
        },
      }),
      level))) : null);
}

// 尺寸输入：支持 500K / 1M 这类写法，也接受纯数字。
function parseSize(text) {
  const value = String(text ?? '').trim();
  if (!value) return undefined;
  const matched = /^(\d+(?:\.\d+)?)\s*([kKmM]?)$/.exec(value);
  if (!matched) return undefined;
  const amount = Number(matched[1]) * SIZE_UNITS[matched[2].toLowerCase()];
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}
function formatSize(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return '';
  if (n % SIZE_UNITS.m === 0) return n / SIZE_UNITS.m + 'M';
  if (n % SIZE_UNITS.k === 0) return n / SIZE_UNITS.k + 'K';
  return String(n);
}
// 只读的提供商信息：模型配置弹窗里的「编辑」按钮打开的就是这里。
export function MinimaxProviderNotice({ view, form, t = zhT }) {
  const value = form?.state?.value;
  if (view === 'summary') return h('span', null, t('provider.summary'));
  const connection = value?.connection || {};
  const baseURL = resolveBaseURL(value);
  const rows = [
    [t('provider.row.providerId'), PROVIDER_ID],
    [t('provider.row.displayName'), PROVIDER_NAME],
    [t('provider.row.apiAddress'), baseURL],
    [t('provider.row.apiKey'), t('provider.value.credentialStore', { ref: KEY_REF })],
    [t('provider.row.modelSource'), t('provider.value.modelSource')],
    [t('provider.row.configLocation'), t('provider.value.configLocation', { pkg: PKG_NAME })],
  ];
  return h('section', { style: { maxWidth: 680, padding: '16px 0' } },
    h('h3', null, t('provider.title')),
    h('p', { style: { opacity: 0.8, fontSize: 12, marginBottom: 12 } }, t('provider.notice', { pkg: PKG_NAME })),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
      h('tbody', null, ...rows.map(([k, v]) => h('tr', { key: k },
        h('td', { style: { padding: '4px 8px 4px 0', opacity: 0.75, whiteSpace: 'nowrap' } }, k),
        h('td', { style: { padding: '4px 0' } }, h('code', null, String(v))))))));
}

export function MinimaxSettings(props) {
  const t = typeof props?.t === 'function' ? props.t : zhT;
  const view = props?.view;
  // 插件管理器只在「组件 minimax-byapi」这一行注入 { state, mutate }。
  // 包详情页没有表单，也不能从这里自己去读设置。
  const form = props?.form?.state ? props.form : null;
  const remote = props?.remote;
  const [draft, setDraft] = useState(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [message, setMessage] = useState('');
  const [discoverNotice, setDiscoverNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState(null);
  const [categoryOf, setCategoryOf] = useState({});
  const [nameOf, setNameOf] = useState({});
  const [specOf, setSpecOf] = useState({});
  const [rows, setRows] = useState(null);
  const [loaded, setLoaded] = useState(form?.state?.value ? null : { connection: {}, media: {}, modelOverrides: [] });
  const [revision, setRevision] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const accepted = form?.state?.value || loaded;
  const value = draft || accepted;
  // 详情页不带表单。自动获取必须等这份配置回来，否则首屏空地址会被宿主拒绝。
  // 每次 effect 换一个 promise：严格模式先卸载再挂载时，不能让第一次的空结果关掉下一次。
  const settingsGate = useRef({ generation: 0, ready: Promise.resolve(null) });
  useEffect(() => {
    const generation = ++settingsGate.current.generation;
    let resolveGate = () => {};
    const ready = new Promise(resolve => { resolveGate = resolve; });
    settingsGate.current.ready = ready;
    const finish = next => { if (generation === settingsGate.current.generation) resolveGate(next); };
    if (form?.state?.value || !remote?.settings?.describe) {
      finish(form?.state?.value || null);
      return () => { finish(null); };
    }
    let live = true;
    remote.settings.describe().then(found => {
      const entry = readSettingsEntry(found);
      if (!live || generation !== settingsGate.current.generation) return;
      if (!entry) {
        setMessage(t('settings.load.missing'));
        finish(null);
        return;
      }
      setLoaded(entry.value);
      setRevision(entry.revision);
      finish(entry.value);
    }).catch(error => {
      if (generation !== settingsGate.current.generation) return;
      if (live) setMessage(t('settings.load.failed', { message: error?.message || t('error.unknown') }));
      finish(null);
    });
    return () => { live = false; finish(null); };
  }, []);
  useEffect(() => { setDraft(null); }, [form?.state?.revision, revision]);
  const autoRan = useRef(false);
  const media = value?.media || {};
  const ids = discovered || [];
  const planId = resolvePlan(value);
  const apiId = resolveApi(value);
  // 已配置的模型即使还没点「获取模型」也要能显示和编辑。
  const savedRows = (value?.modelOverrides || []).map(o => ({
    id: o.id, displayName: o.displayName || o.id,
    contextWindow: formatSize(o.contextWindow), maxTokens: formatSize(o.maxTokens),
    image: o.imageSupported === true, efforts: Array.isArray(o.reasoningEfforts) ? o.reasoningEfforts : [],
  }));
  const rowList = rows || (savedRows.length ? savedRows : [blankChatRow()]);

  const setCredential = async (ref, secret) => {
    const response = await remote?.credentials?.set(ref, secret);
    if (response === undefined) throw new Error(t('settings.credential.writeUnavailable'));
    return response.ok ? undefined : response.error?.message || t('settings.credential.writeFailed');
  };
  const field = (section, key, label) => h('label', { key: section + key, style: ui.label }, label,
    h('input', { type: 'text', 'aria-label': label,
      value: section === 'connection' && key === 'baseURL' ? resolveBaseURL(value) : (value[section]?.[key] ?? ''),
      disabled: busy,
      onChange: event => setDraft({ ...value, [section]: { ...value[section], [key]: event.target.value } }),
      style: ui.control }));
  const setMedia = (key, patch) => setDraft({ ...value, media: { ...media, ...patch } });
  // 选预设时把地址和协议一起写进草稿；custom 不动用户已经填好的值。
  function applyPlan(nextPlan) {
    const plan = planById(nextPlan);
    if (!plan) return;
    const connection = { ...(value.connection || {}) };
    if (plan.id === 'custom') connection.plan = 'custom';
    else { connection.plan = plan.id; connection.baseURL = plan.baseURL; connection.api = plan.api; }
    setDraft({ ...value, connection });
  }
  // 官方主机上协议与地址前缀是配对的：OpenAI 兼容走 /v1，Anthropic 兼容走 /anthropic。
  // 切协议时把地址一起换掉，避免出现「地址是 /v1 却按 Anthropic 协议发请求」的组合。
  function protocolBaseURL(baseURL, api) {
    let url;
    try { url = new URL(baseURL); } catch { return baseURL; }
    if (!MINIMAX_API_HOSTS.includes(url.hostname)) return baseURL;
    const path = url.pathname.replace(/\/+$/, '');
    if (path !== '' && path !== '/v1' && path !== '/anthropic') return baseURL;
    url.pathname = api === 'anthropic-messages' ? '/anthropic' : '/v1';
    return url.href.replace(/\/$/, '');
  }
  function applyProtocol(nextApi) {
    const connection = { ...(value.connection || {}) };
    const swapped = protocolBaseURL(resolveBaseURL(value), nextApi);
    connection.api = nextApi;
    connection.baseURL = swapped;
    const normalized = swapped.replace(/\/+$/, '');
    // 预设同时约束地址与协议：只有两者都匹配才算那个接入方式，否则算自定义。
    const matched = ACCESS_PLANS.find(plan => plan.baseURL && plan.baseURL.replace(/\/+$/, '') === normalized && plan.api === nextApi);
    connection.plan = matched && matched.id !== 'custom' ? matched.id : 'custom';
    setDraft({ ...value, connection });
  }

  const mediaOptions = (category, key) => {
    const saved = (value.modelOverrides || [])
      .filter(row => matchesMediaCategory(row.id, row.category, category))
      .map(row => row.id);
    const listed = discovered ? ids.filter(id => matchesMediaCategory(id, categoryOf[id], category)) : [];
    const current = typeof media[key] === 'string' ? media[key] : '';
    return [...new Set([...(current ? [current] : []), ...saved, ...listed])];
  };
  // 能不能用只看有没有配上模型：选了 ID 即可用，选「不使用」即清空。
  const mediaPicker = (key, label, category) => {
    const options = mediaOptions(category, key);
    const current = options.includes(media[key]) ? media[key] : '';
    const note = modelNoteOf(current, t);
    return h('div', { key: 'media' + key, style: { display: 'grid', gap: 4 } },
      h('label', { style: ui.label }, label,
        h('select', { value: current, disabled: busy, 'aria-label': label,
          onChange: event => setMedia(key, { [key]: event.target.value }),
          style: ui.control },
          h('option', { value: '' }, options.length || discovered ? t('settings.media.none') : t('settings.getModelsFirst')),
          ...options.map(id => h('option', { key: id, value: id, title: modelNoteOf(id, t) || undefined }, id)))),
      note ? h('p', { style: ui.hint }, note) : null);
  };

  const chatIdOptions = exclude => {
    const excluded = MEDIA_CATEGORIES;
    const saved = (value.modelOverrides || []).map(row => row.id).filter(id => id && !excluded.includes(categoryOf[id]));
    const listed = discovered ? ids.filter(id => !excluded.includes(categoryOf[id])) : [];
    const list = [...new Set([...saved, ...listed])];
    const taken = new Set(rowList.filter(r => r.id !== exclude).map(r => r.id).filter(Boolean));
    return list.filter(id => !taken.has(id) || id === exclude);
  };

  async function discover(source) {
    const current = source === undefined ? value : source;
    const baseURL = resolveBaseURL(current);
    setDiscovering(true); setMessage(''); setDiscoverNotice(null);
    try {
      const api = remote?.llm;
      if (!api?.discoverModels) { setDiscoverNotice({ ok: false, text: t('settings.discovery.unavailable') }); return; }
      const request = { baseURL, api: resolveApi(current) };
      if (keyDraft.trim()) request.apiKey = keyDraft.trim();
      const found = await api.discoverModels(SETTINGS_NS, request);
      // 远程调用返回 { ok, value }；测试和宿主直连则直接给数组。
      const listed = Array.isArray(found) ? found : (found?.ok ? found.value : undefined);
      if (!Array.isArray(listed)) {
        const raw = found?.error?.message;
        setDiscoverNotice({ ok: false, text: discoveryErrorText(t, raw) || t('settings.discovery.invalidResponse') });
        return;
      }
      const models = listed.map(m => ({
        id: m.id, name: m.name, category: m.category || defaultCategory(m.id),
        contextWindow: m.contextWindow, maxTokens: m.maxTokens,
        input: Array.isArray(m.inputModalities) ? m.inputModalities : ['text'],
      }));
      const byCategory = new Map();
      const names = new Map();
      const specs = new Map();
      for (const m of models) {
        byCategory.set(m.id, m.category || '');
        names.set(m.id, m.name || m.id);
        specs.set(m.id, {
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          image: Array.isArray(m.input) && m.input.length ? m.input.includes('image') : defaultImageSupported(m.id),
          efforts: defaultReasoningEfforts(m.id),
        });
      }
      setDiscovered(models.map(m => m.id));
      setCategoryOf(Object.fromEntries(byCategory));
      setNameOf(Object.fromEntries(names));
      setSpecOf(Object.fromEntries(specs));
      const nextRows = (current?.modelOverrides || []).map(o => ({
        id: o.id, displayName: o.displayName || names.get(o.id) || o.id,
        contextWindow: formatSize(o.contextWindow), maxTokens: formatSize(o.maxTokens),
        image: o.imageSupported !== undefined ? o.imageSupported === true : specs.get(o.id)?.image === true,
        efforts: Array.isArray(o.reasoningEfforts) && o.reasoningEfforts.length ? o.reasoningEfforts : defaultReasoningEfforts(o.id),
      }));
      setRows(nextRows.length ? nextRows : [blankChatRow()]);
      setDiscoverNotice({ ok: models.length > 0, text: t('settings.discovery.found', { count: models.length }) });
      if (models.length) setChatOpen(true);
    } catch (error) {
      setDiscoverNotice({ ok: false, text: t('settings.discovery.failed', { message: discoveryErrorText(t, error?.message) || t('error.unknown') }) });
    } finally { setDiscovering(false); }
  }

  const updateRow = (index, patch) => setRows(rowList.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  function addRow() {
    const used = new Set(rowList.map(r => r.id));
    const candidate = chatIdOptions().find(id => !used.has(id)) || '';
    const spec = specOf[candidate] || {};
    setRows([...rowList, {
      id: candidate, displayName: nameOf[candidate] || candidate,
      contextWindow: spec.contextWindow ? formatSize(spec.contextWindow) : '',
      maxTokens: spec.maxTokens ? formatSize(spec.maxTokens) : '',
      image: spec.image === true, efforts: Array.isArray(spec.efforts) ? spec.efforts : defaultReasoningEfforts(candidate),
    }]);
  }
  const removeRow = index => setRows(rowList.filter((_, i) => i !== index));
  function pickRowModel(index, id) {
    const spec = specOf[id] || {};
    updateRow(index, {
      id, displayName: nameOf[id] || id,
      contextWindow: spec.contextWindow ? formatSize(spec.contextWindow) : '',
      maxTokens: spec.maxTokens ? formatSize(spec.maxTokens) : '',
      image: spec.image === true,
      efforts: Array.isArray(spec.efforts) ? spec.efforts : defaultReasoningEfforts(id),
    });
  }

  // 进入页面后只自动获取一次。先等已保存地址，再确认凭据库里已有密钥。
  // 详情页首屏没有表单，空 baseURL 会被宿主拒绝成 “provider route or a baseURL”。
  useEffect(() => {
    if (autoRan.current || !remote?.credentials?.describe) return undefined;
    let live = true;
    (async () => {
      const source = await settingsGate.current.ready;
      if (!live || autoRan.current) return;
      let found;
      try { found = await remote.credentials.describe([KEY_REF]); }
      catch { return; }
      if (!live || autoRan.current) return;
      const payload = found?.ok ? found.value : found;
      const info = payload?.[KEY_REF] || payload;
      if (info?.configured !== true) return;
      autoRan.current = true;
      return discover(source || {});
    })().catch(() => {});
    return () => { live = false; };
  }, []);

  const keyFailure = keyFailureOf(keyDraft, t);
  if (view === 'summary') return h('span', null, t('settings.summary'));
  function configuredRows() { return rowList.filter(row => row.id); }
  function overrideOps() {
    const ops = [];
    for (const row of configuredRows()) {
      const contextWindow = parseSize(row.contextWindow);
      const maxTokens = parseSize(row.maxTokens);
      if (contextWindow === undefined) { setMessage(t('settings.validation.contextWindow', { id: row.id })); return undefined; }
      if (maxTokens === undefined) { setMessage(t('settings.validation.maxTokens', { id: row.id })); return undefined; }
      const previous = (value.modelOverrides || []).find(x => x.id === row.id) || {};
      const next = { ...previous, id: row.id, displayName: row.displayName || row.id, imageSupported: !!row.image, contextWindow, maxTokens, reasoningEfforts: row.efforts };
      if (previous.displayName !== next.displayName || (previous.imageSupported === true) !== next.imageSupported
        || previous.contextWindow !== contextWindow || previous.maxTokens !== maxTokens
        || JSON.stringify(previous.reasoningEfforts || []) !== JSON.stringify(row.efforts)) ops.push(next);
    }
    return ops;
  }

  async function commit(ops, note) {
    const writer = form?.mutate || remote?.settings?.mutate;
    const expected = form?.state?.revision ?? revision;
    if (typeof writer !== 'function') { setMessage(t('settings.writeUnavailable')); return false; }
    setBusy(true); setMessage('');
    try {
      const landed = form ? await form.mutate(ops, expected) : await remote.settings.mutate(SETTINGS_NS, ops, expected);
      if (form ? landed === false : landed?.ok === false) { setMessage(t('settings.save.rejected')); return false; }
      if (!form) {
        // 详情页的远程调用返回 { ok, value: { value: 配置节, revision, … } } 这一层 namespace view。
        // 把 view 当配置节会让媒体模型回退成「不使用」，并让下一次保存继续用旧 revision 撞冲突。
        const view = landed?.value;
        if (view?.value) { setLoaded(view.value); setRevision(view.revision ?? revision); }
      }
      setDraft(null);
      setMessage(note);
      return true;
    } catch { setMessage(t('settings.save.failed')); return false; }
    finally { setBusy(false); }
  }
  async function saveConnection() {
    if (keyFailure) { setMessage(keyFailure); return; }
    const connection = {
      ...(value.connection || {}),
      plan: planId,
      baseURL: resolveBaseURL(value),
      api: apiId,
      apiKeyEnv: KEY_REF,
      apiKey: '',
    };
    const saved = await commit([{ op: 'set', path: ['connection'], value: connection }], t(keyDraft.trim() ? 'settings.save.addressPending' : 'settings.save.addressDone'));
    if (!saved) return;
    if (keyDraft.trim()) {
      const failure = await setCredential(KEY_REF, keyDraft.trim());
      if (failure) { setMessage(t('settings.save.keyFailed', { message: failure })); return; }
      setKeyDraft('');
      setMessage(t('settings.save.credentialDone', { ref: KEY_REF }));
    }
  }
  async function saveChat() {
    if (!discovered && !configuredRows().length) { setMessage(t('settings.save.needModels')); return; }
    const pending = overrideOps();
    if (pending === undefined) return;
    const savingRows = configuredRows();
    // 表格就是对话模型名单。删掉的行不能再并回，否则选择器和再次进入详情仍是全部模型。
    const nextRows = savingRows.map(row => {
      const previous = (value.modelOverrides || []).find(x => x.id === row.id) || {};
      return { ...previous, id: row.id, displayName: row.displayName || row.id, imageSupported: !!row.image,
        contextWindow: parseSize(row.contextWindow), maxTokens: parseSize(row.maxTokens), reasoningEfforts: row.efforts };
    });
    await commit([
      { op: 'set', path: ['modelOverrides'], value: nextRows },
      { op: 'unset', path: ['media', 'defaultModel'] },
    ], t('settings.save.chatCount', { count: savingRows.length }));
  }
  async function saveMedia() {
    const nextMedia = { ...media };
    delete nextMedia.defaultModel;
    for (const [key, , category] of MEDIA_FIELDS) {
      const options = mediaOptions(category, key);
      const chosen = typeof media[key] === 'string' ? media[key] : '';
      nextMedia[key] = chosen && options.includes(chosen) ? chosen : '';
    }
    await commit([{ op: 'set', path: ['media'], value: nextMedia }], t('settings.save.mediaDone'));
  }

  const cellInput = { ...ui.control, height: 32, padding: '0 8px' };
  const cell = { padding: '8px 6px', borderBottom: '0.5px solid var(--dsw-alias-border-l4)', verticalAlign: 'middle' };
  const chatOptions = id => chatIdOptions(id);

  return h('section', { style: ui.page },
    h('section', { style: ui.card },
      h('h3', { style: ui.title }, t('settings.connection')),
      h('label', { style: ui.label }, t('settings.accessMode'),
        h('select', {
          value: planId, disabled: busy, 'aria-label': t('settings.accessMode'),
          onChange: event => applyPlan(event.target.value), style: ui.control,
        }, ...ACCESS_PLANS.map(plan => h('option', { key: plan.id, value: plan.id }, t('settings.plan.' + plan.id))))),
      h('p', { style: ui.hint }, t('settings.plan.hint')),
      h('div', { style: { display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 12 } },
        h('label', { style: ui.label }, t('settings.apiProtocol'),
          h('select', {
            value: apiId,
            disabled: busy, 'aria-label': t('settings.apiProtocol'),
            onChange: event => applyProtocol(event.target.value),
            style: ui.control,
          },
          h('option', { value: 'openai-completions' }, 'Chat Completions'),
          h('option', { value: 'openai-responses' }, 'Responses'),
          h('option', { value: 'anthropic-messages' }, 'Anthropic Messages'))),
        field('connection', 'baseURL', t('settings.apiAddress'))),
      h('p', { style: ui.hint }, t('settings.protocolHint')),
      h('label', { style: ui.label }, t('settings.apiKey'),
        h('input', { type: 'password', autoComplete: 'new-password', value: keyDraft, disabled: busy, placeholder: t('settings.apiKeyPlaceholder'),
          'aria-label': t('settings.apiKey'), onChange: event => setKeyDraft(event.target.value), style: ui.control })),
      keyFailure ? h('p', { role: 'alert', style: ui.alert }, keyFailure) : null,
      h('p', { style: ui.hint }, t('settings.credentialHint', { ref: KEY_REF })),
      h('div', { style: ui.row },
        h('button', { type: 'button', disabled: busy || discovering, onClick: () => discover(), style: ui.button }, discovering ? t('settings.action.gettingModels') : t('settings.action.getModels')),
        discoverNotice ? h('span', { role: 'status', style: { color: discoverNotice.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)', fontSize: 13 } }, discoverNotice.text) : null,
        h('button', { type: 'button', disabled: busy || form?.state?.writable === false, onClick: saveConnection, style: { ...ui.primary, marginLeft: 'auto' } }, busy ? t('settings.action.saving') : t('settings.action.saveConnection')))),
    h('section', { style: ui.card },
      h('button', { type: 'button', 'aria-expanded': chatOpen ? 'true' : 'false', onClick: () => setChatOpen(open => !open), style: { ...ui.row, width: '100%', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 } },
        h('h3', { style: ui.title }, (chatOpen ? '▾ ' : '▸ ') + t('settings.chatModels'))),
      chatOpen ? h('p', { style: ui.hint }, t('settings.chatHint')) : null,
      chatOpen ? h('p', { style: ui.hint }, discovered ? t('settings.discoveredCount', { count: ids.length }) : t('settings.chatEmptyHint')) : null,
      chatOpen ? h('div', { style: { overflow: 'visible' } },
        h('table', { style: ui.table },
          h('thead', null, h('tr', null, ...['', 'settings.table.modelId', 'settings.table.displayName', 'settings.table.images', 'settings.table.context', 'settings.table.maxOutput', 'settings.table.effort'].map(label => h('th', { key: label || 'actions', style: ui.head }, label ? t(label) : '')))),
          h('tbody', null, ...rowList.map((row, index) => h('tr', { key: index },
            h('td', { style: cell }, h('button', {
              type: 'button', disabled: busy,
              'aria-label': t('settings.table.deleteRowAria', { index: index + 1 }), onClick: () => removeRow(index), style: ui.danger,
            }, t('settings.action.delete'))),
            h('td', { style: cell }, h('select', { value: row.id, disabled: busy, 'aria-label': t('settings.table.modelIdAria', { index }), onChange: event => pickRowModel(index, event.target.value), style: cellInput },
              h('option', { value: '' }, chatOptions(row.id).length ? t('settings.table.selectModel') : t('settings.getModelsFirst')),
              ...chatOptions(row.id).map(id => h('option', { key: id, value: id }, id)))),
            h('td', { style: cell }, h('input', { type: 'text', value: row.displayName ?? '', disabled: busy, 'aria-label': t('settings.table.displayNameAria', { index }), onChange: event => updateRow(index, { displayName: event.target.value }), style: { ...cellInput, width: 120 } })),
            h('td', { style: cell }, h('input', { type: 'checkbox', checked: !!row.image, disabled: busy, 'aria-label': t('settings.table.imagesAria', { index }), onChange: event => updateRow(index, { image: event.target.checked }) })),
            h('td', { style: cell }, h('input', { type: 'text', value: row.contextWindow ?? '', disabled: busy, placeholder: '500K', 'aria-label': t('settings.table.contextAria', { index }), onChange: event => updateRow(index, { contextWindow: event.target.value }), style: { ...cellInput, width: 64 } })),
            h('td', { style: cell }, h('input', { type: 'text', value: row.maxTokens ?? '', disabled: busy, placeholder: '32K', 'aria-label': t('settings.table.maxOutputAria', { index }), onChange: event => updateRow(index, { maxTokens: event.target.value }), style: { ...cellInput, width: 64 } })),
            h('td', { style: cell }, h(EffortPicker, { index, efforts: row.efforts, disabled: busy, onChange: efforts => updateRow(index, { efforts }), t }))))),
          rowList.length ? null : h('tfoot', null, h('tr', null, h('td', { colSpan: 7, style: { ...cell, color: 'var(--dsw-alias-label-tertiary)' } }, t('settings.table.noRows')))))) : null,
      chatOpen ? h('div', { style: ui.row },
        h('button', { type: 'button', disabled: busy || !discovered, 'aria-label': t('settings.action.addRow'), onClick: addRow, style: ui.button }, t('settings.action.add')),
        h('button', { type: 'button', disabled: busy || form?.state?.writable === false, onClick: saveChat, style: { ...ui.primary, marginLeft: 'auto' } }, busy ? t('settings.action.saving') : t('settings.action.saveChat'))) : null),
    h('section', { style: ui.card },
      h('button', { type: 'button', 'aria-expanded': mediaOpen ? 'true' : 'false', onClick: () => setMediaOpen(open => !open), style: { ...ui.row, width: '100%', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: 0 } },
        h('h3', { style: ui.title }, (mediaOpen ? '▾ ' : '▸ ') + t('settings.mediaModels'))),
      mediaOpen ? h(React.Fragment, null, ...MEDIA_FIELDS.map(entry => mediaPicker(entry[0], t(entry[1]), entry[2])),
        h('div', { style: { ...ui.row, justifyContent: 'flex-end' } },
          h('button', { type: 'button', disabled: busy || form?.state?.writable === false, onClick: saveMedia, style: ui.primary }, busy ? t('settings.action.saving') : t('settings.action.saveMedia')))) : null),
    form?.state?.writable === false ? h('p', { role: 'alert', style: ui.alert }, t('settings.writableBlocked')) : null,
    message ? h('p', { role: 'status', style: ui.status }, message) : null);
}
// 上游没给类别时按模型 ID 判断媒体类别（与后端分类规则保持同一套命名习惯）。
function defaultCategory(id) {
  const key = String(id || '');
  for (const category of MEDIA_CATEGORIES) {
    if (matchesMediaCategory(key, undefined, category)) return category;
  }
  return 'chat';
}
function capabilityView(keys, summaryKey) {
  return function CapabilityView({ view, t = zhT }) {
    if (view === 'summary') return h('span', null, t(summaryKey));
    return h('section', { style: ui.card },
      h('h3', { style: ui.title }, t('settings.capabilities')),
      h('ul', { style: { margin: 0, paddingLeft: 18, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.5 } },
        ...keys.map(key => h('li', { key, style: { whiteSpace: 'pre-wrap' } }, t(key)))));
  };
}
// ── 侧栏余额组件 ────────────────────────────────────────────────────────────
// 额度查询需要 API Key，而密钥只存在 dsh 凭据库里、值不过网，所以查询必须留在宿主：
// 前端调用宿主暴露的 /api/minimaxQuota/quota（Typert 网关把宿主 Service 转成 HTTP 端点）。
const QUOTA_NAMESPACE = 'minimaxQuota';
const QUOTA_ENDPOINT = QUOTA_NAMESPACE + '/quota';
// 5 小时窗口变化快，5 分钟自己刷一次；周窗口跟着同一次请求一起更新。
const QUOTA_REFRESH_MS = 5 * 60 * 1000;

/**
 * 调用宿主的额度接口。
 * @returns {Promise<object>} 宿主返回的额度快照（ok 为 false 时带 code 与 message）。
 */
async function quotaRequest() {
  const rpcId = 'minimax-quota-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const response = await fetch('/api/' + QUOTA_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: QUOTA_ENDPOINT, payload: { args: {} } }),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const body = await response.json();
  if (!body || body.type !== 'server-response' || !body.result) throw new Error('bad response');
  if (body.result.ok === false) {
    const error = new Error(body.result.error?.message || 'quota failed');
    error.code = body.result.error?.code;
    throw error;
  }
  return body.result.value;
}

/**
 * 窗口的剩余百分比，夹在 0–100。
 * @param {object} window 额度窗口。
 * @returns {number|null} 百分比，或没有该数值时的 null。
 */
export function quotaPercent(window) {
  const value = window?.percentRemaining;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

/**
 * 数字的本地化写法。
 * @param {number|undefined} value 数值。
 * @returns {string} 本地化数字，或占位符。
 */
function quotaNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

/**
 * 重置时间的本地化写法；解析不了就原样返回。
 * @param {string|undefined} value ISO 时间串。
 * @returns {string} 本地化时间。
 */
function quotaTime(value) {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const quotaStyles = {
  root: { position: 'relative', display: 'flex', justifyContent: 'center', width: '100%', minWidth: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0, padding: '6px 8px', margin: 0, font: 'inherit', fontSize: 12, lineHeight: 1.4, color: 'var(--dsw-alias-label-primary)', background: 'transparent', border: 0, borderRadius: 'var(--dsw-radius-sm, 8px)', cursor: 'pointer', textAlign: 'left' },
  rowHover: { background: 'var(--dsw-alias-interactive-bg-hover, transparent)' },
  railRow: { width: 36, height: 36, justifyContent: 'center', padding: 0 },
  badge: { flex: 'none', width: 20, height: 20, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-fill-l2, #8882)' },
  name: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  value: { flex: 'none', color: 'var(--dsw-alias-label-secondary)' },
  panel: { position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 264, maxWidth: 'calc(100vw - 24px)', display: 'grid', gap: 10, padding: 12, border: 0, borderRadius: 'var(--dsw-radius-lg, 16px)', background: 'var(--dsw-alias-bg-layer-2, #fff)', boxShadow: 'var(--dsw-elevation-panel)', color: 'var(--dsw-alias-label-primary)' },
  panelTitle: { margin: 0, fontSize: 12, fontWeight: 600 },
  panelRow: { display: 'grid', gap: 4 },
  panelLabel: { margin: 0, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' },
  panelMeta: { margin: 0, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
  track: { height: 4, borderRadius: 999, overflow: 'hidden', background: 'var(--dsw-alias-fill-l2, #8882)' },
  fill: { display: 'block', height: '100%', borderRadius: 999, background: 'var(--dsw-alias-brand-primary, currentColor)' },
  refresh: { justifySelf: 'start', padding: '4px 10px', font: 'inherit', fontSize: 11, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1, transparent)', border: '0.5px solid var(--dsw-alias-border-l2, #8885)', borderRadius: 'var(--dsw-radius-sm, 8px)', cursor: 'pointer' },
};

/**
 * 一个额度窗口的展示行：标题、进度条、剩余量与重置时间。
 * @param {object} props 组件属性。
 * @returns {object} React 元素。
 */
function QuotaWindowRow({ label, window, t }) {
  const percent = quotaPercent(window);
  const reset = quotaTime(window?.resetAt);
  return h('div', { style: quotaStyles.panelRow },
    h('p', { style: quotaStyles.panelLabel }, label),
    h('div', { style: quotaStyles.track, 'aria-hidden': 'true' },
      h('div', { style: { ...quotaStyles.fill, width: (percent === null ? 0 : percent) + '%' } })),
    h('p', { style: quotaStyles.panelMeta },
      percent === null ? t('quota.unknown') : t('quota.remaining', { percent: Math.round(percent) })),
    Number.isFinite(window?.remaining) ? h('p', { style: quotaStyles.panelMeta }, t('quota.remainingOf', { remaining: quotaNumber(window.remaining), total: quotaNumber(window.total) })) : null,
    reset ? h('p', { style: quotaStyles.panelMeta }, t('quota.resetAt', { time: reset })) : null);
}

/**
 * 左侧栏底部的 MiniMax 余额组件。
 * 展开态显示「MiniMax + 5 小时窗口剩余百分比」，收起态只剩一个图标；点击展开两个窗口的明细。
 * 按量付费 Key 本来就没有 M Plan 额度，这种情况下组件不显示。
 * @param {object} props 组件属性（wide 为侧栏是否展开，t 为翻译函数）。
 * @returns {object|null} React 元素。
 */
export function MinimaxQuotaWidget({ wide, t = zhT }) {
  const [state, setState] = useState({ status: 'loading', data: null, message: '' });
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const alive = useRef(true);
  const loader = useRef(null);

  const load = async () => {
    try {
      const value = await quotaRequest();
      if (!alive.current) return;
      if (!value || value.ok === false) {
        const code = value?.code;
        // 按量付费 Key 没有 M Plan 额度，自建地址也查不了：这两种情况不占侧栏位置。
        if (code === 'subscription-required' || code === 'unsupported-host') {
          setState({ status: 'hidden', data: null, message: '' });
          return;
        }
        setState({ status: 'error', data: null, message: value?.message || '' });
        return;
      }
      setState({ status: 'ready', data: value, message: '' });
    } catch (error) {
      if (!alive.current) return;
      setState({ status: 'error', data: null, message: error?.message || '' });
    }
  };
  loader.current = load;

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => { void loader.current?.(); }, QUOTA_REFRESH_MS);
    return () => { alive.current = false; clearInterval(timer); };
  }, []);

  // 面板是浮层：点外面或按 Esc 收起来，焦点还在按钮上。
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      const node = root.current;
      if (node && event.target && node.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (state.status === 'hidden') return null;
  const data = state.data;
  const percent = quotaPercent(data?.interval5h);
  const title = t('quota.title');
  const summary = state.status === 'ready'
    ? (percent === null ? t('quota.unknown') : t('quota.remaining', { percent: Math.round(percent) }))
    : state.status === 'error' ? t('quota.unavailable') : t('quota.loading');
  const rowStyle = { ...quotaStyles.row, ...(wide ? {} : quotaStyles.railRow), ...(hover ? quotaStyles.rowHover : {}) };
  const button = h('button', {
    type: 'button',
    style: rowStyle,
    'aria-label': title + ' · ' + summary,
    'aria-expanded': open ? 'true' : 'false',
    title: state.status === 'error' && state.message ? state.message : summary,
    onClick: () => setOpen(value => !value),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  },
    h('span', { style: quotaStyles.badge, 'aria-hidden': 'true' }, 'M'),
    wide ? h('span', { style: quotaStyles.name }, title) : null,
    wide ? h('span', { style: quotaStyles.value }, summary) : null);
  const panel = open ? h('div', { style: quotaStyles.panel, role: 'dialog', 'aria-label': title },
    h('p', { style: quotaStyles.panelTitle }, title),
    h(QuotaWindowRow, { label: t('quota.window5h'), window: data?.interval5h, t }),
    h(QuotaWindowRow, { label: t('quota.windowWeekly'), window: data?.weekly, t }),
    state.status === 'error' ? h('p', { role: 'alert', style: quotaStyles.panelMeta }, state.message || t('quota.unavailable')) : null,
    h('button', { type: 'button', style: quotaStyles.refresh, onClick: () => { void load(); } }, t('quota.refresh'))) : null;
  return h('div', { style: quotaStyles.root, ref: node => { root.current = node; } }, button, panel);
}

export function apply(ctx) {
  // 字典命名空间：官方 locale 服务可用时注册 zh/en，语言切换后槽位组件自动重渲染。
  if (typeof ctx.locale?.register === 'function') {
    ctx.effect(() => ctx.locale.register('minimaxByapi', { zh, en }), 'minimax-byapi: dictionaries');
  }
  // 非 React 场景（documentPreview 标题）用绑定的翻译函数；旧宿主没有 locale 时回退中文。
  const t = typeof ctx.locale?.bind === 'function' ? ctx.locale.bind('minimaxByapi') : zhT;
  // 槽位声明 locale: 'minimaxByapi' 才会注入 t；旧宿主不支持时省略该字段。
  const locale = typeof ctx.locale?.register === 'function' ? 'minimaxByapi' : undefined;
  const slotOptions = options => (locale ? { ...options, locale } : options);
  const page = props => MinimaxSettings({ ...props, remote: ctx.remote });
  // 插件页只放连接和模型。能力按组件拆开，同一份说明不再出现三遍。
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(slotOptions({ name: 'plugins.bundle.config', key: PKG_NAME }), page));
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register(slotOptions({ name: 'plugins.row.config', key: PKG_NAME + '#minimax-byapi' }), capabilityView(CHAT_CAPABILITY_KEYS, 'settings.cap.chatSummary')));
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register(slotOptions({ name: 'plugins.row.config', key: PKG_NAME + '#dsh-minimax-media' }), capabilityView(MEDIA_CAPABILITY_KEYS, 'settings.cap.mediaSummary')));
  for (const key of tools) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(slotOptions({ name: 'tool.call.toolview', key }), MinimaxToolCard));
  ctx.effect(() => ctx.documentPreviews.register({ id: MEDIA_ID, extensions: ['mp4', 'mp3', 'wav'], binaryExtensions: ['mp4', 'mp3', 'wav'], priority: 'extension', title: () => t('media.title'), loading: 'bytes-complete', wrap: false }));
  ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(slotOptions({ name: 'sidebar.right.tab.document', key: MEDIA_ID }), MediaPreview));
  // 左侧栏底部：MiniMax 额度（余额）组件。数据来自宿主接口 /api/minimaxQuota/quota，密钥不过网。
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(slotOptions({ name: 'sidebar.footer.action', id: QUOTA_ID }), MinimaxQuotaWidget));
}
