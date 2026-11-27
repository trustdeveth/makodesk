"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useConfig } from "@/components/providers/ConfigProvider";

/**
 * Dependency-free EVM wallet layer (EIP-1193 + EIP-6963 discovery).
 * Connect, add/switch to Elysium, HYPE balance, $MAKO balance, watchAsset.
 */
interface Eip1193 {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(ev: string, fn: (...a: never[]) => void): void;
  removeListener?(ev: string, fn: (...a: never[]) => void): void;
}
interface WalletState { address: string | null; chainId: number | null; hype: number | null; mako: number | null; hasProvider: boolean }
interface WalletApi extends WalletState {
  onElysium: boolean;
  connect(): Promise<void>;
  ensureNetwork(): Promise<void>;
  watchToken(): Promise<void>;
}

const Ctx = createContext<WalletApi | null>(null);

const fromWei = (hex: string) => {
  const v = BigInt(hex || "0x0");
  return Number(v / 10n ** 18n) + Number(v % 10n ** 18n) / 1e18;
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const cfg = useConfig();
  const provider = useRef<Eip1193 | null>(null);
  const [st, setSt] = useState<WalletState>({ address: null, chainId: null, hype: null, mako: null, hasProvider: false });
  const hexChain = "0x" + cfg.chain.chainId.toString(16);

  const refresh = useCallback(async (address: string | null, chainId: number | null) => {
    const p = provider.current;
    let hype: number | null = null, mako: number | null = null;
    if (p && address && chainId === cfg.chain.chainId) {
      try { hype = fromWei((await p.request({ method: "eth_getBalance", params: [address, "latest"] })) as string); } catch { /* rpc error */ }
      if (cfg.contracts.token) {
        try {
          const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
          mako = fromWei((await p.request({ method: "eth_call", params: [{ to: cfg.contracts.token, data }, "latest"] })) as string);
        } catch { /* rpc error */ }
      }
    }
    setSt(s => ({ ...s, address, chainId, hype, mako }));
  }, [cfg.chain.chainId, cfg.contracts.token]);

  useEffect(() => {
    const announced: Eip1193[] = [];
    const onAnnounce = (e: Event) => announced.push((e as CustomEvent<{ provider: Eip1193 }>).detail.provider);
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    let cleanup = () => {};
    const t = setTimeout(async () => {
      const p = announced[0] ?? ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null);
      provider.current = p;
      setSt(s => ({ ...s, hasProvider: !!p }));
      if (!p) return;
      const onAccounts = (a: string[]) => { void (async () => refresh(a[0] ?? null, parseInt((await p.request({ method: "eth_chainId" })) as string, 16)))(); };
      const onChain = (id: string) => { void (async () => {
        const a = (await p.request({ method: "eth_accounts" })) as string[];
        refresh(a[0] ?? null, parseInt(id, 16));
      })(); };
      p.on?.("accountsChanged", onAccounts as never);
      p.on?.("chainChanged", onChain as never);
      cleanup = () => { p.removeListener?.("accountsChanged", onAccounts as never); p.removeListener?.("chainChanged", onChain as never); };
      try {
        const a = (await p.request({ method: "eth_accounts" })) as string[];
        if (a[0]) refresh(a[0], parseInt((await p.request({ method: "eth_chainId" })) as string, 16));
      } catch { /* not authorized yet */ }
    }, 60);

    return () => { clearTimeout(t); window.removeEventListener("eip6963:announceProvider", onAnnounce); cleanup(); };
  }, [refresh]);

  const connect = useCallback(async () => {
    const p = provider.current;
    if (!p) throw new Error("No wallet found. Install Rabby or MetaMask.");
    const a = (await p.request({ method: "eth_requestAccounts" })) as string[];
    const id = parseInt((await p.request({ method: "eth_chainId" })) as string, 16);
    await refresh(a[0] ?? null, id);
  }, [refresh]);

  const ensureNetwork = useCallback(async () => {
    const p = provider.current;
    if (!p) throw new Error("No wallet found. Install Rabby or MetaMask.");
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: hexChain, chainName: cfg.chain.name, nativeCurrency: cfg.chain.nativeCurrency, rpcUrls: [cfg.chain.rpcUrl], blockExplorerUrls: [cfg.chain.explorer] }],
        });
      } else throw err;
    }
    const a = (await p.request({ method: "eth_accounts" })) as string[];
    await refresh(a[0] ?? null, parseInt((await p.request({ method: "eth_chainId" })) as string, 16));
  }, [cfg.chain, hexChain, refresh]);

  const watchToken = useCallback(async () => {
    const p = provider.current;
    if (!cfg.contracts.token) throw new Error("$MAKO address is published at launch");
    if (!p) throw new Error("Connect a wallet first");
    await p.request({
      method: "wallet_watchAsset",
      params: { type: "ERC20", options: { address: cfg.contracts.token, symbol: cfg.brand.ticker, decimals: 18, image: cfg.siteUrl + "/logo.svg" } },
    });
  }, [cfg]);

  return (
    <Ctx.Provider value={{ ...st, onElysium: st.chainId === cfg.chain.chainId, connect, ensureNetwork, watchToken }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside WalletProvider");
  return v;
}
