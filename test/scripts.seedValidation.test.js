const { expect } = require("chai");
const {
  validateEvent,
  selectEvents,
  parseSeedArgs,
  MAX_PRICE_ETH,
} = require("../scripts/lib/seedValidation");

function baseEvent(overrides = {}) {
  return {
    name: "Demo",
    date: "2026-08-15",
    venue: "Somewhere",
    ticketPrice: "0.002",
    maxResalePrice: "0.003",
    maxResaleCount: 2,
    sections: [{ code: "A", rows: 1, seatsPerRow: 4 }],
    ...overrides,
  };
}

describe("seedValidation", function () {
  describe("validateEvent", function () {
    it("accepts a well-formed event", function () {
      expect(() => validateEvent(baseEvent())).to.not.throw();
    });

    it("rejects a ticket price above the 0.01 cap", function () {
      expect(() => validateEvent(baseEvent({ ticketPrice: "0.02", maxResalePrice: "0.02" }))).to.throw(
        new RegExp(MAX_PRICE_ETH)
      );
    });

    it("rejects a resale ceiling below the ticket price", function () {
      expect(() =>
        validateEvent(baseEvent({ ticketPrice: "0.005", maxResalePrice: "0.001" }))
      ).to.throw(/resale/i);
    });

    it("rejects a resale ceiling above the 0.01 cap", function () {
      expect(() =>
        validateEvent(baseEvent({ ticketPrice: "0.008", maxResalePrice: "0.05" }))
      ).to.throw(new RegExp(MAX_PRICE_ETH));
    });

    it("rejects a missing name", function () {
      expect(() => validateEvent(baseEvent({ name: "" }))).to.throw(/name/i);
    });

    it("rejects invalid seat sections", function () {
      expect(() => validateEvent(baseEvent({ sections: [] }))).to.throw(/section/i);
    });
  });

  describe("selectEvents", function () {
    const all = [{ name: "A" }, { name: "B" }, { name: "C" }];

    it("returns all events when no count is given", function () {
      expect(selectEvents(all, null)).to.have.length(3);
    });

    it("limits to the first N when N < length", function () {
      expect(selectEvents(all, 2).map((e) => e.name)).to.deep.equal(["A", "B"]);
    });

    it("cycles to reach N when N > length", function () {
      expect(selectEvents(all, 4).map((e) => e.name)).to.deep.equal(["A", "B", "C", "A"]);
    });
  });

  describe("parseSeedArgs", function () {
    it("reads --count and --file", function () {
      expect(parseSeedArgs(["--count", "3", "--file", "x.json"])).to.deep.equal({
        count: 3,
        file: "x.json",
      });
    });

    it("defaults to null count and null file", function () {
      expect(parseSeedArgs([])).to.deep.equal({ count: null, file: null });
    });

    it("ignores a non-numeric count", function () {
      expect(parseSeedArgs(["--count", "abc"]).count).to.equal(null);
    });
  });
});
