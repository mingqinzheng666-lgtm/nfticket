const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const NFTicket = await hre.ethers.getContractFactory("NFTicket");
  console.log("Deploying NFTicket...");

  const nfticket = await NFTicket.deploy();
  await nfticket.waitForDeployment();

  const address = await nfticket.getAddress();
  const receipt = await nfticket.deploymentTransaction()?.wait();
  const deployBlock = receipt?.blockNumber ?? null;
  console.log("\nNFTicket deployed to:", address);
  console.log("Deployed at block:", deployBlock);
  console.log("\nNext steps:");
  console.log("1. Update frontend/src/contract/config.js with CONTRACT_ADDRESS =", `"${address}"`);
  console.log("2. Run: npm run compile  (copies ABI to frontend)");

  if (hre.network.name === "sepolia") {
    console.log("\nTo verify on Etherscan Sepolia:");
    console.log(`  npx hardhat verify --network sepolia ${address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
