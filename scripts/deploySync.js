// Deploy NFTicket AND sync every place the frontend/docs record the contract,
// in one command. Run this after any change to contracts/*.sol.
//
//   npx hardhat run scripts/deploySync.js --network sepolia
//
// It: (1) compiles, (2) deploys (deployer wallet becomes the new owner),
// (3) rewrites CONTRACT_ADDRESS + DEPLOY_BLOCK in frontend config, (4) copies
// the ABI JSON to the frontend, (5) regenerates the inline human-readable ABI
// in useContract.js from the compiled artifact (killing the manual-sync pitfall),
// and (6) updates the contract address in README.
//
// NOTE: this deploys a brand-new contract, so the address changes and any data
// on the previous contract is left frozen. Only run when you actually want a
// fresh deployment.

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const {
  updateConfigSource,
  updateReadmeSource,
  updateUseContractAbi,
  formatHumanReadableAbi,
} = require("./lib/syncConfig");

const ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "frontend", "src", "contract", "config.js");
const README_PATH = path.join(ROOT, "README.md");
const USECONTRACT_PATH = path.join(ROOT, "frontend", "src", "hooks", "useContract.js");
const ARTIFACT_PATH = path.join(ROOT, "artifacts", "contracts", "NFTicket.sol", "NFTicket.json");
const FRONTEND_ABI_JSON = path.join(ROOT, "frontend", "src", "contract", "NFTicketABI.json");

function rewrite(file, transform) {
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  fs.writeFileSync(file, after);
  console.log(`  updated ${path.relative(ROOT, file)}`);
}

async function main() {
  console.log("Compiling…");
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying with ${deployer.address} on ${hre.network.name}…`);

  const Factory = await hre.ethers.getContractFactory("NFTicket");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction().wait();
  const deployBlock = receipt.blockNumber;

  console.log(`\nDeployed to ${address} (block ${deployBlock})\n`);
  console.log("Syncing frontend & docs…");

  rewrite(CONFIG_PATH, (src) => updateConfigSource(src, { address, deployBlock }));
  rewrite(README_PATH, (src) => updateReadmeSource(src, { address }));

  fs.copyFileSync(ARTIFACT_PATH, FRONTEND_ABI_JSON);
  console.log(`  copied ${path.relative(ROOT, FRONTEND_ABI_JSON)}`);

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const abiLines = formatHumanReadableAbi(artifact.abi);
  rewrite(USECONTRACT_PATH, (src) => updateUseContractAbi(src, abiLines));

  console.log(`\nDone. New owner: ${deployer.address}`);
  console.log("Hard-refresh the frontend; re-seed demo data if you want events.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
