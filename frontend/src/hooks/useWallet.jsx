import { createContext, useContext, useState, useCallback } from "react";
import { ethers } from "ethers";
import { TARGET_CHAIN_ID } from "../contract/config";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount]   = useState(null);   
  const [provider, setProvider] = useState(null);   

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert(
        "MetaMask is not installed.\n\nPlease install it from https://metamask.io and refresh the page."
      );
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
      const chainId    = parseInt(chainIdHex, 16);

      if (chainId !== TARGET_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchErr) {
          
          if (switchErr.code === 4902) {
            alert("Please add the Hardhat local network (Chain ID 31337, RPC http://127.0.0.1:8545) to MetaMask manually.");
          } else {
            alert("Please switch MetaMask to the Hardhat local network (Chain ID 31337) and try again.");
          }
          return;
        }
      }

      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(ethersProvider);
      setAccount(accounts[0]);

      window.ethereum.on("accountsChanged", (newAccounts) => {
        if (newAccounts.length === 0) {
          setAccount(null);
          setProvider(null);
        } else {
          setAccount(newAccounts[0]);
        }
      });

      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
  }, []);

  return (
    <WalletContext.Provider value={{ account, provider, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
