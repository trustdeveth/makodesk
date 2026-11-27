// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title WickDetector
/// @notice Ring buffer of recent (HyperCore block, mid) samples. A wick is a drop from the
///         highest mid seen within the last `window` core blocks to the current mid.
/// @dev One storage slot per sample (uint64 block + uint192 price). Samples are recorded at
///      most once per core block, so the buffer covers SIZE distinct core blocks.
library WickDetector {
    uint256 internal constant SIZE = 32;

    struct Sample {
        uint64 coreBlock;
        uint192 midE8;
    }

    struct Buffer {
        Sample[SIZE] samples;
        uint8 head; // index of the most recent sample
        uint8 count;
    }

    function push(Buffer storage b, uint64 coreBlock, uint256 midE8) internal {
        if (b.count != 0) {
            Sample storage last = b.samples[b.head];
            if (coreBlock <= last.coreBlock) return; // same or older block: ignore
            b.head = uint8((uint256(b.head) + 1) % SIZE);
        }
        b.samples[b.head] = Sample(coreBlock, SafeCast.toUint192(midE8));
        if (b.count < SIZE) b.count++;
    }

    /// @notice Drop in bps from the window high to `curMid` (0 if no drop).
    function dropBps(Buffer storage b, uint64 curBlock, uint256 curMid, uint64 window) internal view returns (uint256) {
        uint256 hi = curMid;
        uint256 n = b.count;
        uint256 idx = b.head;
        for (uint256 i = 0; i < n; i++) {
            Sample memory s = b.samples[idx];
            if (curBlock > s.coreBlock && curBlock - s.coreBlock > window) break; // older samples are out of window
            if (s.midE8 > hi) hi = s.midE8;
            idx = idx == 0 ? SIZE - 1 : idx - 1;
        }
        if (hi <= curMid || hi == 0) return 0;
        return ((hi - curMid) * 10_000) / hi;
    }
}
