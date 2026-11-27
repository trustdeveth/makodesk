// Mako Desk keeper: the public fallback that keeps MakoDesk's loop running.
//   - poke()           every POKE_MS (anyone may poke; the desk tips at most once per interval)
//   - settle()         whenever the epoch has elapsed
//   - buybackAndBurn() spends earmarked HYPE within the settled USD budget (KEEPER role only)
// Not automated on purpose: moving settled profit off HyperCore and bridging it to Elysium.
// That is done by the treasury multisig, then funded here with depositForBurn().
//
// Env: ELYSIUM_RPC_URL, ELYSIUM_CHAIN_ID, MAKO_DESK_ADDRESS, KEEPER_PRIVATE_KEY,
//      [POKE_MS=1000] [BUYBACK_SLIPPAGE_BPS=150] [BUYBACK_MAX_HYPE=25] [DRY_RUN=false]

import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = (k, d) => {
  const v = process.env[k]?.trim();
  if (v) return v;
  if (d === undefined) throw new Error(`missing env ${k}`);
  return d;
};

const chain = defineChain({
  id: Number(env("ELYSIUM_CHAIN_ID", "99901")),
  name: "Elysium",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: [env("ELYSIUM_RPC_URL")] } },
});
const DESK = env("MAKO_DESK_ADDRESS");
const POKE_MS = Number(env("POKE_MS", "1000"));
const SLIPPAGE_BPS = BigInt(env("BUYBACK_SLIPPAGE_BPS", "150"));
const MAX_HYPE = BigInt(Math.round(Number(env("BUYBACK_MAX_HYPE", "25")) * 1e6)) * 10n ** 12n;
const DRY = env("DRY_RUN", "false") === "true";

const deskAbi = parseAbi([
  "function poke()",
  "function settle()",
  "function buybackAndBurn(uint256 hypeIn, uint256 minMakoOut, uint256 deadline) returns (uint256)",
  "function killed() view returns (bool)",
  "function paused() view returns (bool)",
  "function epochStart() view returns (uint64)",
  "function params() view returns (uint256,uint256,uint256,uint16,uint16,uint16,uint16,uint64,uint64,uint64,uint256,uint32,uint32,uint96)",
  "function burnHype() view returns (uint256)",
  "function burnBudgetE6() view returns (uint256)",
  "function lastMidE8() view returns (uint256)",
  "function swapRouter() view returns (address)",
  "function mako() view returns (address)",
  "function keeper() view returns (address)",
  "error AlreadyPoked()",
  "error NotRouter()",
  "error NotKeeper()",
  "error NotAllowed()",
  "error EpochNotOver()",
  "error Stale()",
  "error OverBudget()",
  "error BadParams()",
  "error Killed()",
  "error InsufficientOutput()",
]);
const routerAbi = parseAbi([
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
]);

const account = privateKeyToAccount(env("KEEPER_PRIVATE_KEY"));
const transport = http(undefined, { timeout: 8_000, retryCount: 2 });
const pub = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, transport, account });

const log = (...a) => console.log(new Date().toISOString(), ...a);
const read = (functionName, args = []) => pub.readContract({ address: DESK, abi: deskAbi, functionName, args });
let busy = false;

async function send(functionName, args = []) {
  // simulate first: reverts (AlreadyPoked, EpochNotOver, OverBudget...) never cost gas
  const { request } = await pub.simulateContract({ address: DESK, abi: deskAbi, functionName, args, account });
  if (DRY) return log("[dry-run]", functionName, args.map(String).join(","));
  const hash = await wallet.writeContract(request);
  const rcpt = await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
  log(functionName, rcpt.status, hash);
  return rcpt;
}

async function maybePoke() {
  if (await read("killed")) return;
  try {
    await send("poke");
  } catch (e) {
    const msg = e.shortMessage || e.message;
    if (!/AlreadyPoked/.test(msg)) log("poke failed:", msg);
  }
}

async function maybeSettle() {
  const [start, p] = await Promise.all([read("epochStart"), read("params")]);
  const epochLength = BigInt(p[11]);
  // compare against chain time (what the contract enforces), not this machine's clock
  const { timestamp } = await pub.getBlock({ blockTag: "latest" });
  if (timestamp < BigInt(start) + epochLength) return;
  try { await send("settle"); } catch (e) { log("settle failed:", e.shortMessage || e.message); }
}

async function maybeBuyback() {
  const [hype, budgetE6, midE8, routerAddr, mako] = await Promise.all([
    read("burnHype"), read("burnBudgetE6"), read("lastMidE8"), read("swapRouter"), read("mako"),
  ]);
  if (hype === 0n || budgetE6 === 0n || midE8 === 0n) return;
  // HYPE affordable within the USD budget (with 1% headroom for mid drift between read and tx)
  const byBudget = (budgetE6 * 10n ** 20n * 99n) / (midE8 * 100n);
  let spend = hype < byBudget ? hype : byBudget;
  if (spend > MAX_HYPE) spend = MAX_HYPE;
  if (spend < 10n ** 15n) return; // dust
  const weth = await pub.readContract({ address: routerAddr, abi: routerAbi, functionName: "WETH" });
  const amounts = await pub.readContract({ address: routerAddr, abi: routerAbi, functionName: "getAmountsOut", args: [spend, [weth, mako]] });
  const minOut = (amounts[1] * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const deadline = (await pub.getBlock({ blockTag: "latest" })).timestamp + 120n;
  log(`buyback ${formatEther(spend)} HYPE, min ${formatEther(minOut)} MAKO`);
  try { await send("buybackAndBurn", [spend, minOut, deadline]); } catch (e) { log("buyback failed:", e.shortMessage || e.message); }
}

async function loop() {
  if (busy) return;
  busy = true;
  try { await maybePoke(); } catch (e) { log("loop error:", e.shortMessage || e.message); } finally { busy = false; }
}

async function slowLoop() {
  try {
    await maybeSettle();
    const isKeeper = (await read("keeper")).toLowerCase() === account.address.toLowerCase();
    if (isKeeper) await maybeBuyback();
  } catch (e) {
    log("slow loop error:", e.shortMessage || e.message);
  }
}

log(`keeper ${account.address} on chain ${chain.id}, desk ${DESK}${DRY ? " (dry run)" : ""}`);
log("HYPE balance", formatEther(await pub.getBalance({ address: account.address })));
setInterval(loop, POKE_MS);
setInterval(slowLoop, 60_000);
void slowLoop();
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { log("stopping"); process.exit(0); });
