import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../hooks/useWallet";
import BuyModal from "../components/BuyModal";
import VenueMapModal from "../components/VenueMapModal";
import DescriptionPreview from "../components/DescriptionPreview";
import { fetchNftMetadata, fetchSeatMap } from "../utils/ipfs";
import { CHECKIN_STAFF_WALLETS } from "../contract/config";
import { buildEntryPassMessage, normalizeEntryPassPayload } from "../utils/entryPass";
import {
  buildStaffDirectory,
  listStaffPasses,
  registerActiveStaff,
  updateStaffPass,
} from "../utils/staffInbox";

function makeFallbackSeats(totalTickets) {
  const total = Number(totalTickets || 0);
  return Array.from({ length: total }, (_, i) => ({
    id: i,
    label: `Seat ${i + 1}`,
    section: "",
    row: "",
    number: i + 1,
    location: "",
  }));
}

export default function Home({ role = "guest", roleLoading = false }) {
  const { getNextEventId, getEventDetails, getNextTokenId, getTicketInfo, checkIn } = useContract();
  const { account, connect } = useWallet();

  const [events, setEvents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyModal, setBuyModal] = useState(null);
  const [venueMapModal, setVenueMapModal] = useState(null);

  const [staffPasses, setStaffPasses] = useState([]);
  const [selectedCheckInEventId, setSelectedCheckInEventId] = useState(null);
  const [passOps, setPassOps] = useState({});

  const isCustomer = account && !roleLoading && role === "customer";
  const isCheckInStaff = account && !roleLoading && role === "checkin";
  const canViewVenueMap = !account || isCustomer;

  const staffDirectory = useMemo(
    () => buildStaffDirectory(CHECKIN_STAFF_WALLETS || []),
    []
  );

  const currentStaff = useMemo(() => {
    const acc = String(account || "").toLowerCase();
    return staffDirectory.find((s) => s.address === acc) || null;
  }, [account, staffDirectory]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isCheckInStaff || !account) {
      setStaffPasses([]);
      setSelectedCheckInEventId(null);
      return;
    }

    const refresh = () => {
      const rows = listStaffPasses(account, { includeProcessed: false });
      setStaffPasses(rows);
    };

    refresh();
    const timer = window.setInterval(refresh, 2000);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [isCheckInStaff, account]);

  async function loadData() {
    setLoading(true);
    try {
      const [numEvents, numTickets] = await Promise.all([getNextEventId(), getNextTokenId()]);

      const eventRows = (
        await Promise.all(
          Array.from({ length: numEvents }, (_, i) => i).map(async (i) => {
            try {
              const ev = await getEventDetails(i);
              if (!ev?.isActive) return null;

              const [metadata, seatMap] = await Promise.all([
                fetchNftMetadata(ev.metadataURI).catch(() => null),
                fetchSeatMap(ev.seatMapURI).catch(() => ({ seats: [] })),
              ]);

              const seats = seatMap.seats?.length
                ? seatMap.seats
                : makeFallbackSeats(ev.totalTickets);

              return {
                id: i,
                ...ev,
                name: metadata?.name || `Event #${i}`,
                date: metadata?.date || "",
                description: metadata?.description || "",
                imageUrl: metadata?.imageUrl || "",
                venue: metadata?.venue || "",
                seatMapImageUrl: seatMap?.imageUrl || "",
                seats,
              };
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);

      setEvents(eventRows);
      const eventMap = new Map(eventRows.map((e) => [e.id, e]));

      const tkArr = (
        await Promise.all(
          Array.from({ length: numTickets }, (_, i) => i).map(async (i) => {
            try {
              const info = await getTicketInfo(i);
              const eventId = Number(info.eventId);
              const event = eventMap.get(eventId);
              if (!event) return null;
              const seatId = Number(info.seatId);
              const seatLabel =
                event?.seats?.find((s) => Number(s.id) === seatId)?.label || `Seat ${seatId + 1}`;

              return {
                id: i,
                ...info,
                seatLabel,
                eventName: event?.name || `Event #${eventId}`,
                eventDate: event?.date || "",
                description: event?.description || "",
                imageUrl: event?.imageUrl || "",
                seatMapImageUrl: event?.seatMapImageUrl || "",
              };
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);

      setTickets(tkArr);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCheckInEventId === null || selectedCheckInEventId === undefined) return;
    const exists = events.some((event) => Number(event.id) === Number(selectedCheckInEventId));
    if (!exists) setSelectedCheckInEventId(null);
  }, [events, selectedCheckInEventId]);

  const eventMapById = useMemo(
    () => new Map(events.map((event) => [Number(event.id), event])),
    [events]
  );

  const secondaryTickets = useMemo(
    () => tickets.filter((t) => t.forSaleStatus && !t.isUsed),
    [tickets]
  );

  const staffPassesByEvent = useMemo(() => {
    const map = new Map();
    for (const pass of staffPasses) {
      const eventId = Number(pass.eventId);
      if (!map.has(eventId)) map.set(eventId, []);
      map.get(eventId).push(pass);
    }
    return map;
  }, [staffPasses]);

  const selectedEventPasses = useMemo(() => {
    if (selectedCheckInEventId === null || selectedCheckInEventId === undefined) return [];
    return staffPassesByEvent.get(Number(selectedCheckInEventId)) || [];
  }, [selectedCheckInEventId, staffPassesByEvent]);

  function setPassOp(passId, next) {
    setPassOps((prev) => ({
      ...prev,
      [passId]: {
        ...(prev[passId] || {}),
        ...next,
      },
    }));
  }

  async function handleStartVerify(pass) {
    setPassOp(pass.id, { loading: true, isError: false, message: "Verifying..." });
    try {
      const payload = normalizeEntryPassPayload(pass.payload || {});
      if (!payload.signature) throw new Error("Missing pass signature.");

      const now = Date.now();
      if (now > payload.expiresAt) throw new Error("Entry pass expired.");

      const ticket = await getTicketInfo(payload.tokenId);
      if (ticket.isUsed) throw new Error("Ticket already checked in.");

      if (Number(ticket.eventId) !== payload.eventId) {
        throw new Error("Pass event mismatch.");
      }

      if (Number(ticket.seatId) !== payload.seatId) {
        throw new Error("Pass seat mismatch.");
      }

      const holder = String(payload.holder || "").toLowerCase();
      const ownerOnChain = String(ticket.currentOwner || "").toLowerCase();
      if (holder !== ownerOnChain) {
        throw new Error("Pass holder does not match current owner.");
      }

      const signedMessage = buildEntryPassMessage(payload);
      const recovered = ethers.verifyMessage(signedMessage, payload.signature).toLowerCase();
      if (recovered !== holder) {
        throw new Error("Signature verification failed.");
      }

      updateStaffPass(pass.id, { status: "verified", error: "" });
      setPassOp(pass.id, { loading: false, isError: false, message: "Verification success." });
      setStaffPasses(listStaffPasses(account, { includeProcessed: false }));
    } catch (err) {
      const message = err?.reason || err?.message || "Verification failed.";
      updateStaffPass(pass.id, { status: "invalid", error: message });
      setPassOp(pass.id, { loading: false, isError: true, message });
      setStaffPasses(listStaffPasses(account, { includeProcessed: false }));
    }
  }

  async function handleConfirmCheckIn(pass) {
    setPassOp(pass.id, { loading: true, isError: false, message: "Submitting check-in..." });
    try {
      const payload = normalizeEntryPassPayload(pass.payload || {});
      await checkIn(payload.tokenId);
      updateStaffPass(pass.id, { status: "checked_in", error: "" });
      setPassOp(pass.id, { loading: false, isError: false, message: "Checked in successfully." });
      setStaffPasses(listStaffPasses(account, { includeProcessed: false }));
      loadData();
    } catch (err) {
      setPassOp(pass.id, {
        loading: false,
        isError: true,
        message: err?.reason || err?.message || "Check-in transaction failed.",
      });
    }
  }

  function openCheckInQueue(eventId) {
    if (account) registerActiveStaff(account, eventId);
    setSelectedCheckInEventId(eventId);
  }

  if (loading) {
    return (
      <div className="animate-rise">
        <div className="skeleton h-52 w-full sm:h-64" />
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="skeleton h-72" />
          <div className="skeleton hidden h-72 md:block" />
          <div className="skeleton hidden h-72 md:block" />
        </div>
        <p className="mt-6 text-center font-mono text-xs text-mist">
          Loading events from the blockchain…
        </p>
      </div>
    );
  }

  const statusChipClass = (status) =>
    status === "verified"
      ? "chip bg-live/15 text-live"
      : status === "invalid"
        ? "chip bg-spent/15 text-spent"
        : "chip bg-white/10 text-mist";

  return (
    <div>
      {isCheckInStaff ? (
        <header className="mb-8 animate-rise">
          <p className="eyebrow mb-2">Check-in console{currentStaff ? ` · ${currentStaff.name}` : ""}</p>
          <h1 className="font-display text-3xl font-bold">Events</h1>
        </header>
      ) : (
        <section className="hero-beams card relative mb-12 animate-rise overflow-hidden px-6 py-12 sm:px-10 sm:py-16">
          <p className="eyebrow mb-3">On-chain ticketing</p>
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight text-paper sm:text-5xl">
            Tickets scalpers can&rsquo;t touch.
          </h1>
          <p className="mt-4 max-w-xl text-mist">
            Every ticket is an NFT. Price ceilings, resale limits and check-in are enforced by the
            contract — not by promises.
          </p>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.18em] text-mist/70">
            Resale price cap &middot; Limited resale count &middot; On-chain check-in
          </p>
        </section>
      )}

      {!isCheckInStaff && (
        <div className="mb-5">
          <p className="eyebrow mb-1">Primary sale</p>
          <h2 className="font-display text-2xl font-bold">Events</h2>
        </div>
      )}

      {events.length === 0 ? (
        <div className="card mb-12 p-10 text-center">
          <p className="text-mist">No events yet.</p>
          <p className="mt-1 text-sm text-mist/60">An admin creates the first one.</p>
        </div>
      ) : (
        <div className="mb-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {events.map((ev) => {
            const minted = Number(ev.ticketsMinted);
            const total = Number(ev.totalTickets);
            const soldOut = minted >= total;
            const pct = total > 0 ? Math.round((minted / total) * 100) : 0;

            const takenSeatIds = new Set(
              tickets
                .filter((t) => Number(t.eventId) === ev.id)
                .map((t) => Number(t.seatId))
            );
            const seatOptions = (ev.seats || []).map((s) => ({
              ...s,
              taken: takenSeatIds.has(Number(s.id)),
            }));

            const checkInCount = (staffPassesByEvent.get(Number(ev.id)) || []).filter(
              (p) => p.status === "pending" || p.status === "verified"
            ).length;

            return (
              <article key={ev.id} className="card card-hover group overflow-hidden">
                {ev.imageUrl && (
                  <div className="aspect-[16/9] w-full overflow-hidden bg-panel2">
                    <img
                      src={ev.imageUrl}
                      alt={`${ev.name} poster`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="p-5">
                  <h3 className="font-display text-lg font-bold leading-tight">{ev.name}</h3>
                  <p className="mb-3 mt-1 font-mono text-xs text-mist">
                    {ev.date}
                    {ev.venue ? ` · ${ev.venue}` : ""}
                  </p>
                  <DescriptionPreview
                    text={ev.description}
                    modalTitle={`${ev.name} Description`}
                  />
                  {canViewVenueMap && !isCheckInStaff && (
                    <div className="mb-4 h-9">
                      {ev.seatMapImageUrl ? (
                        <button
                          onClick={() =>
                            setVenueMapModal({
                              title: `${ev.name} - Venue Map`,
                              imageUrl: ev.seatMapImageUrl,
                            })
                          }
                          className="btn-ghost h-9 px-3 text-xs"
                        >
                          View venue map
                        </button>
                      ) : (
                        <div className="flex h-9 w-36 items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-mist/60">
                          No venue map
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mb-4">
                    <div className="mb-1.5 flex justify-between font-mono text-[11px] text-mist">
                      <span>
                        {minted} / {total} sold
                      </span>
                      <span className={soldOut ? "text-spent" : ""}>
                        {soldOut ? "Sold out" : `${total - minted} left`}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/10">
                      <div
                        className="h-1 rounded-full bg-spotlight"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xl font-semibold text-spotlight">
                        {ethers.formatEther(ev.ticketPrice)} ETH
                      </p>
                      <p className="font-mono text-[11px] text-mist">
                        resale cap {ethers.formatEther(ev.maxResalePrice)} ETH
                      </p>
                    </div>

                    {isCheckInStaff ? (
                      <button onClick={() => openCheckInQueue(ev.id)} className="btn-spot">
                        Check in ({checkInCount})
                      </button>
                    ) : soldOut ? (
                      <span className="chip bg-spent/15 uppercase text-spent">Sold out</span>
                    ) : !account ? (
                      <button onClick={connect} className="btn-spot">
                        Connect
                      </button>
                    ) : isCustomer ? (
                      <button
                        onClick={() =>
                          setBuyModal({
                            type: "primary",
                            eventId: ev.id,
                            priceWei: ev.ticketPrice,
                            name: ev.name,
                            seatOptions,
                          })
                        }
                        className="btn-spot"
                      >
                        Buy ticket
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isCheckInStaff && selectedCheckInEventId !== null && (
        <section className="card mb-10 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow mb-1">Check-in queue</p>
              <h2 className="font-display text-xl font-bold">
                {eventMapById.get(Number(selectedCheckInEventId))?.name ||
                  `Event #${selectedCheckInEventId}`}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCheckInEventId(null)}
              className="btn-ghost px-3 py-1 text-xs"
            >
              Close
            </button>
          </div>

          {selectedEventPasses.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-panel2 p-4 text-sm text-mist">
              No pass assigned to you for this event yet. Passes appear here when a ticket holder
              sends one.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEventPasses.map((pass) => {
                const payload = normalizeEntryPassPayload(pass.payload || {});
                const eventInfo = eventMapById.get(Number(pass.eventId));
                const seatLabel =
                  eventInfo?.seats?.find((s) => Number(s.id) === Number(pass.seatId))?.label ||
                  `Seat ${Number(pass.seatId) + 1}`;

                const op = passOps[pass.id] || {};
                const canVerify = pass.status === "pending" || pass.status === "invalid";
                const canCheckIn = pass.status === "verified";

                return (
                  <div key={pass.id} className="rounded-xl border border-white/10 bg-panel2 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {eventInfo?.name || "Event"} —{" "}
                        <span className="font-mono text-spotlight">{seatLabel}</span>
                      </p>
                      <span className={statusChipClass(pass.status)}>{pass.status}</span>
                    </div>

                    <p className="font-mono text-xs text-mist">
                      holder {payload.holder || "-"}
                    </p>
                    <p className="font-mono text-xs text-mist">
                      expires{" "}
                      {payload.expiresAt ? new Date(payload.expiresAt).toLocaleString() : "-"}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canVerify && (
                        <button
                          onClick={() => handleStartVerify(pass)}
                          disabled={op.loading}
                          className="btn-spot px-3 py-1.5 text-xs"
                        >
                          {op.loading ? "Verifying…" : "Verify pass"}
                        </button>
                      )}
                      {canCheckIn && (
                        <button
                          onClick={() => handleConfirmCheckIn(pass)}
                          disabled={op.loading}
                          className="btn-spot px-3 py-1.5 text-xs"
                        >
                          {op.loading ? "Submitting…" : "Confirm check-in"}
                        </button>
                      )}
                    </div>

                    {pass.error && <p className="mt-2 text-xs text-spent">{pass.error}</p>}
                    {op.message && (
                      <p className={`mt-2 text-xs ${op.isError ? "text-spent" : "text-live"}`}>
                        {op.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!isCheckInStaff && (
        <>
          <div className="mb-5">
            <p className="eyebrow mb-1">Secondary market</p>
            <h2 className="font-display text-2xl font-bold">Resale tickets</h2>
          </div>

          {secondaryTickets.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-mist">Nothing on resale right now.</p>
              <p className="mt-1 text-sm text-mist/60">
                Tickets appear here when holders list them — always at or below the on-chain price
                cap.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {secondaryTickets.map((t) => {
                const isOwnListing =
                  account && t.currentOwner?.toLowerCase() === account.toLowerCase();
                const eventRef = eventMapById.get(Number(t.eventId));
                const displayEventName =
                  eventRef?.name || t.eventName || `Event #${Number(t.eventId)}`;
                const seatMapImageUrl = eventRef?.seatMapImageUrl || t.seatMapImageUrl || "";

                return (
                  <article key={t.id} className="card card-hover group overflow-hidden">
                    {t.imageUrl && (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-panel2">
                        <img
                          src={t.imageUrl}
                          alt={`Resale ticket for ${t.eventName || "event"}`}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="p-5">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <h3 className="font-display text-lg font-bold leading-tight">
                          {displayEventName}
                        </h3>
                        <span className="chip shrink-0 -rotate-3 border border-spotlight/50 uppercase tracking-wider text-spotlight">
                          Resale
                        </span>
                      </div>
                      <p className="mb-3 font-mono text-xs text-mist">
                        {t.eventDate}
                        {t.eventDate ? " · " : ""}
                        {t.seatLabel || `Seat ${Number(t.seatId) + 1}`}
                        {isOwnListing ? " · yours" : ""}
                      </p>

                      <p className="font-mono text-xl font-semibold text-spotlight">
                        {ethers.formatEther(t.currentPrice)} ETH
                      </p>
                      <p className="mb-3 font-mono text-[11px] text-mist">
                        cap {ethers.formatEther(t.maxAllowedPrice)} ETH · resales{" "}
                        {Number(t.totalResales)} /{" "}
                        {Number(t.maxResales) === 0 ? "∞" : Number(t.maxResales)}
                      </p>

                      {canViewVenueMap && (
                        <div className="mb-4 h-9">
                          {seatMapImageUrl ? (
                            <button
                              onClick={() =>
                                setVenueMapModal({
                                  title: `${displayEventName} - Venue Map`,
                                  imageUrl: seatMapImageUrl,
                                })
                              }
                              className="btn-ghost h-9 px-3 text-xs"
                            >
                              View venue map
                            </button>
                          ) : (
                            <div className="flex h-9 w-36 items-center justify-center rounded-lg border border-dashed border-white/15 text-xs text-mist/60">
                              No venue map
                            </div>
                          )}
                        </div>
                      )}
                      <DescriptionPreview
                        text={t.description}
                        modalTitle={`${displayEventName} Description`}
                      />

                      {!account ? (
                        <button onClick={connect} className="btn-spot w-full">
                          Connect
                        </button>
                      ) : isOwnListing ? (
                        <button disabled className="btn-ghost w-full">
                          Your listing
                        </button>
                      ) : isCustomer ? (
                        <button
                          onClick={() =>
                            setBuyModal({
                              type: "secondary",
                              tokenId: t.id,
                              priceWei: t.currentPrice,
                            })
                          }
                          className="btn-spot w-full"
                        >
                          Buy ticket
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {buyModal && (
        <BuyModal
          {...buyModal}
          onClose={() => setBuyModal(null)}
          onSuccess={() => {
            setBuyModal(null);
            loadData();
          }}
        />
      )}
      {venueMapModal && (
        <VenueMapModal
          title={venueMapModal.title}
          imageUrl={venueMapModal.imageUrl}
          onClose={() => setVenueMapModal(null)}
        />
      )}
    </div>
  );
}
