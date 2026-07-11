import { useState } from "react";
import { ethers } from "ethers";
import { useContract } from "../hooks/useContract";
import DescriptionPreview from "./DescriptionPreview";

export default function TicketCard({ tokenId, info, isOwned, onRefresh }) {
  const { setTicketPrice } = useContract();
  const [newPrice, setNewPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleRelist() {
    if (!newPrice) return;
    setLoading(true);
    setMsg("");
    try {
      await setTicketPrice(tokenId, parseFloat(newPrice), true);
      setMsg("Ticket listed for sale.");
      setNewPrice("");
      onRefresh?.();
    } catch (e) {
      setMsg("Error: " + (e.reason || e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelist() {
    setLoading(true);
    setMsg("");
    try {
      await setTicketPrice(tokenId, parseFloat(ethers.formatEther(info.currentPrice)), false);
      setMsg("Ticket delisted.");
      onRefresh?.();
    } catch (e) {
      setMsg("Error: " + (e.reason || e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = info.isUsed
    ? { text: "Used", cls: "chip bg-spent/15 text-spent" }
    : info.forSaleStatus
      ? { text: "For sale", cls: "chip bg-live/15 text-live" }
      : { text: "Not listed", cls: "chip bg-white/10 text-mist" };

  return (
    <div className="overflow-hidden">
      {info.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-panel2">
          <img
            src={info.imageUrl}
            alt={`${info.eventName || "Event"} ticket poster`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg font-bold leading-tight">
              {info.eventName || `Event #${Number(info.eventId)}`}
            </p>
            <p className="mt-0.5 font-mono text-xs text-mist">
              {info.eventDate}
              {info.venue ? ` · ${info.venue}` : ""}
            </p>
          </div>
          <span className={statusLabel.cls}>{statusLabel.text}</span>
        </div>

        <DescriptionPreview
          text={info.description}
          modalTitle={`${info.eventName || "Event"} Description`}
        />

        <div className="mb-1 space-y-0.5 font-mono text-xs text-mist">
          <p>
            price{" "}
            <span className="font-semibold text-spotlight">
              {ethers.formatEther(info.currentPrice)} ETH
            </span>
          </p>
          <p>cap {ethers.formatEther(info.maxAllowedPrice)} ETH</p>
          <p>
            resales {Number(info.totalResales)} /{" "}
            {Number(info.maxResales) === 0 ? "∞" : Number(info.maxResales)}
          </p>
        </div>

        {isOwned && !info.isUsed && (
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              step="0.001"
              min="0"
              placeholder="Price (ETH)"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="input-dark w-28 px-2 py-1 font-mono text-xs"
            />
            <button
              onClick={handleRelist}
              disabled={loading || !newPrice}
              className="btn-spot px-3 py-1 text-xs"
            >
              {loading ? "…" : "List for resale"}
            </button>
            {info.forSaleStatus && (
              <button onClick={handleDelist} disabled={loading} className="btn-ghost px-3 py-1 text-xs">
                Delist
              </button>
            )}
          </div>
        )}

        {msg && (
          <p className={`mt-2 text-xs ${msg.startsWith("Error") ? "text-spent" : "text-live"}`}>
            {msg}
          </p>
        )}
      </div>

      {/* Ticket stub: perforated tear line, seat number, barcode */}
      <div className="ticket-tear mx-0 mt-1">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="eyebrow">Seat</p>
            <p className="font-mono text-2xl font-semibold tracking-wide text-paper">
              {info.seatLabel || `Seat ${Number(info.seatId) + 1}`}
            </p>
            {info.seatLocation && (
              <p className="mt-0.5 font-mono text-[11px] text-mist">{info.seatLocation}</p>
            )}
          </div>
          <div className="min-w-0 flex-1 text-right">
            <div className="barcode ml-auto max-w-[140px] text-paper" aria-hidden="true" />
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-mist/70">
              No. {String(tokenId).padStart(6, "0")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
