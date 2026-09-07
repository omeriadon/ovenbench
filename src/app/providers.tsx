"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { NightlyWalletAdapter } from "@solana/wallet-adapter-nightly";
import { COOKIE_RPC, COOKIE_WSS } from "@/lib/cookie-chain";
import "./network-gate.css";

type NightlySolana = {
  genesisHash?: string;
};

type NightlyWindow = Window & {
  nightly?: {
    solana?: NightlySolana;
  };
};

type NetworkState = "idle" | "checking" | "correct" | "wrong" | "error";

function NetworkGate({ children }: { children: React.ReactNode }) {
  const { connection } = useConnection();
  const { connected } = useWallet();
  const [state, setState] = useState<NetworkState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const checkNetwork = useCallback(async () => {
    if (!connected) {
      setState("idle");
      setError(null);
      return;
    }

    setState("checking");
    setError(null);

    try {
      const expectedGenesisHash = await connection.getGenesisHash();
      const nightly = (window as NightlyWindow).nightly?.solana;

      if (!nightly?.genesisHash) {
        setState("error");
        setError("Nightly did not expose its active SVM network. Reconnect the wallet, then check again.");
        return;
      }

      setState(nightly.genesisHash === expectedGenesisHash ? "correct" : "wrong");
    } catch (networkError) {
      setState("error");
      setError(
        networkError instanceof Error
          ? networkError.message
          : "Could not verify the active wallet network.",
      );
    }
  }, [connected, connection]);

  useEffect(() => {
    void checkNetwork();
  }, [checkNetwork]);

  const copyRpc = useCallback(async () => {
    await navigator.clipboard.writeText(COOKIE_RPC);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, []);

  const blocked = connected && state !== "correct";

  return (
    <>
      <div aria-hidden={blocked ? true : undefined} className={blocked ? "network-blocked" : undefined}>
        {children}
      </div>

      {blocked && (
        <div className="network-gate" role="dialog" aria-modal="true" aria-labelledby="network-gate-title">
          <div className="network-gate-card">
            <span className="kicker">Nightly network check</span>
            <h2 id="network-gate-title">
              {state === "checking" ? "Checking Cookie Chain…" : "Set Nightly to Cookie Chain"}
            </h2>

            {state === "checking" ? (
              <p>Comparing Nightly's active SVM genesis with the Cookie Chain RPC.</p>
            ) : (
              <>
                <p>
                  Nightly is connected, but it is not currently on Cookie Chain. Add Cookie Chain as a custom SVM RPC in Nightly, then come back and re-check.
                </p>

                <ol className="network-steps">
                  <li>Open Nightly's Solana network selector.</li>
                  <li>Choose <strong>Custom RPC</strong> / custom SVM network.</li>
                  <li>Paste the official Cookie Chain RPC below and save/select it.</li>
                  <li>Return here and click <strong>Check again</strong>.</li>
                </ol>

                <div className="rpc-box">
                  <code>{COOKIE_RPC}</code>
                  <button type="button" onClick={() => void copyRpc()}>{copied ? "Copied" : "Copy RPC"}</button>
                </div>

                <small className="network-note">
                  Some Nightly versions display a first-time custom SVM target as “Unknown” in the automatic switch dialog. Manual Custom RPC setup avoids that disabled confirmation state.
                </small>
              </>
            )}

            {error && <div className="network-error" role="status">{error}</div>}

            {state !== "checking" && (
              <div className="network-gate-actions">
                <button className="run-button network-check-button" onClick={() => void checkNetwork()}>
                  Check again
                </button>
                <a
                  className="network-doc-link"
                  href="https://docs.cookiechain.wtf/wallets"
                  target="_blank"
                  rel="noreferrer"
                >
                  Cookie Chain wallet docs ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new NightlyWalletAdapter()], []);

  return (
    <ConnectionProvider
      endpoint={COOKIE_RPC}
      config={{ commitment: "confirmed", wsEndpoint: COOKIE_WSS }}
    >
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <NetworkGate>{children}</NetworkGate>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
