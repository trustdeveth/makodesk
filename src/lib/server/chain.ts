import "server-only";
import { getConfig } from "../config";

/**
 * Minimal JSON-RPC reader for Elysium (no SDK dependency).
 * Used for token supply / burned endpoints once the token is deployed.
 */

const DEAD = "0x000000000000000000000000000000000000dEaD";
const cache = new Map<string, { v: unknown; exp: number }>();

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const { chain } = getConfig();
  const res = await fetch(chain.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

const toUnits = (hex: string, decimals = 18) => {
  const v = BigInt(hex || "0x0");
  const base = 10n ** BigInt(decimals);
  return Number(v / base) + Number(v % base) / Number(base);
};

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v as T;
  const v = await fn();
  cache.set(key, { v, exp: Date.now() + ttlMs });
  return v;
}

/** totalSupply() and balanceOf(0x…dEaD) for the $MAKO token. */
export async function readTokenSupply(): Promise<{ total: number; burned: number; circulating: number } | null> {
  const { contracts } = getConfig();
  if (!contracts.token) return null;
  return cached("supply", 30_000, async () => {
    const total = toUnits(await rpc<string>("eth_call", [{ to: contracts.token, data: "0x18160ddd" }, "latest"]));
    const data = "0x70a08231" + DEAD.slice(2).toLowerCase().padStart(64, "0");
    const burned = toUnits(await rpc<string>("eth_call", [{ to: contracts.token, data }, "latest"]));
    return { total, burned, circulating: total - burned };
  });
}

export async function readBlockNumber(): Promise<number | null> {
  try {
    return parseInt(await rpc<string>("eth_blockNumber", []), 16);
  } catch {
    return null;
  }
}
