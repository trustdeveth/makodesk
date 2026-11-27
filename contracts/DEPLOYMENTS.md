# Deployments

## Elysium mainnet (chain 99901), 2026-11-27

| Contract | Address | Tx | Block |
|---|---|---|---|
| TimelockController (48h) | `0x8E02C8EdCd5b967b9C26D8C15F3662D2B4f5C17c` | `0x42dc7e0ebbfd4a9f349e6505bf8a456f7496f18a29dae2264a57e296883dae50` | 11,507,871 |
| MakoDesk | `0x7C9dE701443fBA8802a72305ee93d4dfff967B5d` | `0x630d2779ee52ceeffcd4fc95daf25ba49345bec689372960f513d3c4d8e2acb3` | 11,507,888 |

Both contracts are source-verified on the Elysium explorer (`https://elysium.kinetiq.xyz/explorer`).

### Configuration at deploy

- **Desk owner:** the TimelockController. Its minimum delay is 172,800 s (48h) and it has no admin.
- **Timelock proposer and executor:** `0x240ACF16b5401E2EDb543B798aCA6BC3041b948d`. This is a single EOA chosen by the project instead of a multisig, and the deploy script was run with `ALLOW_EOA_ADMIN=true`.
- **Guardian and keeper:** the same EOA. Change them with `setRoles` through the timelock.
- **State:** the desk is **halted** (`killed = true`). The token is unset, and the market-data, order-router and buyback adapters and the HyperCore account are all unset.
- **Params:** launch caps from `script/Deploy.s.sol`: max position 2,500 HYPE, 25 HYPE per side, $4,000 daily loss, 15% drawdown, 80% burn share.

### Remaining steps

Every step goes through the timelock: `schedule`, wait 48h, then `execute`.

1. After the Montra launch, call `setToken(<MAKO CA>)`. This works once only.
2. Once Kinetiq publishes the precompile and ElysiumCoreWriter ABI, deploy the wired adapters and the Uniswap v4 buyback adapter for the Montra pool. Then call `setAdapters(data, router, buyback, coreAccount)`.
3. After the external audit, fund the HyperCore account and the tip pool, then call `resume()`.

### Security note

The private key for `0x240A…948d` was shared in plain text during setup. Treat it as exposed. **Move control to a fresh key or a Safe before the desk holds any value.** To do that, schedule `grantRole(PROPOSER_ROLE/EXECUTOR_ROLE/CANCELLER_ROLE, newAdmin)` and `revokeRole(..., 0x240A…)` on the timelock, plus `setRoles(newGuardian, newKeeper)` on the desk.
