// 侧栏余额组件的服务端一半。
//
// 前端拿不到 API Key（密钥只在 dsh 凭据库里，且凭据值不过网），所以额度查询必须留在宿主进程。
// DSH 的 Typert 网关把宿主里的 Service 暴露成 /api/<命名空间>/<方法>：服务对象带 typertRemote 绑定，
// 原型上带源码模式的 Remote 标记，网关就会认领这个端点。前端用 POST 调它，密钥不出宿主。

/** 额度接口的命名空间，也是端点前缀（/api/minimaxQuota/quota）。 */
export const QUOTA_NAMESPACE = 'minimaxQuota';

/** 网关读取源码模式 Remote 标记时用的属性名。 */
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods';

/**
 * 把一个额度窗口裁成前端要用的字段。
 * @param {object} window 归一化后的窗口（src/minimax-api.js 的 quotaWindow 结果）。
 * @returns {object} 只保留总量、剩余、已用、剩余百分比与重置时间。
 */
function pickWindow(window) {
  const source = window && typeof window === 'object' ? window : {};
  return {
    total: Number.isFinite(source.total) ? source.total : undefined,
    remaining: Number.isFinite(source.remaining) ? source.remaining : undefined,
    used: Number.isFinite(source.used) ? source.used : undefined,
    percentRemaining: Number.isFinite(source.percentRemaining) ? source.percentRemaining : undefined,
    resetAt: typeof source.resetAt === 'string' ? source.resetAt : undefined,
  };
}

/**
 * 把宿主错误归类成前端能直接处理的三种情况。
 * - subscription-required：按量付费 Key，M Plan 本来就没有额度，组件直接隐藏；
 * - unsupported-host：API 地址不是 MiniMax 官方主机，同样查不了；
 * - error：其余错误（网络、超时、服务端异常），组件显示为不可用。
 * @param {unknown} error 宿主捕获的异常。
 * @returns {string} 错误分类。
 */
export function classifyQuotaError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/订阅 Key|按量付费/.test(message)) return 'subscription-required';
  if (/官方主机/.test(message)) return 'unsupported-host';
  return 'error';
}

/**
 * 宿主侧的 M Plan 额度服务：一次调用返回两个窗口的余量，或者一个可读的错误分类。
 */
export class MinimaxQuotaService {
  /**
   * @param {{ quota: () => Promise<object> }} runtime 插件运行时，提供 quota()。
   */
  constructor(runtime) {
    this.runtime = runtime;
    // 网关按这个绑定找命名空间：namespace 必须与前端请求的命名空间一致。
    this.typertRemote = Object.freeze({ service: this, serviceKey: QUOTA_NAMESPACE, namespace: QUOTA_NAMESPACE });
  }

  /**
   * 查询当前订阅的额度余量。
   * 预期内的失败（没有订阅 Key、地址不对）不抛异常，而是回一个分类，组件据此决定隐藏还是提示。
   * @returns {Promise<object>} 成功时是 { ok: true, ... }，失败时是 { ok: false, code, message }。
   */
  async quota() {
    try {
      const snapshot = await this.runtime.quota();
      return {
        ok: true,
        host: typeof snapshot?.host === 'string' ? snapshot.host : undefined,
        interval5h: pickWindow(snapshot?.interval5h),
        weekly: pickWindow(snapshot?.weekly),
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = typeof error?.message === 'string' && error.message ? error.message : 'MiniMax 额度查询失败';
      return { ok: false, code: classifyQuotaError(error), message };
    }
  }
}

// 源码模式标记：声明这个原型有一个可直接调用的方法。
Object.defineProperty(MinimaxQuotaService.prototype, REMOTE_METHODS, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'quota', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
});
