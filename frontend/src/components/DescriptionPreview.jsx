import { useEffect, useMemo, useRef, useState } from "react";

const MAX_PREVIEW_CHARS = 300;

export default function DescriptionPreview({ text = "", modalTitle = "Description" }) {
  const [open, setOpen] = useState(false);
  const [isVisuallyClipped, setIsVisuallyClipped] = useState(false);
  const previewContainerRef = useRef(null);
  const normalized = String(text || "").trim();

  const { preview, isTruncated } = useMemo(() => {
    if (!normalized) return { preview: "", isTruncated: false };
    if (normalized.length <= MAX_PREVIEW_CHARS) {
      return { preview: normalized, isTruncated: false };
    }
    return {
      preview: `${normalized.slice(0, MAX_PREVIEW_CHARS).trimEnd()}...`,
      isTruncated: true,
    };
  }, [normalized]);

  useEffect(() => {
    const checkClipped = () => {
      const el = previewContainerRef.current;
      if (!el) {
        setIsVisuallyClipped(false);
        return;
      }
      setIsVisuallyClipped(el.scrollHeight > el.clientHeight + 1);
    };

    checkClipped();
    window.addEventListener("resize", checkClipped);
    return () => window.removeEventListener("resize", checkClipped);
  }, [preview]);

  if (!normalized) return null;

  const canExpand = isTruncated || isVisuallyClipped;

  return (
    <>
      <div className="mb-3">
        <div ref={previewContainerRef} className="h-[4.5rem] overflow-hidden">
          <p className="text-sm leading-relaxed text-mist">{preview}</p>
        </div>
        {canExpand && (
          <button
            onClick={() => setOpen(true)}
            className="mt-1 text-xs font-medium text-spotlight hover:underline"
          >
            View full description
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="card w-full max-w-2xl animate-rise p-5 shadow-lift">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{modalTitle}</h3>
              <button onClick={() => setOpen(false)} className="btn-ghost px-2 py-1 text-sm">
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-panel2 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-mist">
                {normalized}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
