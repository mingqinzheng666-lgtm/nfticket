const { expect } = require("chai");
const {
  updateConfigSource,
  updateReadmeSource,
  updateUseContractAbi,
  formatHumanReadableAbi,
} = require("../scripts/lib/syncConfig");

const NEW_ADDR = "0x1111111111111111111111111111111111111111";
const OLD_ADDR = "0x7bBfd6cbDf35959649611b6D7A49b8e745b64a8a";

describe("syncConfig", function () {
  describe("updateConfigSource", function () {
    const config = [
      'export const CONTRACT_ADDRESS = "0x7bBfd6cbDf35959649611b6D7A49b8e745b64a8a";',
      "",
      "export const DEPLOY_BLOCK = 11245554;",
      "",
      "export const TARGET_CHAIN_ID = SEPOLIA_CHAIN_ID;",
    ].join("\n");

    it("replaces both the address and the deploy block", function () {
      const out = updateConfigSource(config, { address: NEW_ADDR, deployBlock: 999 });
      expect(out).to.include(`export const CONTRACT_ADDRESS = "${NEW_ADDR}";`);
      expect(out).to.include("export const DEPLOY_BLOCK = 999;");
      expect(out).to.not.include(OLD_ADDR);
      expect(out).to.include("export const TARGET_CHAIN_ID = SEPOLIA_CHAIN_ID;");
    });

    it("throws if the expected anchors are missing", function () {
      expect(() => updateConfigSource("nothing here", { address: NEW_ADDR, deployBlock: 1 })).to.throw(
        /CONTRACT_ADDRESS/
      );
    });
  });

  describe("updateReadmeSource", function () {
    const readme = [
      "- Network: Sepolia",
      "- Address: `0x7bBfd6cbDf35959649611b6D7A49b8e745b64a8a`",
      "- Etherscan: https://sepolia.etherscan.io/address/0x7bBfd6cbDf35959649611b6D7A49b8e745b64a8a",
    ].join("\n");

    it("replaces every occurrence of the old address", function () {
      const out = updateReadmeSource(readme, { address: NEW_ADDR });
      expect(out).to.include("- Address: `" + NEW_ADDR + "`");
      expect(out).to.include("etherscan.io/address/" + NEW_ADDR);
      expect(out).to.not.include(OLD_ADDR);
    });
  });

  describe("formatHumanReadableAbi", function () {
    const abi = [
      { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
      { type: "event", name: "Ping", inputs: [{ name: "x", type: "uint256", indexed: false }] },
      { type: "constructor", stateMutability: "nonpayable", inputs: [] },
    ];

    it("returns human-readable signatures without the constructor", function () {
      const lines = formatHumanReadableAbi(abi);
      expect(lines).to.be.an("array");
      expect(lines.some((l) => /function owner\(\)/.test(l))).to.be.true;
      expect(lines.some((l) => /event Ping\(uint256 x\)/.test(l))).to.be.true;
      expect(lines.some((l) => /constructor/.test(l))).to.be.false;
    });
  });

  describe("updateUseContractAbi", function () {
    const source = [
      'import { ethers } from "ethers";',
      "",
      "const CONTRACT_ABI = [",
      '  "function owner() view returns (address)",',
      '  "event Old(uint256 a)",',
      "];",
      "",
      "const RPC_URL = 'x';",
    ].join("\n");

    it("swaps the array body while preserving surrounding code", function () {
      const out = updateUseContractAbi(source, [
        "function owner() view returns (address)",
        "function foo(uint256 a)",
      ]);
      expect(out).to.include('import { ethers } from "ethers";');
      expect(out).to.include("const RPC_URL = 'x';");
      expect(out).to.include('  "function foo(uint256 a)",');
      expect(out).to.not.include('"event Old(uint256 a)"');
      // still a single well-formed declaration
      expect((out.match(/const CONTRACT_ABI = \[/g) || []).length).to.equal(1);
    });

    it("throws if the CONTRACT_ABI anchor is missing", function () {
      expect(() => updateUseContractAbi("no abi here", ["function x()"])).to.throw(/CONTRACT_ABI/);
    });
  });
});
