import { apply as applyPiAi, Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai';

/**
 * Build the scope the official adapter is applied to.
 *
 * The official adapter keeps the context it was applied to and calls back into
 * it while a request is running, not only while it registers. Every member it
 * captures must therefore exist on this scope: a missing one stays invisible
 * until the first request, where it surfaces as a failure far away from its
 * cause.
 *
 * Only registration is isolated here. Everything else is answered by the real
 * context, so the route keeps the host's own seams — the request-header
 * waterfall, the credential store, attachments — instead of a private copy
 * that drifts from the host's behavior.
 *
 * @param {object} ctx - the host context this plugin runs in.
 * @param {(adapter: object) => void} onAdapter - receives the adapter the official plugin registers.
 * @returns {object} the scope handed to the official `apply`.
 */
export function createAdapterScope(ctx, onAdapter) {
  const overrides = {
    fiber: ctx.fiber,
    logger: ctx.logger,
    get: ctx.get.bind(ctx),
    inject() {},
    on() { return () => {}; },
    // The request-header seam: the official adapter composes every provider
    // route's headers through it. A scope that cannot answer fails the request
    // with a header-preparation TypeError, so the host's seam is used when it
    // exists; a host without one answers with the headers it was handed.
    waterfall(name, ...args) {
      if (typeof ctx.waterfall === 'function') return ctx.waterfall(name, ...args);
      const next = args[args.length - 1];
      return typeof next === 'function' ? next() : undefined;
    },
    llm: {
      registerAdapter(_routes, value) { onAdapter(value); return Object.assign(() => {}, { replace() {} }); },
      registerConfigurableProviders() { return { replace() {} }; },
      registerModelDiscovery() { return () => {}; },
    },
  };
  // Anything the official adapter captures beyond the members above is taken
  // from the real context, so a later version that reaches for another seam
  // keeps working instead of failing on the first request.
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      try {
        const value = ctx[prop];
        return typeof value === 'function' ? value.bind(ctx) : value;
      } catch {
        // The host context raises for members it does not provide; an optional
        // capability the official adapter probes for is simply absent.
        return undefined;
      }
    },
  });
}

// Pin the peer version and exercise this factory in integration tests. The public
// adapter plugin builds its own protocol snapshot; only registration is captured.
// No global fetch, shared settings, sibling adapter or OAuth record is modified.
export function buildChatAdapter(ctx, profile) {
  let adapter;
  applyPiAi(createAdapterScope(ctx, value => { adapter = value; }), PiAiConfig({ providers: { 'minimax-byapi': profile } }));
  if (!adapter) throw new Error('官方适配器未能创建 MiniMax 路由；请检查 dsh 兼容版本');
  return adapter;
}
