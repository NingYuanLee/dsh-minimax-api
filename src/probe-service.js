// 「模型」页 MiniMax 卡片里的「测试连接」服务端一半。
//
// 前端拿不到 API Key（只在 dsh 凭据库），所以探测留在宿主：用当前已保存的连接配置
// 请求一次 /v1/models，返回延迟、状态和模型数；密钥与其他响应内容都不出宿主。

/** 探测接口的命名空间，也是端点前缀（/api/minimaxProbe/test）。 */
export const PROBE_NAMESPACE = 'minimaxProbe';

/** 网关读取源码模式 Remote 标记时用的属性名。 */
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods';

/**
 * 把探测失败归类成前端能区分的几种情况。
 * @param {unknown} error 宿主捕获的异常。
 * @returns {string} key-missing | auth | timeout | network | unsupported | http | error。
 */
export function classifyProbeError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/未配置/.test(message)) return 'key-missing';
  if (/认证被拒绝|HTTP 401|HTTP 403/.test(message)) return 'auth';
  if (/超时/.test(message)) return 'timeout';
  if (/没有开放模型列表接口|HTTP 404|HTTP 405/.test(message)) return 'unsupported';
  if (/无法连接/.test(message)) return 'network';
  if (/HTTP /.test(message)) return 'http';
  return 'error';
}

/**
 * 宿主侧的「测试连接」服务：一次调用返回 ok、延迟、状态与模型数，或一个可读的错误。
 */
export class MinimaxProbeService {
  /**
   * @param {{ probe: () => Promise<object> }} runtime 插件运行时，提供 probe()。
   */
  constructor(runtime) {
    this.runtime = runtime;
    // 网关按这个绑定找命名空间：namespace 必须与前端请求的命名空间一致。
    this.typertRemote = Object.freeze({ service: this, serviceKey: PROBE_NAMESPACE, namespace: PROBE_NAMESPACE });
  }

  /**
   * 用已保存的连接与密钥请求一次模型列表。
   * @returns {Promise<object>} 成功时 { ok: true, host, status, models, latencyMs, at }；
   *   失败时 { ok: false, code, message, latencyMs, at }。
   */
  async test() {
    const started = Date.now();
    try {
      const snapshot = await this.runtime.probe();
      return {
        ok: true,
        host: typeof snapshot?.host === 'string' ? snapshot.host : undefined,
        status: Number.isFinite(snapshot?.status) ? snapshot.status : undefined,
        models: Number.isFinite(snapshot?.models) ? snapshot.models : undefined,
        latencyMs: Number.isFinite(snapshot?.latencyMs) ? snapshot.latencyMs : Date.now() - started,
        at: new Date().toISOString(),
      };
    } catch (error) {
      const message = typeof error?.message === 'string' && error.message ? error.message : 'MiniMax 连接测试失败';
      return { ok: false, code: classifyProbeError(error), message, latencyMs: Date.now() - started, at: new Date().toISOString() };
    }
  }
}

// 源码模式标记：声明这个原型有一个可直接调用的方法。
Object.defineProperty(MinimaxProbeService.prototype, REMOTE_METHODS, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'test', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
});
