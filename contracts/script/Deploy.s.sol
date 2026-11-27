// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MakoDesk} from "../src/MakoDesk.sol";
import {IHyperCoreData} from "../src/interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter} from "../src/interfaces/ICoreOrderRouter.sol";
import {IBuybackRouter} from "../src/interfaces/IBuybackRouter.sol";

/// @notice Deploys the 48h TimelockController and MakoDesk (owned by the timelock, HALTED).
///
///   forge script script/Deploy.s.sol --rpc-url elysium --broadcast --private-key $DEPLOYER_PK
///
/// The deployer only pays gas: it gets no role in either contract.
/// Required env: MULTISIG (timelock proposer + executor), GUARDIAN, KEEPER
/// Optional env (zero until known, set later through the timelock):
///   MAKO_TOKEN_ADDRESS  Montra token CA      -> MakoDesk.setToken (one-time)
///   DATA_ADAPTER, ORDER_ROUTER, BUYBACK_ROUTER, CORE_ACCOUNT -> MakoDesk.setAdapters
/// After wiring, the timelock calls resume(); until then the desk cannot quote or burn.
contract Deploy is Script {
    function run() external returns (TimelockController timelock, MakoDesk desk) {
        address multisig = vm.envAddress("MULTISIG");
        address guardian = vm.envAddress("GUARDIAN");
        address keeper = vm.envAddress("KEEPER");
        // A Safe is recommended; an EOA admin must be opted into explicitly.
        require(multisig.code.length > 0 || vm.envOr("ALLOW_EOA_ADMIN", false), "MULTISIG is an EOA: set ALLOW_EOA_ADMIN=true to accept");

        address token = vm.envOr("MAKO_TOKEN_ADDRESS", address(0));
        address data = vm.envOr("DATA_ADAPTER", address(0));
        address router = vm.envOr("ORDER_ROUTER", address(0));
        address buyback = vm.envOr("BUYBACK_ROUTER", address(0));
        address core = vm.envOr("CORE_ACCOUNT", address(0));
        if (data != address(0)) IHyperCoreData(data).latestCoreBlock(); // a wired adapter must answer

        address[] memory roles = new address[](1);
        roles[0] = multisig;

        vm.startBroadcast();
        timelock = new TimelockController(48 hours, roles, roles, address(0));
        desk = new MakoDesk(
            address(timelock),
            IERC20(token),
            159, // HYPE perp index on HyperCore
            IHyperCoreData(data),
            ICoreOrderRouter(router),
            IBuybackRouter(buyback),
            core,
            guardian,
            keeper,
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
        console2.log("MakoDesk (halted)", address(desk));
    }
}
