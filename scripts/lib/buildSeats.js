// Pure seat-map builder shared by the seed script. Mirrors the logic in
// frontend/src/pages/Admin.jsx (buildSeatsFromSections) so events created from
// the CLI produce the exact same seat manifest the UI would.

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function buildSeatsFromSections(sectionInputs) {
  if (!Array.isArray(sectionInputs) || sectionInputs.length === 0) {
    throw new Error("Please configure at least one seat section.");
  }

  const seats = [];
  const sections = [];
  const usedCodes = new Set();
  let id = 0;

  for (let i = 0; i < sectionInputs.length; i++) {
    const code = String(sectionInputs[i]?.code || "").trim().toUpperCase();
    const rows = parsePositiveInt(sectionInputs[i]?.rows);
    const seatsPerRow = parsePositiveInt(sectionInputs[i]?.seatsPerRow);

    if (!code) throw new Error(`Section ${i + 1} code is required.`);
    if (usedCodes.has(code)) throw new Error(`Duplicate section code: ${code}.`);
    if (!rows || !seatsPerRow) {
      throw new Error(`Section ${code} needs valid rows and seats per row.`);
    }

    usedCodes.add(code);
    sections.push({ code, rows, seatsPerRow, seatCount: rows * seatsPerRow });

    for (let row = 1; row <= rows; row++) {
      for (let seat = 1; seat <= seatsPerRow; seat++) {
        seats.push({
          id,
          section: code,
          row,
          number: seat,
          label: `${code}-${row}-${seat}`,
          location: `Area ${code}, Row ${row}, Seat ${seat}`,
        });
        id++;
      }
    }
  }

  return { seats, sections, totalTickets: seats.length };
}

module.exports = { buildSeatsFromSections, parsePositiveInt };
