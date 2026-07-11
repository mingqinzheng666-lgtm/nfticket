import { CONTRACT_ADDRESS, TARGET_CHAIN_ID } from "../contract/config";

const STORAGE_SCOPE = `${String(TARGET_CHAIN_ID)}_${String(CONTRACT_ADDRESS || "").toLowerCase()}`;
const INBOX_KEY = `nfticket_staff_inbox_v2_${STORAGE_SCOPE}`;
const ACTIVE_STAFF_KEY = `nfticket_active_staff_v1_${STORAGE_SCOPE}`;

function safeRead() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INBOX_KEY, JSON.stringify(items));
}

function normalizeHolder(value) {
  return String(value || "").trim().toLowerCase();
}

function readActiveStaff() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVE_STAFF_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function registerActiveStaff(staffAddress, eventId) {
  const address = normalizeHolder(staffAddress);
  const event = Number(eventId);
  if (!address || !Number.isFinite(event)) return;

  const rows = readActiveStaff().filter(
    (r) => !(normalizeHolder(r.address) === address && Number(r.eventId) === event)
  );
  rows.push({ address, eventId: event, updatedAt: Date.now() });

  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_STAFF_KEY, JSON.stringify(rows));
}

export function listActiveStaff(eventId) {
  const event = Number(eventId);
  if (!Number.isFinite(event)) return [];

  return readActiveStaff()
    .filter((r) => Number(r.eventId) === event)
    .sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt))
    .map((r) => normalizeHolder(r.address));
}

export function buildStaffDirectory(wallets = []) {
  const seen = new Set();
  const normalized = [];

  for (const wallet of wallets) {
    const address = String(wallet || "").trim().toLowerCase();
    if (!address || seen.has(address)) continue;
    seen.add(address);
    normalized.push(address);
  }

  return normalized.map((address, idx) => ({
    address,
    name: `Staff${idx + 1}`,
  }));
}

export function getStaffNameByAddress(address, wallets = []) {
  const target = String(address || "").trim().toLowerCase();
  if (!target) return "";
  const directory = buildStaffDirectory(wallets);
  return directory.find((s) => s.address === target)?.name || "";
}

export function pushStaffPass({
  staffAddress,
  staffName,
  payload,
  eventId,
  tokenId,
  seatId,
  passURI = "",
}) {
  const holder = normalizeHolder(payload?.holder);
  const token = Number(tokenId);
  const items = safeRead();
  if (holder && Number.isFinite(token)) {
    const existing =
      items
        .filter((r) => Number(r.tokenId) === token)
        .filter((r) => normalizeHolder(r?.payload?.holder) === holder)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null;
    if (existing) return existing;
  }

  const now = Date.now();
  const record = {
    id: `${tokenId}-${seatId}-${now}-${Math.floor(Math.random() * 100000)}`,
    createdAt: now,
    updatedAt: now,
    status: "pending", // pending | verified | checked_in | invalid
    error: "",
    staffAddress: String(staffAddress || "").toLowerCase(),
    staffName: String(staffName || ""),
    eventId: Number(eventId),
    tokenId: Number(tokenId),
    seatId: Number(seatId),
    passURI: String(passURI || ""),
    payload,
  };

  items.push(record);
  safeWrite(items);
  return record;
}

export function listStaffPasses(staffAddress, opts = {}) {
  const target = String(staffAddress || "").toLowerCase();
  const eventId = opts.eventId ?? null;
  const includeProcessed = Boolean(opts.includeProcessed);

  return safeRead()
    .filter((r) => r.staffAddress === target)
    .filter((r) => (eventId === null ? true : Number(r.eventId) === Number(eventId)))
    .filter((r) => (includeProcessed ? true : r.status !== "checked_in"))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export function listIssuedPassesForHolder(holder) {
  const target = normalizeHolder(holder);
  if (!target) return [];

  return safeRead()
    .filter((r) => normalizeHolder(r?.payload?.holder) === target)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export function findLatestIssuedPassForTicketHolder(tokenId, holder) {
  const targetHolder = normalizeHolder(holder);
  const targetTokenId = Number(tokenId);
  if (!targetHolder || !Number.isFinite(targetTokenId)) return null;

  return (
    safeRead()
      .filter((r) => Number(r.tokenId) === targetTokenId)
      .filter((r) => normalizeHolder(r?.payload?.holder) === targetHolder)
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] || null
  );
}

export function updateStaffPass(id, patch) {
  const items = safeRead();
  const idx = items.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  items[idx] = {
    ...items[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  safeWrite(items);
  return items[idx];
}
