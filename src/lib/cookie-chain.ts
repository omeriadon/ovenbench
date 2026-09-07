import { PublicKey } from "@solana/web3.js";

export const COOKIE_RPC = "https://rpc.cookiescan.io";
export const COOKIE_WSS = "wss://wss.cookiescan.io";
export const COOKIE_EXPLORER = "https://cookiescan.io";
export const COOKIE_BRIDGE = "https://hyperlane.cookiescan.io";
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export type RunStatus =
  | "queued"
  | "signing"
  | "broadcasting"
  | "confirming"
  | "confirmed"
  | "failed";

export interface BenchmarkRun {
  index: number;
  status: RunStatus;
  signature?: string;
  broadcastMs?: number;
  confirmationMs?: number;
  slot?: number;
  feeLamports?: number;
  error?: string;
}

export interface BenchmarkSession {
  id: string;
  wallet: string;
  createdAt: string;
  runCount: number;
  successCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
  averageFeeLamports: number | null;
  runs: BenchmarkRun[];
}

export function shortAddress(value: string, left = 5, right = 5) {
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function lamportsToCook(lamports: number) {
  return lamports / 1_000_000_000;
}

export function formatMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}
