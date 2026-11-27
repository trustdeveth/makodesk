// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMakoDesk} from "../interfaces/IMakoDesk.sol";

/// @title MoodEngine
/// @notice Funding-driven mood, as documented (makodesk.xyz/docs#mood):
///
///   Mood       1h funding           spread    burn multiplier
///   Feeding    < -0.40%             1.5 bps   1.5x
///   Hunting    -0.40% .. 0          2 bps     1.2x
///   Cruising   0 .. 0.60%           3 bps     1.0x
///   Circling   0.60% .. 1.20%       6 bps     0.8x
///   Breach     > 1.20% or wick      12 bps    2.0x
///
/// Funding is E8 where 1e8 = 1%.
library MoodEngine {
    int256 internal constant FEEDING_BELOW = -40_000_000; // -0.40%
    int256 internal constant HUNTING_BELOW = 0;
    int256 internal constant CRUISING_BELOW = 60_000_000; // 0.60%
    int256 internal constant CIRCLING_BELOW = 120_000_000; // 1.20%

    function fromFunding(int256 fundingE8) internal pure returns (IMakoDesk.Mood) {
        if (fundingE8 < FEEDING_BELOW) return IMakoDesk.Mood.Feeding;
        if (fundingE8 < HUNTING_BELOW) return IMakoDesk.Mood.Hunting;
        if (fundingE8 < CRUISING_BELOW) return IMakoDesk.Mood.Cruising;
        if (fundingE8 < CIRCLING_BELOW) return IMakoDesk.Mood.Circling;
        return IMakoDesk.Mood.Breach;
    }

    /// @notice Full quoted spread in tenths of a basis point (15 = 1.5 bps).
    function spreadBpsX10(IMakoDesk.Mood m) internal pure returns (uint256) {
        if (m == IMakoDesk.Mood.Feeding) return 15;
        if (m == IMakoDesk.Mood.Hunting) return 20;
        if (m == IMakoDesk.Mood.Cruising) return 30;
        if (m == IMakoDesk.Mood.Circling) return 60;
        return 120;
    }

    /// @notice Burn multiplier in bps (10_000 = 1.0x).
    function burnMultiplierBps(IMakoDesk.Mood m) internal pure returns (uint256) {
        if (m == IMakoDesk.Mood.Feeding) return 15_000;
        if (m == IMakoDesk.Mood.Hunting) return 12_000;
        if (m == IMakoDesk.Mood.Cruising) return 10_000;
        if (m == IMakoDesk.Mood.Circling) return 8_000;
        return 20_000;
    }
}
