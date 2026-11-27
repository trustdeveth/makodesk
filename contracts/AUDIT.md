# MakoDesk audit package

This document is written for the external auditors who review MakoDesk before it holds capital. It is not an audit report. No external audit has been done yet. The docs commit to one, with the report linked publicly, before the desk is funded.

## Scope

| File | nSLOC (approx.) | Notes |
|---|---|---|
| `src/MakoDesk.sol` | ~330 | Desk: sense, quote, fills, risk, settle, buyback & burn, governance |
| `src/libraries/MoodEngine.sol` | ~40 | Mood from funding, plus spread and burn-multiplier tables |
| `src/libraries/WickDetector.sol` | ~40 | Ring buffer of recent (core block, mid) samples |
| `src/MakoToken.sol` | ~10 | Fixed-supply OpenZeppelin ERC-20 with no owner |
| `src/adapters/ElysiumAdapters.sol` | stub | **Must be implemented and re-audited.** See "Open items" |
| `src/interfaces/*` | — | `IMakoDesk` (public), `IHyperCoreData`, `ICoreOrderRouter`, `ISwapRouterV2` |

Out of scope: OpenZeppelin v5.1.0 (`TimelockController`, `Ownable2Step`, `ReentrancyGuard`, `SafeCast`, `ERC20`), the off-chain keeper (`../keeper`), and the web app.

Toolchain: Solidity 0.8.28, `via_ir`, optimizer 2,000 runs, EVM `cancun`, Foundry.

```bash
forge build && forge test            # 38 unit/fuzz tests + 5 stateful invariants (43 total)
forge test --mt invariant -vv        # invariants only (128 runs x 64 depth)
```

## System overview

Elysium is an Arbitrum Orbit L2 on Hyperliquid. MakoDesk market-makes HYPE-PERP on HyperCore through two Elysium features. Both arrive in an ArbOS upgrade, and their ABIs were unpublished at the time of writing:

- **Market-data precompile** (`IHyperCoreData`): sequencer-attested HyperCore state (book, prices, funding, account value, positions). Each response is stamped with the HyperCore block.
- **ElysiumCoreWriter** (`ICoreOrderRouter`): the contract emits order intents, and a keeper signs them as the desk's **trade-only** agent. Outcomes return through an opt-in callback (`onFill`). **Elysium and HyperCore are not atomic.**

Each `poke()` runs one cycle:

1. **Sense**: snapshot and freshness check, then the wick detector, then the mood.
2. **Risk**: daily-loss and drawdown checks against HyperCore account value.
3. **Quote**: cancel the previous cloids, then place post-only bid and ask sized under the position cap.

`settle()` closes an epoch and grants a USD burn budget from profit. `buybackAndBurn()` spends HYPE that has been earmarked for burns, within that budget.

## Roles and trust

| Role | Who | Can | Cannot |
|---|---|---|---|
| owner | `TimelockController` (48h, multisig proposer/executor, no admin) | params, adapters, swap router, core account, roles, `resume()`, `withdrawHype()` | act without a 48h public delay |
| guardian | multisig | `kill()` at any time, `noteDeposit()` (tightens risk) | move funds, resume, change params |
| keeper | bot EOA | `depositForBurn()`, `buybackAndBurn()` within budget, `noteProfitWithdrawal()` up to the settled amount | exceed the budget, burn treasury MAKO, move funds |
| router | `ElysiumCoreWriterAdapter` | `onFill()` (accounting only) | anything else |
| anyone | — | `poke()`, `settle()`, `kill()` when `provableBreach()` is true | — |

Trusted inputs: the precompile adapter (prices, equity, position) and the CoreWriter adapter (fill reports). Elysium's own docs say the precompile is **attested by the sequencer, not proven by HyperCore**. A malicious or buggy feed can make the desk quote badly. It is still bounded by the caps below, because orders are post-only and sized under the cap.

## Invariants

The tests that check each invariant are named in brackets.

1. The burn budget never exceeds cumulative settled positive profit. A wick-bonus multiplier of 2.0x is capped at 100% of the profit. [`invariant_BudgetNeverExceedsProfit`, `test_WickBonusDoublesButNeverExceedsProfit`]
2. Settled profit is `min(realized fill PnL net of fees, equity change)`. Funding or unrealized losses are never burned. [`test_SettleUsesLowerOfRealizedAndEquity`, `test_LosingEpochBurnsNothing`]
3. A quote never offers more than the room left under `maxPositionSzE8`, using the HyperCore position. [`testFuzz_QuotesNeverBreachPositionCap`, `invariant_QuotesRespectCap`]
4. A killed or paused desk has no resting quotes. [`invariant_NoQuotesWhenHalted`]
5. Stale or crossed data makes the desk cancel and send no orders, and that cycle is not tipped. [`test_StaleDataCancelsAndWaits`, `test_CrossedBookIsTreatedAsStale`]
6. `tipPool + burnHype <= address(this).balance`. Tips are never paid from burn funds. [`invariant_HypeAccountingBacked`, `test_TipsNeverSpendBurnFunds`]
7. `totalBurned` equals the MAKO actually received at `0x…dEaD`. [`invariant_TotalBurnedMatchesDeadBalance`]
8. Fill reports are idempotent per `fillId`, and only the router can report. [`test_FillAccountingRoundTrip`, `test_OnlyRouterCanReportFills`]
9. Governance changes need the 48h timelock. [`test_GovernanceThroughFortyEightHourTimelock`]

## Threat model and how each threat is handled

| Threat | Mitigation |
|---|---|
| Keeper key leak | The keeper can only spend earmarked HYPE inside the settled USD budget, with a caller-set `minOut` and a deadline. Worst case is a sandwiched buyback of at most one budget. Rotate the key with `setRoles` (timelocked). Consider sending buybacks through a private tx path. |
| Agent key leak (HyperCore) | The agent is trade-only, enforced by HyperCore, and cannot withdraw. Losses are bounded by the caps, and the guardian can kill. |
| Bad or stale precompile data | Block-lag guard (`maxStaleBlocks`), crossed-book check, cancel-on-stale, public `kill()` while quotes are live on stale data. |
| Missed or late fill callbacks | Risk uses the **precompile position and equity**, not callback accounting. Callbacks only feed PnL attribution. |
| Profit withdrawal mistaken for loss | `noteProfitWithdrawal` lowers the baselines, bounded by `withdrawableProfitE6`. |
| Deposit noting used to hide losses | `noteDeposit` can only raise the baselines, which tightens risk. Lowering them is bounded as above. |
| Griefing `poke()` | Once per block, tip at most once per interval, no tip on stale cycles. |
| Reentrancy via tip or router | `nonReentrant` on all state-changing entry points. The tip call is limited to 30k gas and is last in the cycle. `onFill` is router-only. |
| Swap router swap (rug) | Changing the router requires the timelock, which is publicly visible 48h ahead. |

## Known limitations and design decisions

- **Buyback pricing uses the HYPE-PERP mid** from the precompile to value HYPE spent. Perp and spot can diverge slightly, and budget accounting tolerates that.
- **Profit has to leave HyperCore by hand.** The treasury multisig withdraws the settled amount, bridges it to Elysium as HYPE, and the keeper calls `depositForBurn`. The trade-only agent cannot withdraw by design.
- **The 200M MAKO treasury inventory** is held by the contract, and nothing can move or burn it in this version. A MAKO/HYPE quoting leg is planned for the multi-market desk (Phase 4).
- **`setAdapters` forgets active cloids.** Before switching routers, governance should `kill()` first so the old router cancels the quotes.
- **Funding thresholds are in hourly terms (per the docs).** HYPE's typical hourly funding (~0.001%) almost always maps to Cruising or Hunting. Recalibrating them is a governance decision.
- Price and size rounding to HyperCore tick and lot rules is the adapter's job.

## Open items before mainnet

1. Implement `ElysiumMarketDataAdapter` and `ElysiumCoreWriterAdapter` against the published ABI, and add fork tests against an Elysium RPC.
2. Pin the CoreWriter callback model: escrow funding, dedupe key, failure outcomes such as rejected or ALO-cancelled orders.
3. External audit of everything in scope plus the adapters, with the report published in the docs.
4. Deploy with `script/Deploy.s.sol`. It refuses to deploy unless the adapters respond.
5. Start with small caps (`quoteSzE8` 25 HYPE) and raise them only through the timelock after a public track record.
