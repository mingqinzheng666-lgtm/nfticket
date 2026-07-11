---
name: deploy-sync
description: Deploy the NFTicket contract and sync every place the frontend/docs record it, in one step. Use after any change to contracts/*.sol (a deployed contract is immutable, so contract edits require a fresh deploy). Not needed for frontend-only changes.
---

# Deploy & sync NFTicket

Run this whenever `contracts/NFTicket.sol` changes. It deploys a fresh contract
and updates everything that references it, so the frontend never drifts from the
chain.

## What it does

`npm run deploy:sync:sepolia` (or `deploy:sync` for local Hardhat) runs
[scripts/deploySync.js](../../scripts/deploySync.js), which:

1. Compiles the contract.
2. Deploys it — **the deployer wallet (`PRIVATE_KEY` in root `.env`) becomes the new owner.**
3. Rewrites `CONTRACT_ADDRESS` and `DEPLOY_BLOCK` in `frontend/src/contract/config.js`.
4. Copies the ABI JSON to `frontend/src/contract/NFTicketABI.json`.
5. Regenerates the inline human-readable ABI (`CONTRACT_ABI`) in
   `frontend/src/hooks/useContract.js` from the compiled artifact — this removes
   the old "remember to hand-sync the ABI" pitfall.
6. Updates the contract address in `README.md`.

## How to run

```bash
# Sepolia (needs ALCHEMY_URL + PRIVATE_KEY in root .env)
npm run deploy:sync:sepolia

# Local Hardhat node
npm run deploy:sync
```

## Important

- This deploys a **brand-new contract**: the address changes and any events /
  tickets on the previous contract are frozen at the old address. Only run it
  when you actually intend a fresh deployment.
- After it finishes, hard-refresh the frontend; re-run the `seed-events` skill if
  you want demo events on the new contract.
- Pure text-transform logic lives in `scripts/lib/syncConfig.js` and is unit
  tested in `test/scripts.syncConfig.test.js` (`npm test`).
