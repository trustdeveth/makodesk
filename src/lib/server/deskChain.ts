import "server-only";
import { keccak_256 } from "@noble/hashes/sha3";
import { getConfig } from "../config";
import { rpc } from "./chain";
import type { Burn, Fill, MoodKey } from "../types";

/**
 * Live reader for the deployed MakoDesk contract (Phase 3 dashboard).
 * Polls state()/params() and the Filled/Burned/MoodChanged/KillSwitch logs over plain
 * JSON-RPC; also prices MAKO from the official V2-style LP pair when configured.
 * Active only when MAKO_DESK_ADDRESS is set; otherwise the preview engine keeps the desk.
 */

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const sig = (s: string) => "0x" + hex(keccak_256(new TextEncoder().encode(s)));
const sel = (s: string) => sig(s).slice(0, 10);

const SEL = {
  state: sel("state()"),
  params: sel("params()"),
  burnBudget: sel("burnBudgetE6()"),
  epoch: sel("epoch()"),
  killed: sel("killed()"),
  getReserves: "0x0902f1ac",
  token0: "0x0dfe1681",
  balanceOf: "0x70a08231",
};
const TOPIC = {
  filled: sig("Filled(uint64,bool,uint256,uint256,int256)"),
  burned: sig("Burned(uint256,bytes32,uint256)"),
  mood: sig("MoodChanged(uint8,uint8,int256)"),
  kill: sig("KillSwitch(address,bytes32)"),
};

const MOOD_KEYS: MoodKey[] = ["feeding", "hunting", "cruising", "circling", "breach"];

const words = (data: string) => {
  const d = data.startsWith("0x") ? data.slice(2) : data;
  const out: string[] = [];
  for (let i = 0; i + 64 <= d.length; i += 64) out.push(d.slice(i, i + 64));
  return out;
};
const u = (w: string) => BigInt("0x" + w);
const i256 = (w: string) => { const v = u(w); return v >= 1n << 255n ? v - (1n << 256n) : v; };
const num = (v: bigint, dec: number) => Number(v) / 10 ** dec;
const b32str = (w: string) => Buffer.from(w, "hex").toString("utf8").replace(/\0+$/, "");

interface ChainDeskState {
  mood: MoodKey; fundingE8: bigint; midE8: bigint; positionE8: bigint; realizedE6: bigint;
  totalBurned: bigint; paused: boolean; coreBlock: bigint; killed: boolean; burnBudgetE6: bigint; epoch: bigint;
}

class DeskChainReader {
  state: ChainDeskState | null = null;
  maxPositionSzE8 = 0n;
  skewBandBps = 4000;
  fills: Fill[] = [];
  burns: Burn[] = [];
  pnlHistory: number[] = [];
  makoPriceHype: number | null = null; // HYPE per MAKO from the LP
  lastOkAt = 0;
  error: string | null = null;
  private started = false;
  private nextBlock: bigint | null = null;
  private blockTimes = new Map<string, number>();
  private makoIsToken0: boolean | null = null;

  address() { return getConfig().contracts.desk; }
  enabled() { return !!this.address(); }
  ready() { return this.enabled() && !!this.state && Date.now() - this.lastOkAt < 30_000; }

  start() {
    if (this.started) return;
    this.started = true;
    const tick = async () => {
      try {
        if (this.enabled()) await this.poll();
        await this.pollPool();
        this.error = null;
      } catch (e) {
        this.error = (e as Error).message.slice(0, 200);
      }
    };
    void tick();
    const t = setInterval(tick, Number(process.env.DESK_POLL_MS) || 2_000);
    t.unref?.();
    const h = setInterval(() => {
      if (!this.state) return;
      this.pnlHistory.push(num(this.state.realizedE6, 6));
      if (this.pnlHistory.length > 120) this.pnlHistory.shift();
    }, 30_000);
    h.unref?.();
  }

  private async call(to: string, data: string) {
    return rpc<string>("eth_call", [{ to, data }, "latest"]);
  }

  private async poll() {
    const desk = this.address();
    const [st, killed, budget, epoch] = await Promise.all([
      this.call(desk, SEL.state), this.call(desk, SEL.killed), this.call(desk, SEL.burnBudget), this.call(desk, SEL.epoch),
    ]);
    const w = words(st);
    if (w.length < 8) throw new Error("unexpected state() return");
    this.state = {
      mood: MOOD_KEYS[Number(u(w[0]))] ?? "cruising",
      fundingE8: i256(w[1]), midE8: u(w[2]), positionE8: i256(w[3]), realizedE6: i256(w[4]),
      totalBurned: u(w[5]), paused: u(w[6]) !== 0n, coreBlock: u(w[7]),
      killed: u(words(killed)[0] ?? "0") !== 0n, burnBudgetE6: u(words(budget)[0] ?? "0"), epoch: u(words(epoch)[0] ?? "0"),
    };
    if (!this.maxPositionSzE8 || Math.random() < 0.05) {
      const p = words(await this.call(desk, SEL.params));
      if (p.length >= 5) { this.maxPositionSzE8 = u(p[0]); this.skewBandBps = Number(u(p[4])); }
    }
    await this.pollLogs(desk);
    this.lastOkAt = Date.now();
  }

  private async blockTime(n: string): Promise<number> {
    const hit = this.blockTimes.get(n);
    if (hit) return hit;
    const b = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [n, false]);
    const t = parseInt(b.timestamp, 16) * 1000;
    this.blockTimes.set(n, t);
    if (this.blockTimes.size > 2000) this.blockTimes.delete(this.blockTimes.keys().next().value!);
    return t;
  }

  private async pollLogs(desk: string) {
    const latest = BigInt(await rpc<string>("eth_blockNumber", []));
    if (this.nextBlock === null) {
      const from = process.env.DESK_DEPLOY_BLOCK ? BigInt(process.env.DESK_DEPLOY_BLOCK) : latest - 50_000n;
      this.nextBlock = from < 0n ? 0n : from;
    }
    const CHUNK = BigInt(Number(process.env.RPC_LOG_CHUNK) || 5_000);
    let guard = 0;
    let from: bigint = this.nextBlock;
    while (from <= latest && guard++ < 20) {
      const to: bigint = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
      type Log = { topics: string[]; data: string; blockNumber: string; transactionHash: string };
      const logs = await rpc<Log[]>("eth_getLogs", [{
        address: desk, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
        topics: [[TOPIC.filled, TOPIC.burned, TOPIC.mood, TOPIC.kill]],
      }]);
      for (const l of logs) {
        const t = await this.blockTime(l.blockNumber);
        const d = words(l.data);
        if (l.topics[0] === TOPIC.filled && d.length >= 4) {
          this.fills.unshift({ t, market: "HYPE-PERP", side: u(d[0]) ? "buy" : "sell", px: num(u(d[1]), 8), sz: num(u(d[2]), 8), edge: num(i256(d[3]), 6) });
        } else if (l.topics[0] === TOPIC.burned && d.length >= 2) {
          const reason = b32str(d[1]) === "Wick bonus" ? "Wick bonus" : "Desk profit";
          this.burns.unshift({ t, amount: num(u(d[0]), 18), reason, tx: l.transactionHash });
        }
      }
      if (this.fills.length > 20) this.fills.length = 20;
      if (this.burns.length > 25) this.burns.length = 25;
      from = to + 1n;
      this.nextBlock = from;
    }
  }

  /** MAKO price in HYPE: the Montra Uniswap v4 pool (native HYPE / MAKO) when configured, else a V2-style LP. */
  private async pollPool() {
    const { contracts } = getConfig();
    const poolId = process.env.MAKO_V4_POOL_ID?.trim();
    const manager = process.env.MAKO_V4_POOL_MANAGER?.trim();
    if (contracts.token && poolId && manager && /^0x[0-9a-fA-F]{64}$/.test(poolId)) {
      // StateLibrary: pools mapping at slot 6; slot0 = keccak256(poolId . 6); sqrtPriceX96 = low 160 bits
      const slot = "0x" + hex(keccak_256(Buffer.from(poolId.slice(2) + (6).toString(16).padStart(64, "0"), "hex")));
      const word = words(await rpc<string>("eth_call", [{ to: manager, data: "0x1e2eaeaf" + slot.slice(2) }, "latest"]))[0];
      const sqrtP = u(word) & ((1n << 160n) - 1n);
      if (sqrtP > 0n) {
        const makoPerHype = (Number(sqrtP) / 2 ** 96) ** 2; // currency1 (MAKO) per currency0 (HYPE), both 18 dp
        this.makoPriceHype = 1 / makoPerHype;
      }
      return;
    }
    if (!contracts.lp || !contracts.token) return;
    if (this.makoIsToken0 === null) {
      const t0 = words(await this.call(contracts.lp, SEL.token0))[0];
      this.makoIsToken0 = ("0x" + t0.slice(24)).toLowerCase() === contracts.token.toLowerCase();
    }
    const r = words(await this.call(contracts.lp, SEL.getReserves));
    const r0 = u(r[0]), r1 = u(r[1]);
    const [mako, hype] = this.makoIsToken0 ? [r0, r1] : [r1, r0];
    if (mako > 0n) this.makoPriceHype = Number(hype) / Number(mako);
  }

  status() {
    return { enabled: this.enabled(), ready: this.ready(), error: this.error, lastOkAgoMs: this.lastOkAt ? Date.now() - this.lastOkAt : null, poolPriced: this.makoPriceHype !== null };
  }
}

const g = globalThis as unknown as { __makoDeskChain?: DeskChainReader };
export const deskChain: DeskChainReader = g.__makoDeskChain ?? (g.__makoDeskChain = new DeskChainReader());
