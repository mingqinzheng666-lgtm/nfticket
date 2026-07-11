import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useContract } from "../hooks/useContract";

export default function BuyModal({
  type,
  eventId,
  tokenId,
  priceWei,
  name,
  seatOptions = [],
  onClose,
  onSuccess,
}) {
  const { buyFromEvent, buyTicket } = useContract();
  const [status, setStatus] = useState("idle"); // idle | pending | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedArea, setSelectedArea] = useState("");

  const isPrimary = type === "primary";
  const availableSeats = useMemo(
    () => seatOptions.filter((s) => !s.taken),
    [seatOptions]
  );

  function getAreaKey(seat) {
    const raw = String(seat?.section || "").trim().toUpperCase();
    return raw || "GENERAL";
  }

  const areaOptions = useMemo(() => {
    const counts = new Map();
    for (const seat of availableSeats) {
      const area = getAreaKey(seat);
      counts.set(area, (counts.get(area) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([area, count]) => ({
      area,
      label: area === "GENERAL" ? `General (${count} left)` : `Area ${area} (${count} left)`,
      count,
    }));
  }, [availableSeats]);

  useEffect(() => {
    if (!isPrimary) return;
    if (areaOptions.length === 0) {
      setSelectedArea("");
      return;
    }
    if (!areaOptions.some((a) => a.area === selectedArea)) {
      setSelectedArea(areaOptions[0].area);
    }
  }, [isPrimary, areaOptions, selectedArea]);

  async function handleBuy() {
    setStatus("pending");
    setErrorMsg("");

    try {
      if (isPrimary) {
        if (!selectedArea) {
          throw new Error("Please choose an available area.");
        }

        const areaSeats = availableSeats
          .filter((s) => getAreaKey(s) === selectedArea)
          .sort((a, b) => Number(a.id) - Number(b.id));
        const nextSeat = areaSeats[0];
        if (!nextSeat) {
          throw new Error("No seats left in selected area.");
        }

        await buyFromEvent(eventId, Number(nextSeat.id), priceWei);
      } else {
        await buyTicket(tokenId, priceWei);
      }
      setStatus("success");
      onSuccess?.();
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.reason || e.message || "Transaction failed");
    }
  }

  const title = isPrimary
    ? `Buy ticket — ${name ?? `Event #${eventId}`}`
    : "Buy resale ticket";

  const feeNote = isPrimary
    ? "Platform fee (2%) deducted from primary sale"
    : "Platform fee (2%) deducted from seller";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-80 animate-rise p-6 shadow-lift">
        <h2 className="mb-4 font-display text-xl font-bold">{title}</h2>

        {isPrimary && (
          <div className="mb-4 space-y-1 rounded-xl border border-white/10 bg-panel2 p-3">
            <label htmlFor="buy-area-select" className="text-xs font-medium text-mist">
              Choose area
            </label>
            <select
              id="buy-area-select"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="input-dark px-2 py-1"
              disabled={status === "pending" || areaOptions.length === 0}
            >
              {areaOptions.length === 0 ? (
                <option value="">No areas available</option>
              ) : (
                areaOptions.map((area) => (
                  <option key={area.area} value={area.area}>
                    {area.label}
                  </option>
                ))
              )}
            </select>
            {selectedArea && (
              <p className="text-xs text-mist/70">
                Seat is auto-assigned from{" "}
                <span className="font-medium text-paper">
                  {selectedArea === "GENERAL" ? "General" : `Area ${selectedArea}`}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mb-4 space-y-1 rounded-xl border border-white/10 bg-panel2 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-mist">Ticket price</span>
            <span className="font-mono font-semibold">{ethers.formatEther(priceWei)} ETH</span>
          </div>
          <div className="flex justify-between text-xs text-mist/60">
            <span>{feeNote}</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-1 text-sm font-bold">
            <span>You pay</span>
            <span className="font-mono text-spotlight">{ethers.formatEther(priceWei)} ETH</span>
          </div>
        </div>

        {status === "idle" && (
          <button
            onClick={handleBuy}
            disabled={isPrimary && areaOptions.length === 0}
            className="btn-spot w-full py-2.5"
          >
            Confirm purchase
          </button>
        )}

        {status === "pending" && (
          <div className="py-2 text-center">
            <p className="text-sm font-medium text-spotlight">
              Waiting for MetaMask confirmation…
            </p>
            <p className="mt-1 text-xs text-mist/60">Check the MetaMask extension popup.</p>
          </div>
        )}

        {status === "success" && (
          <div className="py-2 text-center">
            <p className="font-display text-lg font-bold text-live">Purchase successful!</p>
            <p className="mt-1 text-xs text-mist/60">The ticket NFT is now in your wallet.</p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-spent/30 bg-spent/10 p-3">
            <p className="text-sm font-medium text-spent">Transaction failed</p>
            <p className="mt-1 break-words text-xs text-spent/80">{errorMsg}</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full text-sm text-mist/60 transition hover:text-mist"
        >
          {status === "success" ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
