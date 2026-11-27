// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MakoDesk} from "../src/MakoDesk.sol";
import {IHyperCoreData} from "../src/interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter} from "../src/interfaces/ICoreOrderRouter.sol";
import {ISwapRouterV2} from "../src/interfaces/ISwapRouterV2.sol";

/// @notice Deploys the 48h timelock and MakoDesk with the documented launch caps.
///
///   forge script script/Deploy.s.sol --rpc-url elysium --broadcast --verify
///
/// Required env: MULTISIG, MAKO_TOKEN_ADDRESS, DATA_ADAPTER, ORDER_ROUTER, SWAP_ROUTER,
///               CORE_ACCOUNT, GUARDIAN, KEEPER, HYPE_ASSET_INDEX
/// The adapters must be the wired Elysium adapters (see src/adapters/ElysiumAdapters.sol).
contract Deploy is Script {
    function run() external returns (TimelockController timelock, MakoDesk desk) {
        address multisig = vm.envAddress("MULTISIG");
        address data = vm.envAddress("DATA_ADAPTER");
        address router = vm.envAddress("ORDER_ROUTER");
        require(data.code.length > 0 && router.code.length > 0, "adapters not deployed");
        // a wired adapter must answer; the placeholder reverts with NotWired()
        IHyperCoreData(data).latestCoreBlock();

        address[] memory roles = new address[](1);
        roles[0] = multisig;

        vm.startBroadcast();
        timelock = new TimelockController(48 hours, roles, roles, address(0));
        desk = new MakoDesk(
            address(timelock),
            IERC20(vm.envAddress("MAKO_TOKEN_ADDRESS")),
            uint32(vm.envUint("HYPE_ASSET_INDEX")),
            IHyperCoreData(data),
            ICoreOrderRouter(router),
            ISwapRouterV2(vm.envAddress("SWAP_ROUTER")),
            vm.envAddress("CORE_ACCOUNT"),
            vm.envAddress("GUARDIAN"),
            vm.envAddress("KEEPER"),
            MakoDesk.Params({
                maxPositionSzE8: 2_500e8, // 2,500 HYPE
                quoteSzE8: 25e8, // start small: 25 HYPE per side
                maxDailyLossE6: 4_000e6, // $4,000
                maxDrawdownBps: 1_500, // 15%
                skewBandBps: 4_000, // +-40%
                burnShareBps: 8_000, // 80% of profit
                wickDropBps: 150, // 1.5% drop...
                maxStaleBlocks: 11, // ~750 ms of HyperCore blocks (~70 ms each)
                wickWindowBlocks: 43, // ...within ~3 s
                breachHoldBlocks: 4_300, // ~5 min of Breach after a wick
                wickLiqE6: 1_000_000e6, // with >= $1M liquidated
                epochLength: 1 days,
                minTipInterval: 2,
                pokeTip: 0.0002 ether
            })
        );
        vm.stopBroadcast();

        console2.log("TimelockController", address(timelock));
        console2.log("MakoDesk", address(desk));
        console2.log("Next: seed the tip pool, bind the HyperCore account + trade-only agent, set MAKO_DESK_ADDRESS.");
    }
}
