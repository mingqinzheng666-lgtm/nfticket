const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTicket", function () {
  let nfticket;
  let owner, buyer1, buyer2, stranger;

  const E = (n) => ethers.parseEther(String(n));
  const META = "ipfs://QmFakeMeta";
  const SEATS = "ipfs://QmFakeSeats";

  beforeEach(async function () {
    [owner, buyer1, buyer2, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("NFTicket");
    nfticket = await Factory.deploy();
  });

  // ──────────────────── createEvent ────────────────────
  describe("createEvent", function () {
    it("owner can create an event", async function () {
      await nfticket.createEvent(100, E(0.1), E(0.2), 0, META, SEATS);
      const ev = await nfticket.getEventDetails(0);
      expect(ev.totalTickets).to.equal(100n);
      expect(ev.ticketPrice).to.equal(E(0.1));
      expect(ev.isActive).to.be.true;
    });

    it("non-owner cannot create an event", async function () {
      await expect(
        nfticket.connect(stranger).createEvent(10, E(0.1), E(0.2), 0, META, SEATS)
      ).to.be.revertedWith("Not owner/admin");
    });

    it("maxResalePrice below ticketPrice is rejected", async function () {
      await expect(
        nfticket.createEvent(10, E(0.2), E(0.1), 0, META, SEATS)
      ).to.be.revertedWith("Max resale below ticket price");
    });

    it("nextEventId increments on each event", async function () {
      expect(await nfticket.nextEventId()).to.equal(0n);
      await nfticket.createEvent(10, E(0.1), E(0.2), 0, META, SEATS);
      expect(await nfticket.nextEventId()).to.equal(1n);
      await nfticket.createEvent(20, E(0.1), E(0.3), 0, META, SEATS);
      expect(await nfticket.nextEventId()).to.equal(2n);
    });
  });

  // ──────────────────── buyFromEvent (primary sale) ────────────────────
  describe("buyFromEvent", function () {
    beforeEach(async function () {
      await nfticket.createEvent(3, E(0.1), E(0.2), 0, META, SEATS);
    });

    it("buyer receives NFT after primary purchase", async function () {
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      expect(await nfticket.ownerOf(0)).to.equal(buyer1.address);
    });

    it("ticketsMinted increments after purchase", async function () {
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      const ev = await nfticket.getEventDetails(0);
      expect(ev.ticketsMinted).to.equal(1n);
    });

    it("same seat cannot be purchased twice", async function () {
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      await expect(
        nfticket.connect(buyer2).buyFromEvent(0, 0, { value: E(0.1) })
      ).to.be.revertedWith("Seat already taken");
    });

    it("excess ETH is refunded on primary purchase", async function () {
      const before = await ethers.provider.getBalance(buyer1.address);
      const tx = await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(1) });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(buyer1.address);
      const spent = before - after - gasCost;
      expect(spent).to.be.closeTo(E(0.1), E(0.005));
    });

    it("platform receives protocol fee on primary sale", async function () {
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      expect(await nfticket.developerBalance()).to.equal(E(0.002));
    });

    it("cannot buy from sold-out event", async function () {
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      await nfticket.connect(buyer1).buyFromEvent(0, 1, { value: E(0.1) });
      await nfticket.connect(buyer2).buyFromEvent(0, 2, { value: E(0.1) });
      await expect(
        nfticket.connect(buyer2).buyFromEvent(0, 0, { value: E(0.1) })
      ).to.be.revertedWith("Sold out");
    });
  });

  // ──────────────────── setTicketPrice ─────────────────
  describe("setTicketPrice", function () {
    beforeEach(async function () {
      await nfticket.createEvent(10, E(0.1), E(0.2), 5, META, SEATS);
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
    });

    it("ticket owner can list for resale", async function () {
      await nfticket.connect(buyer1).setTicketPrice(0, E(0.15), true);
      const info = await nfticket.getTicketInfo(0);
      expect(info.currentPrice).to.equal(E(0.15));
      expect(info.forSaleStatus).to.be.true;
    });

    it("cannot set price above maxResalePrice", async function () {
      await expect(
        nfticket.connect(buyer1).setTicketPrice(0, E(0.5), true)
      ).to.be.revertedWith("Exceeds max resale price");
    });

    it("non-owner cannot set price", async function () {
      await expect(
        nfticket.connect(stranger).setTicketPrice(0, E(0.1), true)
      ).to.be.revertedWith("Not authorized");
    });
  });

  // ──────────────────── buyTicket (secondary sale) ─────
  describe("buyTicket", function () {
    beforeEach(async function () {
      await nfticket.createEvent(10, E(0.1), E(0.2), 3, META, SEATS);
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      await nfticket.connect(buyer1).setTicketPrice(0, E(0.15), true);
    });

    it("buyer receives NFT after secondary purchase", async function () {
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });
      expect(await nfticket.ownerOf(0)).to.equal(buyer2.address);
    });

    it("ticket is delisted after sale", async function () {
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });
      const info = await nfticket.getTicketInfo(0);
      expect(info.forSaleStatus).to.be.false;
    });

    it("resaleCount increments after each purchase", async function () {
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });
      const info = await nfticket.getTicketInfo(0);
      expect(info.totalResales).to.equal(1n);
    });

    it("excess ETH is refunded to buyer on secondary sale", async function () {
      const before = await ethers.provider.getBalance(buyer2.address);
      const tx = await nfticket.connect(buyer2).buyTicket(0, { value: E(1) });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(buyer2.address);
      const spent = before - after - gasCost;
      expect(spent).to.be.closeTo(E(0.15), E(0.005));
    });

    it("platform accumulates protocol fee on secondary sale", async function () {
      const balBefore = await nfticket.developerBalance();
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });
      const balAfter = await nfticket.developerBalance();
      // 2% of 0.15 ETH = 0.003 ETH
      expect(balAfter - balBefore).to.equal(E(0.003));
    });

    it("seller gets 98% of sale price", async function () {
      const before = await ethers.provider.getBalance(buyer1.address);
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });
      const after = await ethers.provider.getBalance(buyer1.address);
      // seller gets 98% of 0.15 ETH = 0.147 ETH
      expect(after - before).to.be.closeTo(E(0.147), E(0.001));
    });

    it("seller cannot buy their own ticket", async function () {
      await expect(
        nfticket.connect(buyer1).buyTicket(0, { value: E(0.15) })
      ).to.be.revertedWith("Cannot buy your own ticket");
    });

    it("cannot buy an unlisted ticket", async function () {
      await nfticket.connect(buyer1).setTicketPrice(0, E(0.15), false);
      await expect(
        nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) })
      ).to.be.revertedWith("Not for sale");
    });

    it("cannot buy with insufficient funds", async function () {
      await expect(
        nfticket.connect(buyer2).buyTicket(0, { value: E(0.01) })
      ).to.be.revertedWith("Insufficient funds");
    });

    it("enforces maxResaleCount", async function () {
      // maxResaleCount = 3
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });    // resale 1
      await nfticket.connect(buyer2).setTicketPrice(0, E(0.15), true);
      await nfticket.connect(buyer1).buyTicket(0, { value: E(0.15) });    // resale 2
      await nfticket.connect(buyer1).setTicketPrice(0, E(0.15), true);
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });    // resale 3 — limit hit
      // After reaching maxResaleCount, relisting is blocked
      await expect(
        nfticket.connect(buyer2).setTicketPrice(0, E(0.15), true)
      ).to.be.revertedWith("Max resales reached");
    });

    it("maxResaleCount = 0 means unlimited resales", async function () {
      await nfticket.createEvent(10, E(0.1), E(0.2), 0, META, SEATS);
      await nfticket.connect(buyer1).buyFromEvent(1, 0, { value: E(0.1) });
      await nfticket.connect(buyer1).setTicketPrice(1, E(0.15), true);
      const tokenId = 1;
      for (let i = 0; i < 5; i++) {
        const currentOwner = (await nfticket.ownerOf(tokenId)).toLowerCase();
        const seller = currentOwner === buyer1.address.toLowerCase() ? buyer1 : buyer2;
        const nextBuyer = seller === buyer1 ? buyer2 : buyer1;
        await nfticket.connect(nextBuyer).buyTicket(tokenId, { value: E(0.15) });
        if (i < 4) {
          await nfticket.connect(nextBuyer).setTicketPrice(tokenId, E(0.15), true);
        }
      }
      const info = await nfticket.getTicketInfo(tokenId);
      expect(info.totalResales).to.equal(5n);
    });
  });

  // ──────────────────── checkIn ─────────────────────────
  describe("checkIn", function () {
    beforeEach(async function () {
      await nfticket.createEvent(10, E(0.1), E(0.2), 0, META, SEATS);
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
    });

    it("owner can check in a ticket", async function () {
      await nfticket.checkIn(0);
      const info = await nfticket.getTicketInfo(0);
      expect(info.isUsed).to.be.true;
    });

    it("used ticket cannot be relisted", async function () {
      await nfticket.checkIn(0);
      await expect(
        nfticket.connect(buyer1).setTicketPrice(0, E(0.1), true)
      ).to.be.revertedWith("Ticket already used");
    });

    it("used ticket cannot be bought", async function () {
      await nfticket.connect(buyer1).setTicketPrice(0, E(0.15), true);
      await nfticket.checkIn(0);
      await expect(
        nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) })
      ).to.be.revertedWith("Ticket already used");
    });

    it("cannot check in the same ticket twice", async function () {
      await nfticket.checkIn(0);
      await expect(nfticket.checkIn(0)).to.be.revertedWith("Ticket already used");
    });

    it("stranger cannot check in", async function () {
      await expect(
        nfticket.connect(stranger).checkIn(0)
      ).to.be.revertedWith("Not authorized to check in");
    });

    it("granted check-in staff can check in", async function () {
      await nfticket.setCheckInStaff(buyer2.address, true);
      await nfticket.connect(buyer2).checkIn(0);
      const info = await nfticket.getTicketInfo(0);
      expect(info.isUsed).to.be.true;
    });
  });

  // ──────────────────── setProtocolFee ─────────────────
  describe("setProtocolFee", function () {
    it("owner can set fee between 1–10%", async function () {
      await nfticket.setProtocolFee(7);
      expect(await nfticket.protocolFeePercent()).to.equal(7n);
    });

    it("fee of 0% is rejected", async function () {
      await expect(nfticket.setProtocolFee(0)).to.be.revertedWith("Fee must be 1-10");
    });

    it("fee above 10% is rejected", async function () {
      await expect(nfticket.setProtocolFee(11)).to.be.revertedWith("Fee must be 1-10");
    });
  });

  // ──────────────────── withdrawDeveloperProfits ────────
  describe("withdrawDeveloperProfits", function () {
    it("owner can withdraw accumulated fees", async function () {
      await nfticket.createEvent(10, E(0.1), E(0.2), 0, META, SEATS);
      await nfticket.connect(buyer1).buyFromEvent(0, 0, { value: E(0.1) });
      await nfticket.connect(buyer1).setTicketPrice(0, E(0.15), true);
      await nfticket.connect(buyer2).buyTicket(0, { value: E(0.15) });
      // fees: 2% of 0.1 (primary) + 2% of 0.15 (secondary) = 0.002 + 0.003 = 0.005 ETH

      const before = await ethers.provider.getBalance(owner.address);
      const tx = await nfticket.withdrawDeveloperProfits();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);

      expect(after - before + gasCost).to.be.closeTo(E(0.005), E(0.0001));
      expect(await nfticket.developerBalance()).to.equal(0n);
    });

    it("cannot withdraw when balance is zero", async function () {
      await expect(nfticket.withdrawDeveloperProfits()).to.be.revertedWith("Nothing to withdraw");
    });

    it("stranger cannot withdraw", async function () {
      await expect(
        nfticket.connect(stranger).withdrawDeveloperProfits()
      ).to.be.revertedWithCustomError(nfticket, "OwnableUnauthorizedAccount");
    });
  });

  // ──────────────────── role management ────────────────
  describe("setAdmin / setCheckInStaff", function () {
    it("owner can grant admin role", async function () {
      await nfticket.setAdmin(buyer1.address, true);
      expect(await nfticket.isAdmin(buyer1.address)).to.be.true;
    });

    it("admin can create events", async function () {
      await nfticket.setAdmin(buyer1.address, true);
      await nfticket.connect(buyer1).createEvent(10, E(0.1), E(0.2), 0, META, SEATS);
      expect(await nfticket.nextEventId()).to.equal(1n);
    });

    it("same wallet cannot be appointed twice", async function () {
      await nfticket.setAdmin(buyer1.address, true);
      await expect(
        nfticket.setAdmin(buyer1.address, true)
      ).to.be.revertedWith("Account already appointed");
    });

    it("wallet cannot hold both admin and check-in roles", async function () {
      await nfticket.setAdmin(buyer1.address, true);
      await expect(
        nfticket.setCheckInStaff(buyer1.address, true)
      ).to.be.revertedWith("Account already appointed");
    });
  });
});
