// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MakoToken ($MAKO)
/// @notice Fixed-supply ERC-20: 1,000,000,000 minted once at deploy, no owner, no mint,
///         no tax, no blacklist. Supply can only go down (transfers to 0x...dEaD).
contract MakoToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor(address recipient) ERC20("Mako", "MAKO") {
        _mint(recipient, TOTAL_SUPPLY);
    }
}
