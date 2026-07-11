# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NFTicket is an anti-scalping NFT ticketing DApp: a Solidity contract (ERC-721 tickets with on-chain resale price/count limits) plus a React frontend. Originally a University of Bristol FinTech group project; currently being refactored as a portfolio piece.

## Commands

All contract commands run from the repo root; frontend commands run from `frontend/`.

```bash
# Contract (root)
npm install
npm run compile          # hardhat compile + copies artifact to frontend/src/contract/NFTicketABI.json
npm test                 # run all Hardhat tests
npx hardhat test --grep "buyTicket"   # run tests matching a name
npm run node             # local Hardhat chain (chainId 31337)
npm run deploy:local     # deploy to localhost
npm run deploy:sepolia   # deploy to Sepolia (needs ALCHEMY_URL, PRIVATE_KEY in .env)
npm run deploy:sync:sepolia   # deploy AND auto-sync config.js, ABI (json + inline), README — run after any .sol change
npm run seed:events      # batch-create demo events from scripts/seed-data/events.json (SEED_COUNT / SEED_FILE env knobs)

# Frontend (frontend/)
npm install
npm run dev              # Vite dev server
npm run build
npm test                 # Vitest unit tests for pure utils
```

`npm test` at the root runs the Hardhat/Mocha suite: contract tests plus unit tests for the script helpers in `scripts/lib/` (`test/scripts.*.test.js`). There is no lint setup.

## Architecture

Two independent npm packages: the Hardhat project at the root and the Vite/React app in `frontend/` (each has its own package.json and node_modules).

### Contract layer

- `contracts/NFTicket.sol` — single contract holding everything: events (`Event` struct), tickets (`TicketDetails`), roles, primary sale (`buyFromEvent`), resale marketplace (`setTicketPrice`/`buyTicket`), check-in, and protocol fee accounting (`developerBalance`, withdrawn by owner).
- Anti-scalping rules live on-chain: resale price capped at `maxResalePrice`, resale count capped at `maxResaleCount` (0 = unlimited).
- Role model: owner > admins (create/deactivate events) > check-in staff (check in tickets). A wallet can only ever be appointed once (`_appointedOnce`), so admin and staff roles are mutually exclusive forever — this is intentional.
- Events are never deleted, only deactivated via `setEventActive(id, false)`; the frontend hides inactive events everywhere ("Delete Event" in the admin UI is a deactivation).
- "Deployed" metadata (event info, seat maps) lives on IPFS; the chain stores only URIs.

### Frontend layer

- `frontend/src/contract/config.js` is the single source of network truth: contract address, target chain id (Sepolia vs local Hardhat), deploy block, and role allowlists. Switching between local and Sepolia means editing `TARGET_CHAIN_ID` here.
- `hooks/useContract.js` defines its own human-readable ABI string array (NOT the copied `NFTicketABI.json` — keep the two in sync when the contract changes). Reads go through a bare `JsonRpcProvider` (no wallet needed); writes go through the MetaMask signer from `useWallet`.
- Role resolution happens in `App.jsx` on wallet connect (allowlists first, then on-chain `owner`/`isAdmin`/`isCheckInStaff`), producing a `role` of guest/customer/checkin/admin that gates all routes and UI. Admins and staff cannot buy tickets; customers cannot see admin/check-in UI.
- Data loading is brute-force enumeration: pages loop `0..nextEventId`/`0..nextTokenId` calling `getEventDetails`/`getTicketInfo` per id, then fetch metadata JSON from IPFS via the Pinata gateway (`utils/ipfs.js`).
- Entry-pass check-in flow is off-chain until the final step: the ticket holder signs an EIP-191 message (`utils/entryPass.js`), the pass is pinned to IPFS, and delivery to staff is simulated via `localStorage` polling (`utils/staffInbox.js` — works only across tabs of the same browser, a demo stand-in for a real backend). Staff verify the signature client-side, then submit the on-chain `checkIn` transaction.

### Pitfalls

- After a contract change, use `npm run deploy:sync:sepolia` — it deploys and auto-syncs `config.js` (address + block), the ABI JSON, the inline `CONTRACT_ABI` in `useContract.js` (regenerated from the artifact), and the README. Doing these by hand is the old error-prone path; `deploySync.js` (logic in `scripts/lib/syncConfig.js`) exists to prevent ABI drift.
- Secrets live in `.env` files (never committed): root `.env` for Hardhat (`ALCHEMY_URL`, `PRIVATE_KEY`), `frontend/.env` for the app (`VITE_PINATA_JWT`, `VITE_SEPOLIA_RPC_URL`). Vite only exposes vars prefixed `VITE_`. Templates: `.env.example` in each location. Note: `VITE_` vars are still embedded in the built JS bundle, so a deployed demo exposes them to visitors — acceptable for a testnet demo, but keys should be low-privilege and rotatable.
- Seat ids are 0-based ints; seat labels/sections come from the IPFS seat map, with `Seat N+1` fallbacks when the map is missing.
