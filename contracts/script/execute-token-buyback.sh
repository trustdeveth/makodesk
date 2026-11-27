#!/usr/bin/env sh
# Executes the timelock batch scheduled on 2026-11-27 (tx 0x2cfa446c…d17d, op 0xa9b847e7…a8ad):
#   MakoDesk.setToken(MAKO 0xBF74…72E8)  +  MakoDesk.setAdapters(0, 0, UniswapV4BuybackRouter 0x8a7c…3961, 0)
# Executable from 2026-11-29 10:25:24 UTC. Run with the timelock executor key:
#   EXECUTOR_PK=0x... sh script/execute-token-buyback.sh
set -e
R=${ELYSIUM_RPC_URL:-https://rpc.elysium.kinetiq.xyz}
TL=0x8E02C8EdCd5b967b9C26D8C15F3662D2B4f5C17c
D=0x7C9dE701443fBA8802a72305ee93d4dfff967B5d
C1=0x144fa6d7000000000000000000000000bf74a922615caf3f1e8c803851557d2d5f3172e8
C2=0x04b5e80f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008a7caaec0948cb99e8600e0ad929e348980d39610000000000000000000000000000000000000000000000000000000000000000
SALT=0x01e968768e3f6d310c63f3b61faceab4f403e1422038c689fa4a117c5e5edae3
ZERO=0x0000000000000000000000000000000000000000000000000000000000000000
cast send $TL "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)" "[$D,$D]" "[0,0]" "[$C1,$C2]" $ZERO $SALT \
  --private-key "$EXECUTOR_PK" --rpc-url "$R"
echo "mako: $(cast call $D 'mako()(address)' --rpc-url $R)  buyback: $(cast call $D 'swapRouter()(address)' --rpc-url $R)"
