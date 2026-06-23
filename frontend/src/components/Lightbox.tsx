import { useCallback, useEffect, useRef, useState } from "react";
import { type Item, api } from "../api";
import { downloadImage, buildFilename } from "../download";
import { ShareDialog } from "./ShareDialog";
import { useConfirm } from "./ConfirmDialog";

const SLIDESHOW_INTERVALS = [3, 5, 10] as const;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Lightbox({
  items,
  index,
  folderId,
  isAdmin = false,
  onIndexChange,
  onChanged,
  onClose,
}: {
  items: Item[];
  index: number;
  folderId: string;
  isAdmin?: boolean;
  onIndexChange: (i: number) => void;
  /** Called after an admin action mutated the folder (e.g. unapprove). */
  onChanged?: () => void;
  onClose: () => void;
}) {
  const total = items.length;
  const item = items[index];

  const [showShare, setShowShare] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [unapproving, setUnapproving] = useState(false);
  const { ask, dialog: confirmDialog } = useConfirm();
  const confirmOpen = confirmDialog !== null;
  const [playing, setPlaying] = useState(false);
  const [interval, setIntervalSecs] = useState<number>(5);
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Bump on every photo change to retrigger the fade-in animation.
  const [fadeKey, setFadeKey] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastFocused = useRef<Element | null>(null);
  const reduced = prefersReducedMotion();

  const go = useCallback(
    (next: number, userInitiated = true) => {
      const wrapped = ((next % total) + total) % total;
      onIndexChange(wrapped);
      setFadeKey((k) => k + 1);
      if (userInitiated) setPlaying(false); // any manual navigation pauses the show
    },
    [total, onIndexChange],
  );

  const next = useCallback((user = true) => go(index + 1, user), [go, index]);
  const prev = useCallback(() => go(index - 1, true), [go, index]);

  // --- Keyboard ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showShare || showReport || confirmOpen) return; // dialogs own Esc while open
      switch (e.key) {
        case "ArrowRight": e.preventDefault(); next(); break;
        case "ArrowLeft": e.preventDefault(); prev(); break;
        case "Home": e.preventDefault(); go(0); break;
        case "End": e.preventDefault(); go(total - 1); break;
        case " ": e.preventDefault(); setPlaying((p) => !p); break;
        case "Escape": e.preventDefault(); onClose(); break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, prev, go, total, onClose, showShare, showReport, confirmOpen]);

  // --- Body scroll lock + focus management ---
  useEffect(() => {
    lastFocused.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      (lastFocused.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // --- Focus trap: keep Tab inside the overlay ---
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const root = overlayRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const list = Array.from(focusables).filter((el) => !el.hasAttribute("disabled"));
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showShare, showReport]);

  // --- Preload neighbours for snappy paging ---
  useEffect(() => {
    [index + 1, index - 1].forEach((i) => {
      const it = items[((i % total) + total) % total];
      if (it) { const img = new Image(); img.src = it.webUrl; }
    });
  }, [index, items, total]);

  // --- Slideshow auto-advance ---
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => next(false), interval * 1000);
    return () => clearTimeout(id);
  }, [playing, interval, index, next]);

  // --- Rotate a phone/tablet to landscape → show the current photo fullscreen ---
  // Best-effort: the Fullscreen API works on Android/iPadOS/desktop. iPhone Safari
  // doesn't allow element fullscreen, so there the CSS landscape rules (styles.css)
  // make the image fill the screen instead. Failures are swallowed.
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const mql = window.matchMedia("(orientation: landscape)");
    const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element };
    function enterFs() {
      const node = overlayRef.current as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
      if (!node || doc.fullscreenElement || doc.webkitFullscreenElement) return;
      try { (node.requestFullscreen?.() as Promise<void> | undefined)?.catch(() => {}) ?? node.webkitRequestFullscreen?.(); } catch { /* unsupported */ }
    }
    function exitFs() {
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) return;
      try { (doc.exitFullscreen?.() as Promise<void> | undefined)?.catch(() => {}) ?? doc.webkitExitFullscreen?.(); } catch { /* ignore */ }
    }
    function apply() { if (mql.matches) enterFs(); else exitFs(); }
    apply();
    mql.addEventListener?.("change", apply);
    return () => { mql.removeEventListener?.("change", apply); exitFs(); };
  }, []);

  // --- Touch swipe ---
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchStart.current;
    if (!s) return;
    touchStart.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX > 50 && absX > absY) {
      if (dx < 0) next(); else prev();
    } else if (dy > 80 && absY > absX) {
      onClose(); // swipe down to close
    }
  }

  if (!item) return null;

  const counter = `${index + 1} / ${total}`;
  const alt = item.caption || "Foto";

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadImage(item.webUrl, buildFilename(item.caption, item.createdAt));
    } finally {
      setDownloading(false);
    }
  }

  async function handleUnapprove() {
    if (unapproving) return;
    const ok = await ask({
      title: "Foto zurückziehen",
      message: "Dieses Foto zurückziehen? Es geht zurück in die Freigabe.",
      confirmLabel: "Zurückziehen",
      danger: true,
    });
    if (!ok) return;
    setUnapproving(true);
    try {
      await api.unapproveItems([item.id]);
      onClose();
      onChanged?.();
    } finally {
      setUnapproving(false);
    }
  }

  return (
    <div
      className={`lightbox${playing ? " is-playing" : ""}${reduced ? " reduced" : ""}`}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Foto-Ansicht"
      tabIndex={-1}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Screen-reader live position announcement */}
      <p className="sr-only" aria-live="polite">{`Foto ${index + 1} von ${total}${item.caption ? ": " + item.caption : ""}`}</p>

      {/* Backdrop: tap to close */}
      <div className="lightbox-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Top chrome */}
      <div className="lightbox-top">
        <span className="lightbox-counter" aria-hidden="true">{counter}</span>
        <div className="lightbox-top-actions">
          <button className="lb-icon-btn" onClick={() => setShowShare(true)} aria-label="Teilen">
            <ShareIcon /><span className="lb-btn-label">Teilen</span>
          </button>
          <button className="lb-icon-btn" onClick={handleDownload} disabled={downloading} aria-label="Herunterladen">
            <DownloadIcon /><span className="lb-btn-label">{downloading ? "Lädt …" : "Download"}</span>
          </button>
          <button className="lb-icon-btn" onClick={() => setShowReport(true)} aria-label="Foto melden">
            <FlagIcon /><span className="lb-btn-label">Melden</span>
          </button>
          {isAdmin && (
            <button
              className="lb-icon-btn lb-unapprove"
              onClick={handleUnapprove}
              disabled={unapproving}
              aria-label="Foto zurückziehen"
            >
              <UndoIcon /><span className="lb-btn-label">{unapproving ? "Lädt …" : "Zurückziehen"}</span>
            </button>
          )}
          <button className="lb-icon-btn lb-close" onClick={onClose} aria-label="Schließen">
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="lightbox-stage" onClick={onClose}>
        <img
          key={fadeKey}
          className="lightbox-img"
          src={item.webUrl}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      {/* Prev / Next */}
      {total > 1 && (
        <>
          <button className="lb-nav lb-prev" onClick={prev} aria-label="Vorheriges Foto">
            <ChevronLeft />
          </button>
          <button className="lb-nav lb-next" onClick={() => next()} aria-label="Nächstes Foto">
            <ChevronRight />
          </button>
        </>
      )}

      {/* Bottom chrome: caption + slideshow controls */}
      <div className="lightbox-bottom">
        {item.caption && <p className="lightbox-caption">{item.caption}</p>}
        {total > 1 && (
          <div className="slideshow-bar">
            <button
              className="lb-pill"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Diashow pausieren" : "Diashow starten"}
            >
              {playing ? <><PauseIcon /> Pause</> : <><PlayIcon /> Diashow</>}
            </button>

            <div className="interval-wrap">
              <button
                className="lb-pill lb-pill-ghost"
                onClick={() => setShowIntervalMenu((s) => !s)}
                aria-haspopup="true"
                aria-expanded={showIntervalMenu}
                aria-label={`Intervall: ${interval} Sekunden`}
              >
                {interval}s
              </button>
              {showIntervalMenu && (
                <div className="interval-menu" role="menu">
                  {SLIDESHOW_INTERVALS.map((s) => (
                    <button
                      key={s}
                      role="menuitemradio"
                      aria-checked={s === interval}
                      className={`interval-opt${s === interval ? " active" : ""}`}
                      onClick={() => { setIntervalSecs(s); setShowIntervalMenu(false); }}
                    >
                      {s} Sekunden
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showShare && (
        <ShareDialog
          folderId={folderId}
          itemId={item.id}
          title={item.caption}
          onClose={() => setShowShare(false)}
        />
      )}

      {showReport && (
        <ReportDialog
          itemId={item.id}
          onClose={() => setShowReport(false)}
        />
      )}

      {confirmDialog}
    </div>
  );
}

/* --- Report Dialog --- */
function ReportDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  // Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      await api.postReport(itemId, reason.trim());
      setDone(true);
    } catch (ex: any) {
      if (ex?.status === 404) {
        setErr("Dieses Foto ist nicht mehr verfügbar.");
      } else {
        setErr("Melden fehlgeschlagen. Bitte erneut versuchen.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Foto melden">
      <div className="dialog-card">
        {done ? (
          <>
            <h2>Danke!</h2>
            <p style={{ marginTop: ".5rem", color: "var(--ink-soft)" }}>
              Die Lehrerin schaut sich das an.
            </p>
            <button onClick={onClose} style={{ marginTop: "1.25rem" }}>Schließen</button>
          </>
        ) : (
          <>
            <h2>Foto melden</h2>
            <p style={{ marginTop: ".4rem", color: "var(--ink-soft)", fontSize: ".9rem" }}>
              Bitte beschreibe kurz, warum du dieses Foto melden möchtest.
            </p>
            <form onSubmit={handleSubmit}>
              <textarea
                className="report-reason"
                placeholder="Begründung (Pflichtfeld)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                required
                autoFocus
                style={{ marginTop: ".75rem" }}
              />
              {err && <p className="err">{err}</p>}
              <div className="dialog-actions" style={{ marginTop: "1rem" }}>
                <button type="button" className="btn-ghost-dark" onClick={onClose}>Abbrechen</button>
                <button type="submit" disabled={busy || !reason.trim()}>
                  {busy ? "Sendet …" : "Melden"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* --- Inline icons (stroke, currentColor) --- */
const sw = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function ChevronLeft() { return <svg viewBox="0 0 24 24" width="28" height="28" {...sw}><polyline points="15 18 9 12 15 6" /></svg>; }
function ChevronRight() { return <svg viewBox="0 0 24 24" width="28" height="28" {...sw}><polyline points="9 18 15 12 9 6" /></svg>; }
function CloseIcon() { return <svg viewBox="0 0 24 24" width="22" height="22" {...sw}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function PlayIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" {...sw} fill="currentColor"><polygon points="6 4 20 12 6 20 6 4" /></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" {...sw}><line x1="9" y1="5" x2="9" y2="19" /><line x1="15" y1="5" x2="15" y2="19" /></svg>; }
function ShareIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" {...sw}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" /></svg>; }
function DownloadIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" {...sw}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>; }
function FlagIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" {...sw}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>; }
function UndoIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" {...sw}><polyline points="9 14 4 9 9 4" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>; }
