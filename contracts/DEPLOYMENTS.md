# Deployments

## Elysium mainnet (chain 99901), 2026-11-27

| Contract | Address | Tx | Block |
|---|---|---|---|
| TimelockController (48h) | `0x8E02C8EdCd5b967b9C26D8C15F3662D2B4f5C17c` | `0x42dc7e0ebbfd4a9f349e6505bf8a456f7496f18a29dae2264a57e296883dae50` | 11,507,871 |
| MakoDesk | `0x7C9dE701443fBA8802a72305ee93d4dfff967B5d` | `0x630d2779ee52ceeffcd4fc95daf25ba49345bec689372960f513d3c4d8e2acb3` | 11,507,888 |

Both contracts are source-verified on the Elysium explorer (`https://elysium.kinetiq.xyz/explorer`).

### $MAKO token and buyback route (2026-11-27)

| Item | Value |
|---|---|
| $MAKO token (launched on Montra) | `0xBF74a922615CaF3F1E8C803851557d2d5F3172E8`: "MAKO DESK"/MAKO, 18 dp, 1,000,000,000 supply, EIP-1167 clone of `0x10b0…f55f`, no owner |
| Pool | Uniswap v4 PoolManager `0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1`, PoolId `0x51b24f3deb734d786f62827c59172e582d11b89fb806005071844583e64b3659` |
| PoolKey | currency0 native HYPE, currency1 MAKO, fee `0x800000` (dynamic), tickSpacing 200, hooks `0x6b1216A40B65c83e9c9e18a562C446697B8cf8EC` (Montra) |
| UniswapV4BuybackRouter | `0x8a7caAec0948Cb99e8600E0aD929E348980d3961` (tx `0x1e1d8e52416064b0dc7573fbced9f5f9e0d3ddafeb64771dad647229e987679d`), source-verified. Fork-tested against the live pool: 0.01 HYPE bought 155,649 MAKO and delivered it to `0x…dEaD`, matching the on-chain quote |

**Scheduled on the timelock** (tx `0x2cfa446c11341b945e1085803cc711fb6c3c76688b26bb7b09478a7ce5e7d17d`, operation `0xa9b847e78aeb5fdb1cc1a14ca742be3cb254b44570b685c495e22e871068a8ad`):

- `MakoDesk.setToken(0xBF74…72E8)`
- `MakoDesk.setAdapters(0, 0, 0x8a7c…3961, 0)`

It can be executed from **2026-11-29 10:25:24 UTC** with `EXECUTOR_PK=… sh script/execute-token-buyback.sh`.

### Configuration at deploy

- **Desk owner:** the TimelockController. Its minimum delay is 172,800 s (48h) and it has no admin.
- **Timelock proposer and executor:** `0x240ACF16b5401E2EDb543B798aCA6BC3041b948d`. This is a single EOA chosen by the project instead of a multisig, and the deploy script was run with `ALLOW_EOA_ADMIN=true`.
- **Guardian and keeper:** the same EOA. Change them with `setRoles` through the timelock.
- **State:** the desk is **halted** (`killed = true`). The token is unset, and the market-data, order-router and buyback adapters and the HyperCore account are all unset.
- **Params:** launch caps from `script/Deploy.s.sol`: max position 2,500 HYPE, 25 HYPE per side, $4,000 daily loss, 15% drawdown, 80% burn share.

### Remaining steps

Every step goes through the timelock: `schedule`, wait 48h, then `execute`.

1. ~~setToken~~ is scheduled (see above) and needs executing after the delay.
2. Once Kinetiq publishes the precompile and ElysiumCoreWriter ABI, deploy the wired market-data and order-router adapters. Then call `setAdapters(data, router, 0x8a7c…3961, coreAccount)`, keeping the buyback router that's already deployed.
3. After the external audit, fund the HyperCore account and the tip pool, then call `resume()`.

### Security note

The private key for `0x240A…948d` was shared in plain text during setup. Treat it as exposed. **Move control to a fresh key or a Safe before the desk holds any value.** To do that, schedule `grantRole(PROPOSER_ROLE/EXECUTOR_ROLE/CANCELLER_ROLE, newAdmin)` and `revokeRole(..., 0x240A…)` on the timelock, plus `setRoles(newGuardian, newKeeper)` on the desk.
