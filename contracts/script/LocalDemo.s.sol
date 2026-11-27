// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MakoDesk} from "../src/MakoDesk.sol";
import {MakoToken} from "../src/MakoToken.sol";
import {IHyperCoreData} from "../src/interfaces/IHyperCoreData.sol";
import {ICoreOrderRouter} from "../src/interfaces/ICoreOrderRouter.sol";
import {IBuybackRouter} from "../src/interfaces/IBuybackRouter.sol";
import {MockCoreData, MockOrderRouter, MockSwapRouter} from "../test/mocks/Mocks.sol";

/// Local end-to-end rehearsal on anvil: token + desk wired to mock precompile/writer/router.
///   anvil &  forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
/// The deployer stands in for the timelock and guardian; anvil account #1 is the keeper.
contract LocalDemo is Script {
    function run() external {
        address keeper = vm.envOr("KEEPER", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8));
        vm.startBroadcast();
        address me = msg.sender;
        MakoToken mako = new MakoToken(me);
        MockCoreData data = new MockCoreData();
        MockOrderRouter router = new MockOrderRouter();
        MockSwapRouter swap = new MockSwapRouter(address(0xbA876237B0F021A6c6D852d6c26E107997cC5E81), mako, 9_000e18);
        mako.transfer(address(swap), 100_000_000 ether);
        data.set(1_000, 66_00000000, 125_000, 0); // HYPE $66, funding 0.00125%/h (E8: 1e8 = 1%)
        data.setEquity(100_000e6);
        MakoDesk desk = new MakoDesk(
            me,
            mako,
            159,
            IHyperCoreData(address(data)),
            ICoreOrderRouter(address(router)),
            IBuybackRouter(address(swap)),
            me,
            me,
            keeper,
            MakoDesk.Params({
                maxPositionSzE8: 2_500e8,
                quoteSzE8: 25e8,
                maxDailyLossE6: 4_000e6,
                maxDrawdownBps: 1_500,
                skewBandBps: 4_000,
                burnShareBps: 8_000,
                wickDropBps: 150,
                maxStaleBlocks: 1_000_000,
                wickWindowBlocks: 43,
                breachHoldBlocks: 4_300,
                wickLiqE6: 1_000_000e6,
                epochLength: 1 hours,
                minTipInterval: 2,
                pokeTip: 0.0002 ether
            })
        );
        desk.resume(); // deployer stands in for the timelock here
        (bool ok,) = address(desk).call{value: 1 ether}(""); // tip pool
        require(ok);
        // a round-trip fill so the dashboard has a realized PnL and a Filled event
        router.fill(address(desk), "demo-1", true, 65_90000000, 10e8, 300_000);
        router.fill(address(desk), "demo-2", false, 66_10000000, 10e8, 300_000);
        vm.stopBroadcast();
        console2.log("MAKO", address(mako));
        console2.log("DESK", address(desk));
        console2.log("DATA", address(data));
        console2.log("ROUTER", address(router));
    }
}
