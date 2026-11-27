import { readTokenSupply } from "@/lib/server/chain";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Plain-number supply endpoints in the format CoinGecko / CoinMarketCap expect:
 *   GET /api/token/total        -> 1000000000
 *   GET /api/token/circulating  -> 981557097.12
 *   GET /api/token/burned       -> 18442902.88
 * Read from chain (totalSupply and balanceOf 0x…dEaD) once MAKO_TOKEN_ADDRESS is set.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ metric: string }> }) {
  const { metric } = await ctx.params;
  if (!["total", "circulating", "burned"].includes(metric)) {
    return new Response("unknown metric", { status: 404 });
  }
  const cfg = getConfig();
  if (!cfg.contracts.token) {
    return new Response(metric === "total" ? String(cfg.tokenomics.supply) : "token not deployed", {
      status: metric === "total" ? 200 : 503,
      headers: { "content-type": "text/plain" },
    });
  }
  try {
    const s = await readTokenSupply();
    if (!s) throw new Error("no token");
    const v = metric === "total" ? s.total : metric === "burned" ? s.burned : s.circulating;
    return new Response(String(v), { headers: { "content-type": "text/plain", "Cache-Control": "public, max-age=30" } });
  } catch (e) {
    return new Response("rpc error: " + (e as Error).message, { status: 502, headers: { "content-type": "text/plain" } });
  }
}
