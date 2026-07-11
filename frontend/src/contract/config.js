
export const CONTRACT_ADDRESS = "0x7bBfd6cbDf35959649611b6D7A49b8e745b64a8a";

export const DEPLOY_BLOCK = 11245554;

export const SEPOLIA_CHAIN_ID = 11155111;
export const LOCAL_CHAIN_ID   = 31337;

export const TARGET_CHAIN_ID = SEPOLIA_CHAIN_ID;


export const ADMIN_WALLETS = [];
export const CHECKIN_STAFF_WALLETS = [];


// Secrets live in frontend/.env (see .env.example); never commit real keys.
export const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";
