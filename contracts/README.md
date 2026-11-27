# MakoDesk contracts

These are the Solidity contracts for the Mako Desk treasury market maker on Elysium, covering Phase 2 (Sense) and Phase 3 (Strike) of the roadmap. They're written for developers deploying or reviewing the desk, and for its auditors.

| Contract | Purpose |
|---|---|
| `MakoDesk` | Reads HYPE-PERP, computes the Mood, detects wicks, quotes post-only under caps, accounts fills, settles epochs, and runs buyback & burn |
| `MoodEngine` | Maps funding to a Mood, plus each mood's spread and burn multiplier, as published in the docs |
| `WickDetector` | Measures the drop from the recent high within N HyperCore blocks |
| `MakoToken` | $MAKO: 1B fixed supply, no owner |
| `adapters/ElysiumAdapters` | Connects the desk to Elysium's precompile and ElysiumCoreWriter. It reverts until Kinetiq publishes the ABI |

## Commands

```bash
forge install                 # forge-std + OpenZeppelin v5.1.0 (git submodules)
forge test                    # unit, fuzz and invariant tests
forge test --gas-report
```

## Local rehearsal

This runs the full loop on anvil, using mocks in place of Elysium's precompile and writer.

```bash
anvil --block-time 1
forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil test key #0
# keeper (anvil test key #1 is the demo keeper)
cd ../keeper && ELYSIUM_RPC_URL=http://127.0.0.1:8545 ELYSIUM_CHAIN_ID=31337 \
  MAKO_DESK_ADDRESS=<DESK> KEEPER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d node keeper.mjs
# web app reading the desk
cd .. && ELYSIUM_RPC_URL=http://127.0.0.1:8545 MAKO_DESK_ADDRESS=<DESK> DESK_DEPLOY_BLOCK=0 npm run dev
```

## Mainnet deployment

You can't deploy to mainnet until the Elysium ArbOS upgrade ships the precompile and ElysiumCoreWriter.

1. Implement both adapters in `src/adapters/ElysiumAdapters.sol` against the published ABI, add fork tests, and get the external audit (see [AUDIT.md](AUDIT.md)).
2. Deploy the adapters. Then run:
   ```bash
   MULTISIG=… MAKO_TOKEN_ADDRESS=… DATA_ADAPTER=… ORDER_ROUTER=… SWAP_ROUTER=… \
   CORE_ACCOUNT=… GUARDIAN=… KEEPER=… HYPE_ASSET_INDEX=159 \
   forge script script/Deploy.s.sol --rpc-url elysium --broadcast --verify
   ```
   This deploys a 48h `TimelockController` (multisig proposer and executor, no admin) and `MakoDesk`, owned by the timelock and set to the launch caps.
3. Bind the HyperCore account on ElysiumCoreWriter, approve the trade-only agent, and fund the callback escrow and the desk's tip pool (send HYPE to the desk).
4. Set `MAKO_DESK_ADDRESS` (and `DESK_DEPLOY_BLOCK`) in the web app's `.env`. The dashboard switches to the live desk automatically.
5. Run the public keeper from `../keeper`.

HYPE's perp index on HyperCore is **159**, confirmed through Hyperliquid's `metaAndAssetCtxs`.
