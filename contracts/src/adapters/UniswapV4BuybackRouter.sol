// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuybackRouter} from "../interfaces/IBuybackRouter.sol";

/// @notice Minimal Uniswap v4 PoolManager surface (Currency = address, BalanceDelta = int256).
interface IPoolManagerV4 {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified; // negative = exact input
        uint160 sqrtPriceLimitX96;
    }

    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256);
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @title UniswapV4BuybackRouter
/// @notice IBuybackRouter for $MAKO's Montra pool: a Uniswap v4 pool of native HYPE (currency0)
///         and MAKO (currency1). It swaps exact-input HYPE for MAKO through PoolManager.unlock and
///         delivers the MAKO straight to `to` (MakoDesk passes 0x...dEaD).
/// @dev Stateless and permissionless: it holds nothing between calls. `quote` simulates the same
///      swap and reverts with the result (call it with eth_call).
contract UniswapV4BuybackRouter is IBuybackRouter {
    uint160 internal constant MIN_SQRT_PRICE_PLUS_ONE = 4295128740; // TickMath.MIN_SQRT_PRICE + 1

    IPoolManagerV4 public immutable manager;
    address public immutable token; // currency1
    uint24 public immutable fee;
    int24 public immutable tickSpacing;
    address public immutable hooks;

    error OnlyManager();
    error WrongToken();
    error Expired();
    error Slippage(uint256 out, uint256 minOut);
    error QuoteResult(uint256 out);
    error RefundFailed();

    constructor(IPoolManagerV4 manager_, address token_, uint24 fee_, int24 tickSpacing_, address hooks_) {
        manager = manager_;
        token = token_;
        fee = fee_;
        tickSpacing = tickSpacing_;
        hooks = hooks_;
    }

    function poolKey() public view returns (IPoolManagerV4.PoolKey memory) {
        return IPoolManagerV4.PoolKey(address(0), token, fee, tickSpacing, hooks);
    }

    /// @inheritdoc IBuybackRouter
    function buy(address tok, address to, uint256 minOut, uint256 deadline) external payable {
        if (tok != token) revert WrongToken();
        if (block.timestamp > deadline) revert Expired();
        uint256 out = abi.decode(manager.unlock(abi.encode(false, msg.sender, to, msg.value)), (uint256));
        if (out < minOut) revert Slippage(out, minOut);
    }

    /// @inheritdoc IBuybackRouter
    function quote(address tok, uint256 amountIn) external returns (uint256) {
        if (tok != token) revert WrongToken();
        try manager.unlock(abi.encode(true, address(0), address(0), amountIn)) {
            revert(); // unreachable: the quote path always reverts
        } catch (bytes memory err) {
            if (err.length == 36 && bytes4(err) == QuoteResult.selector) {
                uint256 out;
                assembly {
                    out := mload(add(err, 36))
                }
                return out;
            }
            assembly {
                revert(add(err, 32), mload(err))
            }
        }
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert OnlyManager();
        (bool isQuote, address payer, address to, uint256 amountIn) =
            abi.decode(data, (bool, address, address, uint256));

        int256 delta = manager.swap(
            poolKey(),
            IPoolManagerV4.SwapParams({
                zeroForOne: true, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: MIN_SQRT_PRICE_PLUS_ONE
            }),
            ""
        );
        int128 d0 = int128(delta >> 128); // HYPE owed to the pool (negative)
        int128 d1 = int128(delta); // MAKO owed to us (positive)
        uint256 out = d1 > 0 ? uint256(uint128(d1)) : 0;
        if (isQuote) revert QuoteResult(out);

        uint256 pay = d0 < 0 ? uint256(uint128(-d0)) : 0;
        manager.settle{value: pay}();
        if (out != 0) manager.take(token, to, out);
        // exact input normally consumes everything; return any remainder to the payer
        if (amountIn > pay) {
            (bool ok,) = payer.call{value: amountIn - pay}("");
            if (!ok) revert RefundFailed();
        }
        return abi.encode(out);
    }
}
