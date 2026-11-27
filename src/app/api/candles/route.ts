import { NextResponse } from "next/server";
import { getCandles } from "@/lib/server/source";
import { isMarket, isTimeframe } from "@/lib/markets";
import { clientIp, jsonError } from "@/lib/server/http";
import { limiter } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/candles?market=HYPE-PERP&tf=5m&limit=300
 * OHLCV candles, oldest first; the last candle is the live (unclosed) one.
 */
export function GET(req: Request) {
  if (limiter("candles", 30, 2).take(clientIp(req))) return jsonError("Rate limited", 429);
  const q = new URL(req.url).searchParams;
  const market = q.get("market"), tf = q.get("tf") ?? "5m";
  if (!isMarket(market)) return jsonError("unknown market", 400);
  if (!isTimeframe(tf)) return jsonError("unknown timeframe", 400);
  const limit = Math.min(1000, Math.max(10, Number(q.get("limit")) || 300));
  return NextResponse.json({ market, tf, candles: getCandles(market, tf, limit) }, { headers: { "Cache-Control": "no-store" } });
}
