import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Wallet sessions (Sign-In with Ethereum style, no third-party service).
 * 1. GET  /api/auth/nonce   -> message containing a one-time nonce
 * 2. wallet personal_sign(message)
 * 3. POST /api/auth/verify  -> server recovers the signer, checks the nonce, sets an
 *    httpOnly HMAC-signed cookie. No database: the cookie is the session.
 */

export const SESSION_COOKIE = "mako_session";
export const GUEST_COOKIE = "mako_guest";
const SESSION_TTL = 7 * 24 * 3600; // seconds
const NONCE_TTL = 5 * 60_000;

const g = globalThis as unknown as { __makoSecret?: Buffer; __makoNonces?: Map<string, number> };

function secret(): Buffer {
  if (g.__makoSecret) return g.__makoSecret;
  const env = (process.env.SESSION_SECRET ?? "").trim();
  if (env.length >= 32) {
    g.__makoSecret = Buffer.from(env);
  } else {
    if (process.env.NODE_ENV === "production") {
      console.warn("[mako] SESSION_SECRET is missing or shorter than 32 chars; using a random per-process secret (sessions reset on restart).");
    }
    g.__makoSecret = randomBytes(32);
  }
  return g.__makoSecret;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** `<base64url(json)>.<hmac>` */
export function seal(data: Record<string, unknown>): string {
  const p = b64u(JSON.stringify(data));
  return `${p}.${sign(p)}`;
}

export function unseal<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [p, mac] = token.split(".");
  if (!p || !mac) return null;
  const want = Buffer.from(sign(p));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as T & { exp?: number };
    if (data.exp && data.exp * 1000 < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/* ---------- nonces ---------- */
const nonces = (g.__makoNonces ??= new Map<string, number>());

export function issueNonce(): string {
  const now = Date.now();
  if (nonces.size > 5000) for (const [k, exp] of nonces) if (exp < now) nonces.delete(k);
  const n = randomBytes(12).toString("hex");
  nonces.set(n, now + NONCE_TTL);
  return n;
}

function consumeNonce(n: string): boolean {
  const exp = nonces.get(n);
  nonces.delete(n);
  return !!exp && exp > Date.now();
}

export function loginMessage(domain: string, nonce: string): string {
  return [
    `${domain} wants you to sign in with your wallet.`,
    "",
    "Sign in to Mako Desk chat. This request does not trigger a transaction or cost gas.",
    "",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

/* ---------- signature recovery (EIP-191 personal_sign) ---------- */
const hexToBytes = (hex: string) => {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(h) || h.length % 2) throw new Error("bad hex");
  return Uint8Array.from(Buffer.from(h, "hex"));
};

export function toChecksum(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, "");
  const h = Buffer.from(keccak_256(new TextEncoder().encode(a))).toString("hex");
  return "0x" + [...a].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join("");
}

export function recoverPersonal(message: string, signature: string): string {
  const msg = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
  const digest = keccak_256(new Uint8Array([...prefix, ...msg]));
  const sig = hexToBytes(signature);
  if (sig.length !== 65) throw new Error("bad signature length");
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("bad recovery id");
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(digest).toRawBytes(false);
  const addr = Buffer.from(keccak_256(pub.slice(1))).subarray(-20).toString("hex");
  return toChecksum(addr);
}

/** Verify a signed login message. Returns the checksummed address or throws. */
export function verifyLogin(message: string, signature: string, expectedDomain: string): string {
  if (typeof message !== "string" || message.length > 600) throw new Error("bad message");
  const lines = message.split("\n");
  if (!lines[0]?.startsWith(`${expectedDomain} wants you to sign in`)) throw new Error("domain mismatch");
  const nonce = /^Nonce: ([0-9a-f]{24})$/m.exec(message)?.[1];
  if (!nonce || !consumeNonce(nonce)) throw new Error("nonce expired, try again");
  return recoverPersonal(message, signature);
}

/* ---------- session cookie ---------- */
export interface Session { addr: string; exp: number }
export interface Guest { id: string; name: string; exp: number }

export const sessionToken = (addr: string) => seal({ addr, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
export const guestToken = (id: string, name: string) => seal({ id, name, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 });

export function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && (process.env.SITE_URL ?? "").startsWith("https"),
    path: "/",
    maxAge,
  };
}
export const SESSION_MAX_AGE = SESSION_TTL;
export const GUEST_MAX_AGE = 30 * 24 * 3600;

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export const getSession = (req: Request) => unseal<Session>(readCookie(req, SESSION_COOKIE));
export const getGuest = (req: Request) => unseal<Guest>(readCookie(req, GUEST_COOKIE));

export function adminSet(): Set<string> {
  return new Set((process.env.CHAT_ADMINS ?? "").split(",").map(a => a.trim().toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a)));
}
export const isAdmin = (addr: string | null | undefined) => !!addr && adminSet().has(addr.toLowerCase());
