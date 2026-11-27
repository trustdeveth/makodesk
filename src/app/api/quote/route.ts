import { NextResponse } from "next/server";
import { getDeskState } from "@/lib/server/source";

export const dynamic = "force-dynamic";

/**
 * GET /api/quote?side=buy|sell&amount=1.5&slippage=1
 * Estimated swap quote against the MAKO/HYPE pool.
 * Preview: constant-product estimate on an illustrative pool depth.
 * Live: replace `poolHype`/`poolMako` with on-chain reserves.
 */
export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const side = q.get("side") === "sell" ? "sell" : "buy";
  const amount = Number(q.get("amount"));
  const slippage = Math.min(50, Math.max(0.1, Number(q.get("slippage")) || 1));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const s = getDeskState();
  if (!s.live.token || !(s.makoPrice > 0)) {
    return NextResponse.json({ error: "trading opens at launch" }, { status: 503 });
  }
  const hypePerMako = s.makoPrice / s.mid;
  const poolHype = 110_000;                  // illustrative depth (preview)
  const poolMako = poolHype / hypePerMako;
  const fee = 0.003;

  const [rIn, rOut] = side === "buy" ? [poolHype, poolMako] : [poolMako, poolHype];
  const inAfterFee = amount * (1 - fee);
  const out = (inAfterFee * rOut) / (rIn + inAfterFee);
  const spot = side === "buy" ? amount / hypePerMako : amount * hypePerMako;
  const impact = Math.max(0, (1 - out / spot) * 100);

  return NextResponse.json(
    {
      mode: s.mode,
      side,
      amountIn: amount,
      tokenIn: side === "buy" ? "HYPE" : "MAKO",
      tokenOut: side === "buy" ? "MAKO" : "HYPE",
      amountOut: out,
      minOut: out * (1 - slippage / 100),
      priceImpactPct: +impact.toFixed(3),
      rate: 1 / hypePerMako,
      usdIn: side === "buy" ? amount * s.mid : amount * s.makoPrice,
      feePct: fee * 100,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
