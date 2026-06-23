import { useCallback, useEffect, useRef } from "react";
import { type PendingItem } from "../api";

/**
 * Fullscreen (near-black) single-photo review for the approval queue.
 * Shows the large webUrl, caption + folder name, prev/next through the pending
 * list, and Freigeben / Ablehnen buttons that act on the CURRENT photo and then
 * advance. Esc closes. Mechanics mirror the public Lightbox.
 */
export function ApprovalLightbox({
  items,
  index,
  busy,
  onIndexChange,
  onApprove,
  onReject,
  onClose,
}: {
  items: PendingItem[];
  index: number;
  busy: boolean;
  onIndexChange: (i: number) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}) {
  const total = items.length;
  const item = items[index];
  const overlayRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => {
      if (total === 0) return;
      const wrapped = ((next % total) + total) % total;
      onIndexChange(wrapped);
    },
    [total, onIndexChange],
  );

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Keyboard: arrows navigate, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowRight": e.preventDefault(); next(); break;
        case "ArrowLeft": e.preventDefault(); prev(); break;
        case "Escape": e.preventDefault(); onClose(); break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Body scroll lock + focus.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Preload neighbouring photos for snappy review (skip videos — different element).
  useEffect(() => {
    [index + 1, index - 1].forEach((i) => {
      const it = items[((i % total) + total) % total];
      if (it && it.type !== "video") { const img = new Image(); img.src = it.webUrl; }
    });
  }, [index, items, total]);

  if (!item) return null;

  return (
    <div
      className="approval-lightbox"
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Foto prüfen"
      tabIndex={-1}
    >
      <div className="approval-lb-top">
        <span className="approval-lb-counter" aria-hidden="true">{index + 1} / {total}</span>
        <span className="approval-lb-folder">{item.folderName}</span>
        <button className="approval-lb-close" onClick={onClose} aria-label="Schließen">Schließen ✕</button>
      </div>

      <div className="approval-lb-stage">
        {item.type === "video" && item.processing ? (
          <div className="lightbox-processing">
            <span className="processing-spinner" aria-hidden="true">⏳</span>
            <p>Video wird noch verarbeitet …</p>
            <p className="lightbox-processing-hint">Freigabe möglich, sobald es fertig ist.</p>
          </div>
        ) : item.type === "video" ? (
          <video
            className="approval-lb-img approval-lb-video"
            src={item.webUrl}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <img className="approval-lb-img" src={item.webUrl} alt={item.caption || "Foto"} draggable={false} />
        )}
        {total > 1 && (
          <>
            <button className="approval-lb-nav approval-lb-prev" onClick={prev} aria-label="Vorheriges Foto">‹</button>
            <button className="approval-lb-nav approval-lb-next" onClick={next} aria-label="Nächstes Foto">›</button>
          </>
        )}
      </div>

      <div className="approval-lb-bottom">
        {item.caption && <p className="approval-lb-caption">{item.caption}</p>}
        <div className="approval-lb-actions">
          <button className="btn-reject" onClick={() => onReject(item.id)} disabled={busy}>
            Ablehnen
          </button>
          <button
            className="btn-approve"
            onClick={() => onApprove(item.id)}
            disabled={busy || item.processing}
            title={item.processing ? "Video wird noch verarbeitet" : undefined}
          >
            {item.processing ? "Wird verarbeitet …" : "Freigeben"}
          </button>
        </div>
      </div>
    </div>
  );
}
