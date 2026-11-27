import "server-only";

/**
 * In-memory token-bucket rate limiter (single-process deploy, matches the engine).
 * `take(key)` returns 0 when allowed, otherwise the ms to wait.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private capacity: number, private refillPerSec: number) {
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) if (now - b.at > 10 * 60_000) this.buckets.delete(k);
    }, 60_000);
    sweep.unref?.();
  }
  take(key: string, cost = 1): number {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      this.buckets.set(key, b);
      return 0;
    }
    this.buckets.set(key, b);
    return Math.ceil(((cost - b.tokens) / this.refillPerSec) * 1000);
  }
}

const g = globalThis as unknown as { __makoLimiters?: Record<string, RateLimiter> };
const store = (g.__makoLimiters ??= {});
/** Named shared limiter (survives dev hot reload). */
export function limiter(name: string, capacity: number, refillPerSec: number): RateLimiter {
  return (store[name] ??= new RateLimiter(capacity, refillPerSec));
}

/** Concurrent-connection counter per key (SSE streams). */
const conns = ((globalThis as unknown as { __makoConns?: Map<string, number> }).__makoConns ??= new Map<string, number>());
export function acquireConn(key: string, max: number): (() => void) | null {
  const n = conns.get(key) ?? 0;
  if (n >= max) return null;
  conns.set(key, n + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const m = (conns.get(key) ?? 1) - 1;
    if (m <= 0) conns.delete(key); else conns.set(key, m);
  };
}
export const totalConns = () => [...conns.values()].reduce((a, b) => a + b, 0);
