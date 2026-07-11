const { expect } = require("chai");
const { buildSeatsFromSections } = require("../scripts/lib/buildSeats");

describe("buildSeatsFromSections", function () {
  it("expands a single section into rows x seatsPerRow seats", function () {
    const { seats, sections, totalTickets } = buildSeatsFromSections([
      { code: "A", rows: 2, seatsPerRow: 3 },
    ]);

    expect(totalTickets).to.equal(6);
    expect(seats).to.have.length(6);
    expect(sections).to.deep.equal([
      { code: "A", rows: 2, seatsPerRow: 3, seatCount: 6 },
    ]);
  });

  it("assigns globally incrementing 0-based ids across sections", function () {
    const { seats } = buildSeatsFromSections([
      { code: "A", rows: 1, seatsPerRow: 2 },
      { code: "B", rows: 1, seatsPerRow: 2 },
    ]);

    expect(seats.map((s) => s.id)).to.deep.equal([0, 1, 2, 3]);
    expect(seats[0].section).to.equal("A");
    expect(seats[3].section).to.equal("B");
  });

  it("builds human-readable label and location for each seat", function () {
    const { seats } = buildSeatsFromSections([{ code: "A", rows: 1, seatsPerRow: 1 }]);
    expect(seats[0].label).to.equal("A-1-1");
    expect(seats[0].location).to.equal("Area A, Row 1, Seat 1");
    expect(seats[0].row).to.equal(1);
    expect(seats[0].number).to.equal(1);
  });

  it("uppercases and trims section codes", function () {
    const { sections } = buildSeatsFromSections([{ code: " vip ", rows: 1, seatsPerRow: 1 }]);
    expect(sections[0].code).to.equal("VIP");
  });

  it("accepts numeric strings for rows and seatsPerRow", function () {
    const { totalTickets } = buildSeatsFromSections([
      { code: "A", rows: "3", seatsPerRow: "4" },
    ]);
    expect(totalTickets).to.equal(12);
  });

  it("rejects duplicate section codes", function () {
    expect(() =>
      buildSeatsFromSections([
        { code: "A", rows: 1, seatsPerRow: 1 },
        { code: "a", rows: 1, seatsPerRow: 1 },
      ])
    ).to.throw(/duplicate/i);
  });

  it("rejects a section with non-positive rows or seatsPerRow", function () {
    expect(() => buildSeatsFromSections([{ code: "A", rows: 0, seatsPerRow: 5 }])).to.throw(
      /rows and seats per row/i
    );
  });

  it("rejects an empty section list", function () {
    expect(() => buildSeatsFromSections([])).to.throw(/at least one/i);
  });
});
