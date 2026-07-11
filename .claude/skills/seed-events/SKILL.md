---
name: seed-events
description: Batch-create demo events on the deployed NFTicket contract from an editable JSON file. Use to populate an empty contract so the demo/portfolio looks complete. Each event's price is capped at 0.01 ETH.
---

# Seed demo events

Creates several events in one command using the owner wallet — no per-event
MetaMask clicking. For each event it uploads an on-brand SVG poster, the
metadata JSON and the seat-map JSON to IPFS (Pinata), then calls `createEvent`.

## Data source (customizable)

Events come from [scripts/seed-data/events.json](../../scripts/seed-data/events.json).
Edit that file to change what gets created — each entry is:

```json
{
  "name": "…", "date": "2026-08-15", "venue": "…", "description": "…",
  "ticketPrice": "0.002", "maxResalePrice": "0.003", "maxResaleCount": 2,
  "sections": [{ "code": "A", "rows": 6, "seatsPerRow": 8 }],
  "image": "ipfs://…  (optional; omit to auto-generate a poster)"
}
```

Constraints (enforced by `scripts/lib/seedValidation.js`, unit tested in
`test/scripts.seedValidation.test.js`): `ticketPrice` and `maxResalePrice` must
each be > 0 and ≤ 0.01 ETH, and `maxResalePrice` ≥ `ticketPrice`.

## How to run

```bash
# Create every event in the JSON (default)
npm run seed:events

# Limit / repeat to N events
SEED_COUNT=2 npm run seed:events

# Use a different data file
SEED_FILE=my-events.json npm run seed:events
```

Requires `PRIVATE_KEY` (owner wallet), `ALCHEMY_URL` and `PINATA_JWT` in root
`.env`. The target contract is read from `frontend/src/contract/config.js`, so it
always seeds whatever the frontend points at.

After it prints the created event ids, hard-refresh the frontend to see them.
