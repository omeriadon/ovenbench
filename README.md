# OvenBench

OvenBench is a Nightly-connected transaction benchmark for Cookie Chain.

**Live app:** https://ovenbench-omeriadons-projects.vercel.app  
**Source:** https://github.com/omeriadon/ovenbench

It measures **broadcast → confirmed latency using real signed transactions**, then links every successful sample to its Cookiescan receipt. Wallet signing completes before timing starts, so the benchmark measures the browser/RPC/network path rather than user reaction time.

## What it demonstrates

- Nightly wallet connection
- Cookie Chain genesis verification before signing
- Manual custom-RPC fallback for Nightly when automatic switching renders Cookie Chain as “Unknown”
- Connected wallet address and COOK balance
- Real Cookie Chain transactions through `https://rpc.cookiescan.io`
- Explicit confirmation and failure handling
- Per-transaction broadcast and confirmation latency
- Slot and transaction-fee metadata
- p50 / p95 / fastest statistics
- Live network slot, block height, and observed TPS
- Verifiable Cookiescan receipts
- Local benchmark history and shareable summaries

No value is transferred during a benchmark. Each sample invokes Solana's Memo program with an `ovenbench` payload and pays only the normal Cookie Chain transaction fee.

## Network

| Item | Value |
| --- | --- |
| HTTP RPC | `https://rpc.cookiescan.io` |
| WebSocket | `wss://wss.cookiescan.io` |
| Explorer | `https://cookiescan.io` |
| Required wallet | Nightly |
| Memo program | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |

## Run locally

Requirements: Node.js 20+ and Nightly Wallet.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, connect Nightly, select Cookie Chain as a custom SVM RPC if required, and run a benchmark.

## Nightly / Cookie Chain setup

Cookie Chain is an independent SVM network. In Nightly, add or select a custom Solana/SVM network using:

```text
RPC: https://rpc.cookiescan.io
WebSocket: wss://wss.cookiescan.io
```

OvenBench compares Nightly's active genesis hash with the genesis returned by the configured Cookie Chain RPC and blocks signing if they differ.

## Benchmark method

1. Fetch one recent blockhash.
2. Build 1, 3, or 5 unique memo transactions with the connected wallet as fee payer.
3. Ask the wallet to sign the full batch **before** starting network timers.
4. Broadcast signed transactions concurrently.
5. Measure each transaction from immediately before `sendRawTransaction` until `confirmed` commitment.
6. Fetch transaction metadata and display fee, slot, and Cookiescan receipt.
7. Calculate p50, p95, fastest confirmation latency, and average fee from successful samples.

The measurement includes browser ↔ RPC latency and therefore is not a protocol-level finality guarantee.

## Validation status

Verified on the public deployment:

- Cookie Chain RPC data loads successfully
- current slot, block height and observed TPS render
- Nightly connects successfully on the Cookie Chain custom network
- connected wallet address renders
- native COOK balance is read from Cookie Chain
- production and responsive UI render correctly

A funded-wallet transaction run is recorded separately in `SUBMISSION.md` before final bounty submission.

## Safety

OvenBench never requests a seed phrase or private key. Transactions are built client-side and sent only after the connected wallet signs them. The benchmark memo contains a random session id, run number, timestamp, app identifier, and version; it does not contain personal data.

## License

MIT
