import { describe, it, expect, beforeEach } from "vitest";
import {
  registerActiveStaff,
  listActiveStaff,
  pushStaffPass,
  listStaffPasses,
  updateStaffPass,
  buildStaffDirectory,
} from "./staffInbox";

const STAFF = "0xStaff000000000000000000000000000000000001";
const HOLDER = "0xHolder00000000000000000000000000000000002";

function makePass(overrides = {}) {
  return {
    staffAddress: STAFF,
    staffName: "Staff1",
    eventId: 3,
    tokenId: 7,
    seatId: 0,
    passURI: "ipfs://QmPass",
    payload: { holder: HOLDER, tokenId: 7, eventId: 3, seatId: 0 },
    ...overrides,
  };
}

describe("staffInbox active-staff registry", () => {
  beforeEach(() => window.localStorage.clear());

  it("registers a staff member for an event and lists them lowercased", () => {
    registerActiveStaff(STAFF, 3);
    expect(listActiveStaff(3)).to.deep.equal([STAFF.toLowerCase()]);
  });

  it("does not duplicate the same staff+event on repeat registration", () => {
    registerActiveStaff(STAFF, 3);
    registerActiveStaff(STAFF, 3);
    expect(listActiveStaff(3)).to.have.length(1);
  });

  it("scopes active staff to the given event id", () => {
    registerActiveStaff(STAFF, 3);
    expect(listActiveStaff(4)).to.deep.equal([]);
  });
});

describe("staffInbox passes", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores a pass and returns it for the assigned staff", () => {
    pushStaffPass(makePass());
    const rows = listStaffPasses(STAFF, { includeProcessed: false });
    expect(rows).to.have.length(1);
    expect(rows[0].tokenId).to.equal(7);
  });

  it("dedupes a second pass for the same token+holder", () => {
    const first = pushStaffPass(makePass());
    const again = pushStaffPass(makePass());
    expect(again.id).to.equal(first.id);
    expect(listStaffPasses(STAFF, { includeProcessed: false })).to.have.length(1);
  });

  it("hides checked-in passes unless includeProcessed is set", () => {
    const rec = pushStaffPass(makePass());
    updateStaffPass(rec.id, { status: "checked_in" });
    expect(listStaffPasses(STAFF, { includeProcessed: false })).to.have.length(0);
    expect(listStaffPasses(STAFF, { includeProcessed: true })).to.have.length(1);
  });
});

describe("buildStaffDirectory", () => {
  it("dedupes and names wallets Staff1..N", () => {
    const dir = buildStaffDirectory([STAFF, STAFF, HOLDER]);
    expect(dir).to.deep.equal([
      { address: STAFF.toLowerCase(), name: "Staff1" },
      { address: HOLDER.toLowerCase(), name: "Staff2" },
    ]);
  });
});
