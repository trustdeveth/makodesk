// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMakoDesk
/// @notice Public interface of the Mako Desk treasury market maker (as documented at makodesk.xyz/docs).
interface IMakoDesk {
    enum Mood {
        Feeding,
        Hunting,
        Cruising,
        Circling,
        Breach
    }

    struct DeskState {
        Mood mood;
        int256 fundingE8; // 1h funding, 1e8 = 1%
        uint256 midPriceE8; // HYPE-PERP mid, USD 1e8
        int256 positionE8; // signed HYPE position size, 1e8
        int256 realizedPnlUsdE6;
        uint256 totalBurned; // MAKO, 18 decimals
        bool paused;
        uint64 coreBlock; // HyperCore block of last read
    }

    function mood() external view returns (Mood);
    function state() external view returns (DeskState memory);
    function poke() external; // permissionless; tips caller in HYPE

    event Quoted(uint64 indexed coreBlock, uint256 bidE8, uint256 askE8, uint256 sizeE8);
    event Filled(uint64 indexed coreBlock, bool isBuy, uint256 pxE8, uint256 szE8, int256 edgeUsdE6);
    event MoodChanged(Mood from, Mood to, int256 fundingE8);
    event Burned(uint256 amount, bytes32 reason, uint256 indexed epoch);
    event KillSwitch(address indexed caller, bytes32 reason);
}
