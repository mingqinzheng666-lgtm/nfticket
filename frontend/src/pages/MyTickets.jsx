import { useEffect, useMemo, useState } from "react";
import TicketCard from "../components/TicketCard";
import VenueMapModal from "../components/VenueMapModal";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../hooks/useWallet";
import { fetchNftMetadata, fetchSeatMap, uploadEntryPassToIpfs } from "../utils/ipfs";
import { buildEntryPassMessage, normalizeEntryPassPayload } from "../utils/entryPass";
import {
  buildStaffDirectory,
  findLatestIssuedPassForTicketHolder,
  listActiveStaff,
  listIssuedPassesForHolder,
  pushStaffPass,
} from "../utils/staffInbox";

const PASS_VALIDITY_MS = 5 * 60 * 1000;

function isPersistedPassValidForTicket(passRow, ticket, holderAddress) {
  if (!passRow || !ticket) return false;
  const holder = String(holderAddress || "").toLowerCase();
  if (!holder) return false;

  const payload = normalizeEntryPassPayload(passRow.payload || {});
  const tokenId = Number(ticket.id);
  const eventId = Number(ticket.eventId);
  const seatId = Number(ticket.seatId);

  if (Number(passRow.tokenId) !== tokenId) return false;
  if (Number(payload.tokenId) !== tokenId) return false;
  if (Number(payload.eventId) !== eventId) return false;
  if (Number(payload.seatId) !== seatId) return false;
  if (String(payload.holder || "").toLowerCase() !== holder) return false;
  if (Number(payload.expiresAt || 0) <= Date.now()) return false;

  return true;
}

export default function MyTickets() {
  const { getNextTokenId, getTicketInfo, getEventDetails } = useContract();
  const { account, connect, provider } = useWallet();

  const [myTickets, setMyTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [entryPasses, setEntryPasses] = useState({});
  const [venueMapModal, setVenueMapModal] = useState(null);

  const [activeStaffByEvent, setActiveStaffByEvent] = useState({});
  const [issuedPassByToken, setIssuedPassByToken] = useState({});

  useEffect(() => {
    if (account) loadMyTickets();
  }, [account]);

  const eventIds = useMemo(() => {
    const uniq = new Set(myTickets.map((t) => Number(t.eventId)));
    return Array.from(uniq).sort((a, b) => a - b);
  }, [myTickets]);

  useEffect(() => {
    const refresh = () => {
      const next = {};
      for (const eventId of eventIds) {
        next[eventId] = listActiveStaff(eventId);
      }
      setActiveStaffByEvent(next);

      const issued = listIssuedPassesForHolder(account || "");
      const issuedMap = {};
      for (const row of issued) {
        const tokenId = Number(row.tokenId);
        if (!Number.isFinite(tokenId)) continue;
        if (!issuedMap[tokenId]) issuedMap[tokenId] = row;
      }
      setIssuedPassByToken(issuedMap);
    };

    refresh();
    const timer = window.setInterval(refresh, 1500);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [account, eventIds]);

  async function loadMyTickets() {
    setLoading(true);
    try {
      const total = await getNextTokenId();

      // Fetch every ticket in parallel, keep only the connected wallet's ones
      const allInfos = await Promise.all(
        Array.from({ length: total }, (_, i) => i).map((i) =>
          getTicketInfo(i)
            .then((info) => ({ id: i, ...info }))
            .catch(() => null)
        )
      );
      const ownedInfos = allInfos.filter(
        (info) => info && info.currentOwner?.toLowerCase() === account.toLowerCase()
      );

      // Load each distinct event (details + metadata + seat map) once, in parallel
      const eventIds = [...new Set(ownedInfos.map((info) => Number(info.eventId)))];
      const eventEntries = await Promise.all(
        eventIds.map(async (eventId) => {
          try {
            const event = await getEventDetails(eventId);
            if (!event?.isActive) return [eventId, null];
            const [metadata, seatManifest] = await Promise.all([
              fetchNftMetadata(event.metadataURI).catch(() => null),
              fetchSeatMap(event.seatMapURI).catch(() => ({ seats: [] })),
            ]);
            return [eventId, { event, metadata, seatManifest }];
          } catch {
            return [eventId, null];
          }
        })
      );
      const eventById = new Map(eventEntries);

      const owned = ownedInfos
        .map((info) => {
          const eventId = Number(info.eventId);
          const loaded = eventById.get(eventId);
          if (!loaded) return null;

          const { metadata, seatManifest } = loaded;
          const seatId = Number(info.seatId);
          const seat = seatManifest?.seats?.find((s) => Number(s.id) === seatId);

          return {
            ...info,
            eventName: metadata?.name || `Event #${eventId}`,
            eventDate: metadata?.date || "",
            description: metadata?.description || "",
            imageUrl: metadata?.imageUrl || "",
            venue: metadata?.venue || "",
            seatMapImageUrl: seatManifest?.imageUrl || "",
            seatLabel: seat?.label || `Seat ${seatId + 1}`,
            seatLocation: seat?.location || "",
          };
        })
        .filter(Boolean);

      setMyTickets(owned);
    } catch (e) {
      console.error("Failed to load tickets:", e);
    } finally {
      setLoading(false);
    }
  }

  const sortedTickets = useMemo(
    () => [...myTickets].sort((a, b) => Number(a.id) - Number(b.id)),
    [myTickets]
  );

  function updateAssignedStaff(tokenId, value) {
    setEntryPasses((prev) => ({
      ...prev,
      [tokenId]: {
        ...(prev[tokenId] || {}),
        assignedStaff: String(value || "").toLowerCase(),
      },
    }));
  }

  async function createAndSendEntryPass(ticket) {
    if (!provider || !account) return;
    if (ticket.forSaleStatus) return;

    const tokenId = Number(ticket.id);
    const eventId = Number(ticket.eventId);
    const seatId = Number(ticket.seatId);
    const alreadyIssued = findLatestIssuedPassForTicketHolder(tokenId, account);
    if (isPersistedPassValidForTicket(alreadyIssued, ticket, account)) {
      const normalizedPayload = normalizeEntryPassPayload(alreadyIssued.payload || {});
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "ready",
          payload: normalizedPayload,
          passURI: alreadyIssued.passURI || "",
          assignedStaff: alreadyIssued.staffAddress || "",
          assignedStaffName: alreadyIssued.staffName || "",
          error: "Entry pass already generated for this ticket.",
          sentAt: Number(alreadyIssued.createdAt || Date.now()),
        },
      }));
      return;
    }

    if (entryPasses[tokenId]?.status === "pending") return;

    const eventStaffDirectory = buildStaffDirectory(activeStaffByEvent[eventId] || []);
    const assignedStaff = String(entryPasses[tokenId]?.assignedStaff || "").toLowerCase();
    const assignedStaffName = eventStaffDirectory.find((s) => s.address === assignedStaff)?.name || "";

    if (!assignedStaff) {
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "error",
          error: "Please select staff before generating pass.",
        },
      }));
      return;
    }

    if (!eventStaffDirectory.some((s) => s.address === assignedStaff)) {
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "error",
          error: "Selected staff is not active for this event.",
        },
      }));
      return;
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + PASS_VALIDITY_MS;

    const payload = normalizeEntryPassPayload({
      tokenId,
      eventId,
      seatId,
      holder: account,
      issuedAt,
      expiresAt,
      signature: "",
    });

    const message = buildEntryPassMessage(payload);
    setEntryPasses((prev) => ({
      ...prev,
      [tokenId]: {
        ...(prev[tokenId] || {}),
        status: "pending",
        payload: null,
        error: "",
      },
    }));

    try {
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);
      const signedPayload = normalizeEntryPassPayload({ ...payload, signature });
      const { passURI } = await uploadEntryPassToIpfs(
        signedPayload,
        `entry-pass-token-${tokenId}-${issuedAt}`
      );

      pushStaffPass({
        staffAddress: assignedStaff,
        staffName: assignedStaffName,
        payload: signedPayload,
        eventId,
        tokenId,
        seatId,
        passURI,
      });

      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "ready",
          payload: signedPayload,
          passURI,
          error: "",
          assignedStaff,
          assignedStaffName,
          sentAt: Date.now(),
        },
      }));
      setIssuedPassByToken((prev) => ({
        ...prev,
        [tokenId]: {
          tokenId,
          eventId,
          seatId,
          createdAt: Date.now(),
          passURI,
          payload: signedPayload,
          staffAddress: assignedStaff,
          staffName: assignedStaffName,
        },
      }));
    } catch (err) {
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "error",
          payload: null,
          error: err?.reason || err?.message || "Signing or sending failed",
        },
      }));
    }
  }

  if (!account) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-lg text-mist">Connect your wallet to see your tickets.</p>
        <button onClick={connect} className="btn-spot px-6">
          Connect wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-rise">
        <div className="mb-6">
          <p className="eyebrow mb-1">Your wallet</p>
          <h1 className="font-display text-3xl font-bold">My Tickets</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="skeleton h-96" />
          <div className="skeleton hidden h-96 md:block" />
          <div className="skeleton hidden h-96 xl:block" />
        </div>
        <p className="mt-6 text-center font-mono text-xs text-mist">
          Scanning the blockchain for your tickets…
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Your wallet</p>
          <h1 className="font-display text-3xl font-bold">My Tickets</h1>
        </div>
        <button onClick={loadMyTickets} className="btn-ghost px-3 py-1.5 text-xs">
          Refresh
        </button>
      </div>

      {sortedTickets.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-lg text-mist">No tickets in this wallet yet.</p>
          <p className="mt-1 text-sm text-mist/60">
            Browse the{" "}
            <a href="/" className="text-spotlight hover:underline">
              Events
            </a>{" "}
            page to buy one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedTickets.map((t) => {
            const rawPersistedPass = issuedPassByToken[Number(t.id)] || null;
            const persistedIssuedPass = isPersistedPassValidForTicket(rawPersistedPass, t, account)
              ? rawPersistedPass
              : null;
            const persistedPassState = persistedIssuedPass
              ? {
                  status: "ready",
                  payload: normalizeEntryPassPayload(persistedIssuedPass.payload || {}),
                  passURI: persistedIssuedPass.passURI || "",
                  assignedStaff: persistedIssuedPass.staffAddress || "",
                  assignedStaffName: persistedIssuedPass.staffName || "",
                  sentAt: Number(persistedIssuedPass.createdAt || Date.now()),
                }
              : null;
            const pass = entryPasses[t.id] || persistedPassState || {};
            const eventId = Number(t.eventId);
            const eventStaffDirectory = buildStaffDirectory(activeStaffByEvent[eventId] || []);
            const hasStaffOptions = eventStaffDirectory.length > 0;
            const isUsedTicket = Boolean(t.isUsed);
            const isListedForSale = Boolean(t.forSaleStatus);
            const hasGeneratedPass = Boolean(persistedIssuedPass || pass.status === "ready");
            const isGeneratingPass = pass.status === "pending";
            const selectedStaff = pass.assignedStaff || "";
            const selectedStaffName = eventStaffDirectory.find((s) => s.address === selectedStaff)?.name || "";

            return (
              <section key={t.id} className="card card-hover h-full overflow-hidden">
                <TicketCard tokenId={t.id} info={t} isOwned={true} onRefresh={loadMyTickets} />
                <div className="border-t border-white/10 px-4 py-3">
                  {t.seatMapImageUrl ? (
                    <button
                      onClick={() =>
                        setVenueMapModal({
                          title: `${t.eventName || `Event #${Number(t.eventId)}`} - Venue Map`,
                          imageUrl: t.seatMapImageUrl,
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

                <div className="border-t border-white/10 bg-panel2 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="eyebrow">Entry pass</h3>
                    <button
                      onClick={() => createAndSendEntryPass(t)}
                      disabled={
                        isUsedTicket ||
                        isListedForSale ||
                        isGeneratingPass ||
                        hasGeneratedPass ||
                        !hasStaffOptions ||
                        !selectedStaff
                      }
                      className="btn-spot px-3 py-1.5 text-xs"
                    >
                      {hasGeneratedPass ? "Pass already generated" : "Generate & send pass"}
                    </button>
                  </div>

                  {!isUsedTicket && isListedForSale && (
                    <p className="mb-2 text-xs text-spotlight">
                      Delist this ticket from the secondary market before generating an entry pass.
                    </p>
                  )}
                  {!isUsedTicket && !isListedForSale && !hasStaffOptions && (
                    <p className="mb-2 text-xs text-spent">
                      No staff is on duty for this event yet. Ask staff to open its check-in queue
                      first.
                    </p>
                  )}
                  {!isUsedTicket && hasGeneratedPass && (
                    <p className="mb-2 text-xs text-mist">
                      Entry pass already generated for this ticket. Each wallet can generate only
                      once.
                    </p>
                  )}

                  <div className="mb-3">
                    <p className="mb-1 text-[11px] text-mist">Choose staff</p>
                    <select
                      value={selectedStaff}
                      onChange={(e) => updateAssignedStaff(t.id, e.target.value)}
                      disabled={isUsedTicket || isListedForSale || hasGeneratedPass || !hasStaffOptions}
                      aria-label="Choose staff"
                      className="input-dark px-2 py-1 font-mono text-xs disabled:opacity-50"
                    >
                      <option value="" disabled>
                        Select staff
                      </option>
                      {eventStaffDirectory.map((staff) => (
                        <option key={staff.address} value={staff.address}>
                          {staff.name} - {staff.address}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isUsedTicket && (
                    <p className="mb-2 text-xs text-mist">
                      This ticket is already used. Entry pass actions are disabled.
                    </p>
                  )}

                  {pass?.status === "pending" && (
                    <p className="text-xs text-mist">Signing and sending pass…</p>
                  )}

                  {pass?.status === "error" && <p className="text-xs text-spent">{pass.error}</p>}

                  {pass?.status === "ready" && pass.payload && (
                    <div>
                      <p className="text-xs text-live">
                        Sent to {pass.assignedStaffName || selectedStaffName}. Expires at{" "}
                        {new Date(pass.payload.expiresAt).toLocaleTimeString()}.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
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
