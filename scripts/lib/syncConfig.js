// Pure text transforms used by scripts/deploySync.js to keep the frontend in
// sync with a freshly deployed contract. Kept side-effect free so they can be
// unit tested without touching the chain or the filesystem.

const { ethers } = require("ethers");

function updateConfigSource(source, { address, deployBlock }) {
  if (!/export const CONTRACT_ADDRESS = "0x[0-9a-fA-F]+";/.test(source)) {
    throw new Error("Could not find CONTRACT_ADDRESS in config source.");
  }
  if (!/export const DEPLOY_BLOCK = \d+;/.test(source)) {
    throw new Error("Could not find DEPLOY_BLOCK in config source.");
  }

  return source
    .replace(
      /export const CONTRACT_ADDRESS = "0x[0-9a-fA-F]+";/,
      `export const CONTRACT_ADDRESS = "${address}";`
    )
    .replace(/export const DEPLOY_BLOCK = \d+;/, `export const DEPLOY_BLOCK = ${deployBlock};`);
}

function updateReadmeSource(source, { address }) {
  // Replace any 0x40-hex address on Address:/Etherscan lines with the new one.
  return source
    .replace(/(- Address: `)0x[0-9a-fA-F]{40}(`)/, `$1${address}$2`)
    .replace(/(etherscan\.io\/address\/)0x[0-9a-fA-F]{40}/g, `$1${address}`);
}

function formatHumanReadableAbi(abiJson) {
  const iface = ethers.Interface.from(abiJson);
  return iface
    .format() // full human-readable signatures, with parameter names
    .filter((line) => !/^\s*constructor/.test(line));
}

function updateUseContractAbi(source, abiLines) {
  const anchor = /const CONTRACT_ABI = \[[\s\S]*?\n\];/;
  if (!anchor.test(source)) {
    throw new Error("Could not find CONTRACT_ABI array in useContract source.");
  }
  const body = abiLines.map((line) => `  ${JSON.stringify(line)},`).join("\n");
  return source.replace(anchor, `const CONTRACT_ABI = [\n${body}\n];`);
}

module.exports = {
  updateConfigSource,
  updateReadmeSource,
  formatHumanReadableAbi,
  updateUseContractAbi,
};
