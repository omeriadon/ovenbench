"use client";

import { Buffer } from "buffer";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction, TransactionInstruction } from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BenchmarkRun,
  BenchmarkSession,
  COOKIE_BRIDGE,
  COOKIE_EXPLORER,
  COOKIE_RPC,
  MEMO_PROGRAM_ID,
  formatMs,
  lamportsToCook,
  percentile,
  shortAddress,
} from "@/lib/cookie-chain";

const HISTORY_KEY = "ovenbench:sessions:v1";
const MAX_RUNS = 5;

type NetworkPulse = {
  slot: number | null;
  blockHeight: number | null;
  tps: number | null;
  balanceLamports: number | null;
  lastUpdated: number | null;
};

const INITIAL_PULSE: NetworkPulse = {
  slot: null,
  blockHeight: null,
  tps: null,
  balanceLamports: null,
  lastUpdated: null,
};

function runLabel(status: BenchmarkRun["status"]) {
  switch (status) {
    case "queued":
      return "Queued";
    case "signing":
      return "Awaiting signature";
    case "broadcasting":
      return "Broadcasting";
    case "confirming":
      return "Confirming";
    case "confirmed":
      return "Confirmed";
    case "failed":
      return "Failed";
  }
}

function safeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown transaction error";
}

export function OvenBench() {
  const { connection } = useConnection();
  const {
    connected,
    connecting,
    publicKey,
    signAllTransactions,
    signTransaction,
    wallet,
  } = useWallet();

  const [runCount, setRunCount] = useState(3);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState("Ready");
  const [pulse, setPulse] = useState<NetworkPulse>(INITIAL_PULSE);
  const [history, setHistory] = useState<BenchmarkSession[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const walletAddress = publicKey?.toBase58() ?? null;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored) as BenchmarkSession[]);
    } catch {
      // Ignore malformed or unavailable local storage.
    }
  }, []);

  const refreshPulse = useCallback(async () => {
    try {
      const [slot, blockHeight, samples, balanceLamports] = await Promise.all([
        connection.getSlot("confirmed"),
        connection.getBlockHeight("confirmed"),
        connection.getRecentPerformanceSamples(1),
        publicKey ? connection.getBalance(publicKey, "confirmed") : Promise.resolve(null),
      ]);

      const latest = samples.at(0);
      const tps = latest && latest.samplePeriodSecs > 0
        ? latest.numTransactions / latest.samplePeriodSecs
        : null;

      setPulse({
        slot,
        blockHeight,
        tps,
        balanceLamports,
        lastUpdated: Date.now(),
      });
    } catch {
      setPulse((current) => ({ ...current, lastUpdated: Date.now() }));
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refreshPulse();
    const interval = window.setInterval(() => void refreshPulse(), 5000);
    return () => window.clearInterval(interval);
  }, [refreshPulse]);

  const updateRun = useCallback((index: number, patch: Partial<BenchmarkRun>) => {
    setRuns((current) =>
      current.map((run) => (run.index === index ? { ...run, ...patch } : run)),
    );
  }, []);

  const getTransactionDetails = useCallback(
    async (signature: string) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const transaction = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (transaction) return transaction;
        await new Promise((resolve) => window.setTimeout(resolve, 180 * (attempt + 1)));
      }
      return null;
    },
    [connection],
  );

  const saveSession = useCallback((session: BenchmarkSession) => {
    setHistory((current) => {
      const next = [session, ...current].slice(0, 8);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // History is a convenience only; the on-chain receipts remain canonical.
      }
      return next;
    });
  }, []);

  const runBenchmark = useCallback(async () => {
    if (!publicKey || !connected) {
      setNotice("Connect Nightly before starting a benchmark.");
      return;
    }
    if (!signAllTransactions && !signTransaction) {
      setNotice("This wallet cannot sign transactions with the current adapter.");
      return;
    }

    setNotice(null);
    setRunning(true);
    setStage("Preparing benchmark");

    const sessionId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const initialRuns = Array.from({ length: runCount }, (_, offset) => ({
      index: offset + 1,
      status: "queued" as const,
    }));
    setRuns(initialRuns);

    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const createdAt = new Date().toISOString();

      const unsigned = initialRuns.map((run) => {
        const memo = JSON.stringify({
          app: "ovenbench",
          version: 1,
          session: sessionId,
          run: run.index,
          createdAt,
        });

        return new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhash,
        }).add(
          new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(memo, "utf8"),
          }),
        );
      });

      setStage(`Sign ${runCount} benchmark transaction${runCount === 1 ? "" : "s"}`);
      setRuns((current) => current.map((run) => ({ ...run, status: "signing" })));

      let signed: Transaction[];
      if (signAllTransactions) {
        signed = await signAllTransactions(unsigned);
      } else {
        signed = [];
        for (const transaction of unsigned) {
          signed.push(await signTransaction!(transaction));
        }
      }

      setStage("Broadcasting to Cookie Chain");

      const completed = await Promise.all(
        signed.map(async (transaction, offset): Promise<BenchmarkRun> => {
          const index = offset + 1;
          updateRun(index, { status: "broadcasting" });
          const startedAt = performance.now();

          try {
            const signature = await connection.sendRawTransaction(transaction.serialize(), {
              maxRetries: 5,
              skipPreflight: false,
            });
            const broadcastMs = performance.now() - startedAt;
            updateRun(index, {
              signature,
              broadcastMs,
              status: "confirming",
            });

            const confirmation = await connection.confirmTransaction(
              { signature, blockhash, lastValidBlockHeight },
              "confirmed",
            );

            if (confirmation.value.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            const confirmationMs = performance.now() - startedAt;
            const details = await getTransactionDetails(signature);
            const result: BenchmarkRun = {
              index,
              status: "confirmed",
              signature,
              broadcastMs,
              confirmationMs,
              slot: details?.slot,
              feeLamports: details?.meta?.fee,
            };
            updateRun(index, result);
            return result;
          } catch (error) {
            const result: BenchmarkRun = {
              index,
              status: "failed",
              error: safeError(error),
            };
            updateRun(index, result);
            return result;
          }
        }),
      );

      const successes = completed.filter(
        (run): run is BenchmarkRun & { confirmationMs: number } =>
          run.status === "confirmed" && typeof run.confirmationMs === "number",
      );
      const times = successes.map((run) => run.confirmationMs);
      const fees = successes
        .map((run) => run.feeLamports)
        .filter((fee): fee is number => typeof fee === "number");

      const session: BenchmarkSession = {
        id: sessionId,
        wallet: publicKey.toBase58(),
        createdAt,
        runCount,
        successCount: successes.length,
        medianMs: percentile(times, 50),
        p95Ms: percentile(times, 95),
        minMs: times.length ? Math.min(...times) : null,
        maxMs: times.length ? Math.max(...times) : null,
        averageFeeLamports: fees.length
          ? fees.reduce((sum, fee) => sum + fee, 0) / fees.length
          : null,
        runs: completed,
      };

      saveSession(session);
      setStage(successes.length === runCount ? "Benchmark complete" : "Benchmark completed with errors");
      void refreshPulse();
    } catch (error) {
      setStage("Benchmark stopped");
      setNotice(safeError(error));
      setRuns((current) =>
        current.map((run) =>
          run.status === "confirmed" || run.status === "failed"
            ? run
            : { ...run, status: "failed", error: "Benchmark stopped before broadcast." },
        ),
      );
    } finally {
      setRunning(false);
    }
  }, [
    connected,
    connection,
    getTransactionDetails,
    publicKey,
    refreshPulse,
    runCount,
    saveSession,
    signAllTransactions,
    signTransaction,
    updateRun,
  ]);

  const currentStats = useMemo(() => {
    const confirmed = runs.filter(
      (run): run is BenchmarkRun & { confirmationMs: number } =>
        run.status === "confirmed" && typeof run.confirmationMs === "number",
    );
    const times = confirmed.map((run) => run.confirmationMs);
    return {
      confirmed: confirmed.length,
      median: percentile(times, 50),
      p95: percentile(times, 95),
      fastest: times.length ? Math.min(...times) : null,
    };
  }, [runs]);

  const copyLatest = useCallback(async () => {
    const latest = history[0];
    if (!latest) return;
    const text = [
      `OvenBench ${latest.id}`,
      `${latest.successCount}/${latest.runCount} confirmed on Cookie Chain`,
      `median ${formatMs(latest.medianMs)} · p95 ${formatMs(latest.p95Ms)}`,
      ...latest.runs
        .filter((run) => run.signature)
        .map((run) => `${COOKIE_EXPLORER}/tx/${run.signature}`),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setNotice("Latest benchmark summary copied.");
  }, [history]);

  return (
    <main className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="OvenBench home">
          <span className="brand-mark" aria-hidden="true">OB</span>
          <span>
            <strong>OvenBench</strong>
            <small>Cookie Chain performance lab</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className="network-pill"><i /> Cookie Chain</span>
          <WalletMultiButton />
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span>Live SVM benchmark</span><b>RPC {shortAddress(COOKIE_RPC, 15, 13)}</b></div>
        <h1>Put <em>sub-second</em><br />finality on the clock.</h1>
        <p className="hero-copy">
          OvenBench signs a batch first, then measures only the network: broadcast to confirmed.
          Every datapoint is backed by a real Cookie Chain memo transaction you can inspect yourself.
        </p>
        <div className="hero-links">
          <a href={COOKIE_EXPLORER} target="_blank" rel="noreferrer">Open Cookiescan ↗</a>
          <a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">Chain docs ↗</a>
        </div>
      </section>

      <section className="pulse-grid" aria-label="Cookie Chain network pulse">
        <Metric label="Current slot" value={pulse.slot?.toLocaleString() ?? "—"} note="confirmed" />
        <Metric label="Block height" value={pulse.blockHeight?.toLocaleString() ?? "—"} note="live RPC" />
        <Metric label="Observed TPS" value={pulse.tps == null ? "—" : pulse.tps.toFixed(1)} note="latest performance sample" />
        <Metric
          label="Wallet balance"
          value={pulse.balanceLamports == null ? "—" : `${lamportsToCook(pulse.balanceLamports).toFixed(5)} COOK`}
          note={walletAddress ? shortAddress(walletAddress) : "connect to read"}
        />
      </section>

      <section className="bench-layout">
        <div className="bench-card">
          <div className="section-heading">
            <div>
              <span className="kicker">01 / Transaction benchmark</span>
              <h2>Fire the oven</h2>
            </div>
            <span className={`stage ${running ? "active" : ""}`}>{stage}</span>
          </div>

          <div className="safety-note">
            <span aria-hidden="true">✓</span>
            <p><strong>No value is transferred.</strong> Each run writes a small public OvenBench memo and pays only the normal Cookie Chain network fee.</p>
          </div>

          <div className="controls">
            <div className="run-picker" aria-label="Benchmark transaction count">
              <span>Transactions</span>
              <div>
                {[1, 3, 5].map((count) => (
                  <button
                    key={count}
                    className={runCount === count ? "selected" : ""}
                    disabled={running}
                    onClick={() => setRunCount(Math.min(count, MAX_RUNS))}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="run-button"
              disabled={!connected || connecting || running}
              onClick={() => void runBenchmark()}
            >
              {running ? "Benchmarking…" : connected ? `Run ${runCount} transaction${runCount === 1 ? "" : "s"}` : "Connect Nightly to run"}
            </button>
          </div>

          {notice && <div className="notice" role="status">{notice}</div>}

          <div className="run-table" aria-live="polite">
            <div className="run-table-head">
              <span>Run</span><span>Status</span><span>Broadcast</span><span>Confirmed</span><span>Receipt</span>
            </div>
            {runs.length === 0 ? (
              <div className="empty-runs">
                <span className="trace-line" />
                <p>Your first benchmark will appear here in real time.</p>
              </div>
            ) : (
              runs.map((run) => (
                <div className="run-row" key={run.index}>
                  <span className="run-number">#{String(run.index).padStart(2, "0")}</span>
                  <span className={`status-text status-${run.status}`}><i />{runLabel(run.status)}</span>
                  <span>{formatMs(run.broadcastMs)}</span>
                  <span>{formatMs(run.confirmationMs)}</span>
                  <span>
                    {run.signature ? (
                      <a href={`${COOKIE_EXPLORER}/tx/${run.signature}`} target="_blank" rel="noreferrer">
                        {shortAddress(run.signature, 4, 4)} ↗
                      </a>
                    ) : run.error ? <span className="error-text" title={run.error}>error</span> : "—"}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="result-strip">
            <Metric compact label="Confirmed" value={`${currentStats.confirmed}/${runs.length || runCount}`} note="successful runs" />
            <Metric compact label="Median" value={formatMs(currentStats.median)} note="p50 confirmation" />
            <Metric compact label="p95" value={formatMs(currentStats.p95)} note="tail latency" />
            <Metric compact label="Fastest" value={formatMs(currentStats.fastest)} note="best run" />
          </div>
        </div>

        <aside className="side-stack">
          <div className="side-card wallet-card">
            <span className="kicker">Connection</span>
            <div className="wallet-line">
              <span className="wallet-orb" />
              <div>
                <strong>{connected ? wallet?.adapter.name ?? "Wallet" : "No wallet"}</strong>
                <small>{walletAddress ? shortAddress(walletAddress, 8, 8) : "Nightly required by the bounty"}</small>
              </div>
            </div>
            <dl>
              <div><dt>Network</dt><dd>Cookie Chain</dd></div>
              <div><dt>Commitment</dt><dd>confirmed</dd></div>
              <div><dt>Program</dt><dd>{shortAddress(MEMO_PROGRAM_ID.toBase58())}</dd></div>
            </dl>
          </div>

          <div className="side-card method-card">
            <span className="kicker">Method</span>
            <ol>
              <li><b>01</b><span>Prepare unique memo transactions with one recent blockhash.</span></li>
              <li><b>02</b><span>Sign the whole batch before any timer starts.</span></li>
              <li><b>03</b><span>Broadcast concurrently and time until confirmed.</span></li>
              <li><b>04</b><span>Fetch slot and fee metadata, then link each receipt.</span></li>
            </ol>
          </div>

          <a className="bridge-card" href={COOKIE_BRIDGE} target="_blank" rel="noreferrer">
            <span><small>Need COOK for fees?</small><strong>Bridge to Cookie Chain</strong></span>
            <b>↗</b>
          </a>
        </aside>
      </section>

      <section className="history-section">
        <div className="section-heading">
          <div>
            <span className="kicker">02 / Local session history</span>
            <h2>Recent bakes</h2>
          </div>
          {history.length > 0 && <button className="text-button" onClick={() => void copyLatest()}>Copy latest summary</button>}
        </div>

        {history.length === 0 ? (
          <div className="history-empty">Completed benchmarks are kept locally in this browser. Transaction receipts remain on Cookie Chain.</div>
        ) : (
          <div className="history-grid">
            {history.map((session) => (
              <article className="history-card" key={`${session.id}-${session.createdAt}`}>
                <div className="history-top">
                  <span>{new Date(session.createdAt).toLocaleString()}</span>
                  <code>{session.id}</code>
                </div>
                <strong>{formatMs(session.medianMs)} <small>median</small></strong>
                <div className="history-meta">
                  <span>{session.successCount}/{session.runCount} confirmed</span>
                  <span>p95 {formatMs(session.p95Ms)}</span>
                  <span>{session.averageFeeLamports == null ? "fee —" : `${lamportsToCook(session.averageFeeLamports).toFixed(7)} COOK avg fee`}</span>
                </div>
                <div className="receipt-links">
                  {session.runs.filter((run) => run.signature).map((run) => (
                    <a key={run.signature} href={`${COOKIE_EXPLORER}/tx/${run.signature}`} target="_blank" rel="noreferrer">#{run.index}</a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        <p>OvenBench is an independent Cookie Chain developer tool. Measurements include client↔RPC network latency and are not a protocol guarantee.</p>
        <div><a href="https://github.com/omeriadon/ovenbench" target="_blank" rel="noreferrer">Source ↗</a><a href="https://www.cookiechain.wtf" target="_blank" rel="noreferrer">Cookie Chain ↗</a></div>
      </footer>
    </main>
  );
}

function Metric({
  label,
  value,
  note,
  compact = false,
}: {
  label: string;
  value: string;
  note: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "metric compact" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
