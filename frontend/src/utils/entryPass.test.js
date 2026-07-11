import { describe, it, expect } from "vitest";
import { buildEntryPassMessage, normalizeEntryPassPayload } from "./entryPass";

describe("entryPass", () => {
  const payload = {
    tokenId: 5,
    eventId: 2,
    seatId: 9,
    holder: "0xAbC0000000000000000000000000000000000001",
    issuedAt: 1000,
    expiresAt: 2000,
  };

  describe("buildEntryPassMessage", () => {
    it("produces the fixed 8-line format", () => {
      const lines = buildEntryPassMessage(payload).split("\n");
      expect(lines[0]).to.equal("NFTicket Entry Pass");
      expect(lines[1]).to.match(/^contract:0x[0-9a-f]{40}$/);
      expect(lines).to.include("tokenId:5");
      expect(lines).to.include("eventId:2");
      expect(lines).to.include("seatId:9");
      expect(lines).to.include("issuedAt:1000");
      expect(lines).to.include("expiresAt:2000");
    });

    it("lowercases the holder address", () => {
      expect(buildEntryPassMessage(payload)).to.include(
        "holder:0xabc0000000000000000000000000000000000001"
      );
    });
  });

  describe("normalizeEntryPassPayload", () => {
    it("coerces numeric fields and lowercases the holder", () => {
      const out = normalizeEntryPassPayload({
        tokenId: "5",
        eventId: "2",
        seatId: "9",
        holder: "0xABC0000000000000000000000000000000000001",
        issuedAt: "1000",
        expiresAt: "2000",
      });
      expect(out.tokenId).to.equal(5);
      expect(out.eventId).to.equal(2);
      expect(out.holder).to.equal("0xabc0000000000000000000000000000000000001");
      expect(out.signature).to.equal("");
    });

    it("preserves an existing signature", () => {
      const out = normalizeEntryPassPayload({ ...payload, signature: "0xdead" });
      expect(out.signature).to.equal("0xdead");
    });
  });
});
