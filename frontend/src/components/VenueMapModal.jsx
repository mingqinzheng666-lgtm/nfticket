export default function VenueMapModal({ title = "Venue Map", imageUrl, onClose }) {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="card w-full max-w-3xl animate-rise p-4 shadow-lift">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">
            Close
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-panel2">
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[70vh] w-full object-contain"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}
