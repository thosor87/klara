import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type PendingItem } from "../api";
import { ApprovalLightbox } from "./ApprovalLightbox";

type OutletCtx = { refreshPending: () => void };

export function ApprovalQueue() {
  const { refreshPending } = useOutletContext<OutletCtx>();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // Fullscreen review: index into `items`, or -1 when closed.
  const [reviewIndex, setReviewIndex] = useState(-1);

  function load() {
    setLoading(true);
    setError(false);
    api.getPending()
      .then((its) => {
        setItems(its);
        setLoading(false);
        refreshPending();
      })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  // While any video is still transcoding (Phase B), refresh silently every 10s so
  // it flips from "wird verarbeitet" to ready without a manual reload.
  useEffect(() => {
    if (!items.some((i) => i.processing)) return;
    const id = setInterval(() => {
      api.getPending().then((its) => { setItems(its); refreshPending(); }).catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [items, refreshPending]);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }

  async function handleApprove() {
    if (!selected.size || busy) return;
    setBusy(true); setMsg("");
    try {
      const { approved } = await api.approveItems([...selected]);
      setMsg(`${approved} Foto${approved !== 1 ? "s" : ""} freigegeben.`);
      setSelected(new Set());
      load();
    } catch {
      setMsg("Fehler bei der Freigabe.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!selected.size || busy) return;
    setBusy(true); setMsg("");
    try {
      const { rejected } = await api.rejectItems([...selected]);
      setMsg(`${rejected} Foto${rejected !== 1 ? "s" : ""} abgelehnt.`);
      setSelected(new Set());
      load();
    } catch {
      setMsg("Fehler beim Ablehnen.");
    } finally {
      setBusy(false);
    }
  }

  /** Act on a single photo from the fullscreen review, then advance. */
  async function reviewAct(id: string, action: "approve" | "reject") {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      if (action === "approve") await api.approveItems([id]);
      else await api.rejectItems([id]);

      const remaining = items.filter((i) => i.id !== id);
      setItems(remaining);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      refreshPending();

      if (!remaining.length) {
        setReviewIndex(-1);
      } else {
        // Stay at the same slot (now the next photo) but clamp to the end.
        setReviewIndex((i) => Math.min(i, remaining.length - 1));
      }
    } catch {
      setMsg(action === "approve" ? "Fehler bei der Freigabe." : "Fehler beim Ablehnen.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Lädt Freigabe-Warteschlange …</p>;
  if (error) return <p className="err">Freigabe-Liste konnte nicht geladen werden.</p>;

  const allSelected = selected.size === items.length && items.length > 0;

  return (
    <div className="approval-queue">
      <div className="approval-header">
        <h2>Freigabe-Warteschlange</h2>
      </div>

      {items.length > 0 && (
        <div className="approval-bar">
          <span className="approval-bar-count">
            {selected.size} ausgewählt
          </span>
          <button className="btn-ghost-light" onClick={toggleAll}>
            {allSelected ? "Abwählen" : "Alle auswählen"}
          </button>
          <span className="spacer" />
          <button onClick={handleApprove} disabled={busy || !selected.size} className="btn-approve">
            Freigeben
          </button>
          <button onClick={handleReject} disabled={busy || !selected.size} className="btn-reject">
            Ablehnen
          </button>
        </div>
      )}

      {msg && <p className="approval-msg">{msg}</p>}

      {!items.length && <p className="muted">Keine Fotos warten auf Freigabe.</p>}

      <div className="approval-grid">
        {items.map((item, i) => (
          <div key={item.id}
            className={`approval-item${selected.has(item.id) ? " selected" : ""}`}>
            <div className="approval-thumb-wrap">
              <button
                type="button"
                className="approval-open-btn"
                onClick={() => setReviewIndex(i)}
                aria-label="Foto in Vollbild prüfen"
              >
                <img src={item.thumbUrl} alt={item.caption || (item.type === "video" ? "Video" : "Foto")} loading="lazy" className="approval-thumb" />
                {item.type === "video" && item.processing && (
                  <span className="processing-overlay" aria-hidden="true">⏳ wird verarbeitet</span>
                )}
                {item.type === "video" && !item.processing && <span className="video-badge" aria-hidden="true" />}
              </button>
              <input type="checkbox" className="approval-checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggleItem(item.id)}
                onClick={(e) => e.stopPropagation()} />
            </div>
            <div className="approval-info">
              <div className="approval-folder">{item.folderName}</div>
              {item.caption && <div className="approval-caption">{item.caption}</div>}
            </div>
          </div>
        ))}
      </div>

      {reviewIndex >= 0 && items[reviewIndex] && (
        <ApprovalLightbox
          items={items}
          index={reviewIndex}
          busy={busy}
          onIndexChange={setReviewIndex}
          onApprove={(id) => reviewAct(id, "approve")}
          onReject={(id) => reviewAct(id, "reject")}
          onClose={() => setReviewIndex(-1)}
        />
      )}
    </div>
  );
}
