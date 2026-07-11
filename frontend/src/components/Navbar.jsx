import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";

function shortenAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

export default function Navbar({ role = "guest", roleLoading = false }) {
  const { account, connect, disconnect } = useWallet();

  const showCustomerLinks = account && !roleLoading && role === "customer";
  const showAdminLinks = account && !roleLoading && role === "admin";

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-night/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-paper transition hover:text-spotlight"
          >
            NFTicket
          </Link>
          <Link to="/" className="text-sm text-mist transition hover:text-paper">
            Events
          </Link>
          {showCustomerLinks && (
            <Link to="/my-tickets" className="text-sm text-mist transition hover:text-paper">
              My Tickets
            </Link>
          )}
          {showAdminLinks && (
            <Link to="/admin" className="text-sm text-mist transition hover:text-paper">
              Administrator
            </Link>
          )}
        </div>

        <div>
          {account ? (
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/10 bg-panel px-3 py-1 font-mono text-xs text-mist">
                {shortenAddress(account)}
              </span>
              <button onClick={disconnect} className="btn-ghost px-3 py-1 text-xs">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={connect} className="btn-spot px-4 py-1.5">
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
