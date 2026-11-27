import "server-only";
import { NextResponse } from "next/server";

/**
 * Client IP. Behind nginx we trust the first X-Forwarded-For hop (nginx sets it);
 * set TRUST_PROXY=false when the app is exposed directly so the header can't be spoofed.
 */
export function clientIp(req: Request): string {
  if ((process.env.TRUST_PROXY ?? "true").trim() !== "false") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim().slice(0, 64);
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "local";
}

/** CSRF guard for state-changing requests: Origin (or Referer) must match Host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return !!host && o.host === host;
  } catch {
    return false;
  }
}

export const jsonError = (error: string, status: number, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

/** Parse a small JSON body safely (rejects bodies over `max` bytes). */
export async function readJson<T>(req: Request, max = 4096): Promise<T | null> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > max) return null;
  try {
    const text = await req.text();
    if (text.length > max) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
