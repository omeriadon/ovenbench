# OvenBench — Superteam submission

## One-line pitch

**OvenBench turns Cookie Chain's sub-second-finality claim into a live, wallet-signed benchmark with verifiable on-chain receipts.**

## What it does

Connect Nightly, choose 1/3/5 samples, approve the batch, and OvenBench broadcasts real Cookie Chain memo transactions concurrently. It measures broadcast-to-confirmed latency, fetches fee/slot metadata, calculates p50 and p95, and links every successful sample to Cookiescan.

Wallet signing is completed before timers start, so wallet UX does not contaminate the network measurement. OvenBench also verifies Nightly is on the same Cookie Chain genesis as the app RPC before allowing signing.

## Why it is useful

Cookie Chain is built around a fast SVM experience. OvenBench lets developers and users measure that experience from their own browser and geography instead of relying on a static marketing number. Every successful datapoint has an auditable on-chain receipt.

## Submission links

- Live application: https://ovenbench-omeriadons-projects.vercel.app
- Public source: https://github.com/omeriadon/ovenbench
- Explorer: https://cookiescan.io
- Program used: Solana Memo v2 — `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`
- RPC: `https://rpc.cookiescan.io`
- WebSocket: `wss://wss.cookiescan.io`

## Demonstrated behavior

- Reads current Cookie Chain slot, block height and recent performance sample data.
- Connects Nightly and displays the connected address and native COOK balance.
- Verifies the active Nightly SVM genesis against Cookie Chain before enabling the benchmark.
- Builds unique Memo v2 transactions with the connected wallet as fee payer.
- Signs the batch before network timing starts.
- Broadcasts signed transactions concurrently and waits for `confirmed` commitment.
- Displays broadcast latency, confirmation latency, fee and slot data.
- Calculates median (p50), p95 and fastest confirmation time.
- Links every successful run to its Cookiescan transaction receipt.
- Persists recent benchmark history locally in the browser.
- Handles wallet/network/transaction failures without claiming false benchmark results.

## Safety / scope

OvenBench does not transfer value during a benchmark. Each run only writes a small public memo and pays the normal Cookie Chain fee. It never requests a seed phrase or private key. Timing begins only after wallet signing completes.

The measurement includes browser-to-RPC latency and is therefore an end-to-end user measurement, not a protocol-level finality guarantee.

## X thread checklist

The final X thread should include:

1. What OvenBench measures and why signing occurs before timing.
2. A short screen recording: connect Nightly → choose 3 samples → sign → live confirmations.
3. A screenshot of the p50/p95 results and receipt links.
4. A note that each sample is a real on-chain Memo transaction and transfers no value.
5. The public app and source links.
6. The official Cookie Chain bridge for users who need COOK for fees.

Then share the thread in the Cookie Chain Telegram as required by the bounty.

## Final verification before submission

- [x] Standalone public GitHub repository exists
- [x] MIT license is present
- [x] Cookie Chain RPC is configured
- [x] Nightly wallet adapter is integrated
- [x] Cookie Chain genesis/network guard is implemented
- [x] Manual custom-RPC fallback handles Nightly's disabled “Unknown” switch state
- [x] Live Cookie Chain slot / block height / TPS render
- [x] Eligible adult connected Nightly on Cookie Chain
- [x] Connected wallet address renders
- [x] Native COOK balance renders
- [x] Standalone Vercel production deployment created
- [ ] Standalone production URL visually verified after build
- [ ] Wallet funded with enough COOK for test fees
- [ ] A 3-transaction benchmark signs as a batch
- [ ] All three signatures confirm and appear on Cookiescan
- [ ] p50/p95 render from real confirmations
- [ ] Signature rejection / cancellation state observed
- [ ] Final desktop/mobile screenshots captured
- [ ] Demo screen recording captured
- [ ] X thread posted
- [ ] X thread shared in Cookie Chain Telegram
- [ ] Superteam listing submitted
