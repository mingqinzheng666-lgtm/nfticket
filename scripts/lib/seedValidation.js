// Pure validation / selection / arg-parsing helpers for the seed script.
// Side-effect free so they can be unit tested without the chain or network.

const { ethers } = require("ethers");
const { buildSeatsFromSections } = require("./buildSeats");

const MAX_PRICE_ETH = "0.01";

function toWei(value, label) {
  try {
    return ethers.parseEther(String(value));
  } catch {
    throw new Error(`${label} is not a valid ETH amount: ${value}`);
  }
}

function validateEvent(ev) {
  if (!ev || typeof ev !== "object") throw new Error("Event must be an object.");
  if (!String(ev.name || "").trim()) throw new Error("Event name is required.");
  if (!String(ev.date || "").trim()) throw new Error(`Event "${ev.name}" is missing a date.`);

  // Throws for empty / malformed sections, reusing the shared seat builder.
  buildSeatsFromSections(ev.sections);

  const price = toWei(ev.ticketPrice, "ticketPrice");
  const cap = toWei(ev.maxResalePrice, "maxResalePrice");
  const max = ethers.parseEther(MAX_PRICE_ETH);

  if (price <= 0n) throw new Error(`Event "${ev.name}" ticketPrice must be greater than 0.`);
  if (price > max) {
    throw new Error(`Event "${ev.name}" ticketPrice exceeds the ${MAX_PRICE_ETH} ETH cap.`);
  }
  if (cap < price) {
    throw new Error(`Event "${ev.name}" maxResalePrice must be >= ticketPrice (resale ceiling too low).`);
  }
  if (cap > max) {
    throw new Error(`Event "${ev.name}" maxResalePrice exceeds the ${MAX_PRICE_ETH} ETH cap.`);
  }

  const count = Number(ev.maxResaleCount);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Event "${ev.name}" maxResaleCount must be a non-negative integer.`);
  }

  return true;
}

function selectEvents(all, count) {
  if (!Array.isArray(all) || all.length === 0) return [];
  if (!count || count <= 0) return all.slice();
  const out = [];
  for (let i = 0; i < count; i++) out.push(all[i % all.length]);
  return out;
}

function parseSeedArgs(argv) {
  const result = { count: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") {
      const n = Number.parseInt(argv[i + 1], 10);
      result.count = Number.isInteger(n) && n > 0 ? n : null;
      i++;
    } else if (argv[i] === "--file") {
      result.file = argv[i + 1] || null;
      i++;
    }
  }
  return result;
}

module.exports = { validateEvent, selectEvents, parseSeedArgs, MAX_PRICE_ETH };
