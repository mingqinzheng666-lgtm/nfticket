// Batch-create demo events on the deployed NFTicket contract.
//
//   npx hardhat run scripts/seedEvents.js --network sepolia
//   npx hardhat run scripts/seedEvents.js --network sepolia -- --count 2
//   npx hardhat run scripts/seedEvents.js --network sepolia -- --file my-events.json
//
// Data comes from scripts/seed-data/events.json (edit it freely, or point
// --file at your own). For each event this uploads an on-brand SVG poster,
// the metadata JSON and the seat-map JSON to IPFS (Pinata), then calls
// createEvent with the deployer wallet (which must be owner/admin).

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { buildSeatsFromSections } = require("./lib/buildSeats");
const { validateEvent, selectEvents, parseSeedArgs } = require("./lib/seedValidation");

const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const DEFAULT_DATA = path.join(__dirname, "seed-data", "events.json");
const CONFIG_PATH = path.join(__dirname, "..", "frontend", "src", "contract", "config.js");

function requireJwt() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT is not set. Add it to the root .env (same value as frontend/.env VITE_PINATA_JWT)."
    );
  }
  return jwt;
}

function readDeployedAddress() {
  const src = fs.readFileSync(CONFIG_PATH, "utf8");
  const m = src.match(/export const CONTRACT_ADDRESS = "(0x[0-9a-fA-F]{40})";/);
  if (!m) throw new Error("Could not read CONTRACT_ADDRESS from frontend config.js");
  return m[1];
}

async function pinJson(content, name) {
  const res = await fetch(PINATA_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireJwt()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataMetadata: { name }, pinataContent: content }),
  });
  if (!res.ok) throw new Error(`Pinata JSON upload failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

async function pinFile(buffer, filename, name, contentType) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);
  form.append("pinataMetadata", JSON.stringify({ name }));
  const res = await fetch(PINATA_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${requireJwt()}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata file upload failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );
}

function wrapTitle(name, maxChars = 16) {
  const words = String(name).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// On-brand poster matching the dark "venue before doors" theme (night + spotlight).
function generatePosterSvg(ev) {
  const titleLines = wrapTitle(ev.name);
  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="60" y="${330 + i * 68}" font-family="'Bricolage Grotesque',system-ui,sans-serif" font-size="60" font-weight="800" fill="#F2F3FA">${escapeXml(
          line
        )}</text>`
    )
    .join("");

  const bars = Array.from({ length: 46 }, (_, i) => {
    const w = (i % 4) + 1;
    const x = 60 + i * 13;
    return `<rect x="${x}" y="640" width="${w}" height="34" fill="#A7ABC4" opacity="0.5"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="720" viewBox="0 0 800 720">
  <defs>
    <radialGradient id="beam" cx="18%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#6E7BFF" stop-opacity="0.35"/>
      <stop offset="45%" stop-color="#FFB84D" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#0B0C15" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="800" height="720" fill="#0B0C15"/>
  <rect width="800" height="720" fill="url(#beam)"/>
  <text x="60" y="90" font-family="'IBM Plex Mono',monospace" font-size="20" letter-spacing="6" fill="#FFB84D">NFTICKET</text>
  <text x="60" y="120" font-family="'IBM Plex Mono',monospace" font-size="15" letter-spacing="4" fill="#A7ABC4">ON-CHAIN TICKET</text>
  ${titleSvg}
  <text x="60" y="560" font-family="'IBM Plex Mono',monospace" font-size="22" fill="#FFB84D">${escapeXml(
    ev.date
  )}</text>
  <text x="60" y="595" font-family="'IBM Plex Mono',monospace" font-size="18" fill="#A7ABC4">${escapeXml(
    ev.venue || ""
  )}</text>
  ${bars}
</svg>`;
}

async function main() {
  // `hardhat run` does not forward CLI args to the script, so env vars are the
  // primary knobs (SEED_COUNT / SEED_FILE); argv is kept as a fallback for
  // running the script directly with node.
  const args = parseSeedArgs(process.argv.slice(2));
  const envCount = process.env.SEED_COUNT ? Number.parseInt(process.env.SEED_COUNT, 10) : null;
  const count = Number.isInteger(envCount) && envCount > 0 ? envCount : args.count;
  const file = process.env.SEED_FILE || args.file;
  const dataPath = file ? path.resolve(file) : DEFAULT_DATA;

  const all = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!Array.isArray(all) || all.length === 0) {
    throw new Error(`No events found in ${dataPath}`);
  }
  all.forEach(validateEvent);
  const chosen = selectEvents(all, count);

  const address = readDeployedAddress();
  const [signer] = await hre.ethers.getSigners();
  const contract = await hre.ethers.getContractAt("NFTicket", address, signer);

  // Fail fast before spending any Pinata quota: createEvent is onlyAdminOrOwner,
  // so a wrong signer would otherwise upload IPFS assets and then revert.
  const authorized = await contract.isAdmin(signer.address);
  if (!authorized) {
    throw new Error(
      `Signer ${signer.address} is not owner/admin of ${address}. Aborting before any IPFS upload.`
    );
  }

  console.log(`Seeding ${chosen.length} event(s) to ${address}`);
  console.log(`Signer: ${signer.address}\n`);

  for (let i = 0; i < chosen.length; i++) {
    const ev = chosen[i];
    const label = `[${i + 1}/${chosen.length}] ${ev.name}`;
    console.log(`${label} — building seats & uploading to IPFS…`);

    const { seats, sections, totalTickets } = buildSeatsFromSections(ev.sections);

    let imageUri = ev.image || "";
    if (!imageUri) {
      const svg = generatePosterSvg(ev);
      imageUri = await pinFile(
        Buffer.from(svg, "utf8"),
        `${ev.name}.svg`,
        `${ev.name}-poster`,
        "image/svg+xml"
      );
    }

    const metadataURI = await pinJson(
      {
        name: ev.name,
        date: ev.date,
        venue: ev.venue || "",
        description: (ev.description || "").trim(),
        image: imageUri,
        attributes: [
          { trait_type: "Event", value: ev.name },
          { trait_type: "Date", value: ev.date },
          { trait_type: "Venue", value: ev.venue || "" },
        ],
      },
      `${ev.name}-metadata`
    );

    const seatMapURI = await pinJson(
      { event: ev.name, image: "", sections, seats },
      `${ev.name}-seats`
    );

    process.stdout.write(`${label} — sending createEvent (${totalTickets} seats)… `);
    const tx = await contract.createEvent(
      totalTickets,
      hre.ethers.parseEther(String(ev.ticketPrice)),
      hre.ethers.parseEther(String(ev.maxResalePrice)),
      Number(ev.maxResaleCount),
      metadataURI,
      seatMapURI
    );
    const rc = await tx.wait();

    let eventId = "?";
    for (const log of rc.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === "EventCreated") {
          eventId = parsed.args.eventId.toString();
          break;
        }
      } catch {
        // not one of our events; ignore
      }
    }
    console.log(`done (eventId ${eventId})`);
  }

  console.log(`\nSeeded ${chosen.length} event(s). Hard-refresh the frontend to see them.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
