import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type PendingItem } from "../api";

type OutletCtx = { refreshPending: () => void };

export function ApprovalQueue() {
  const { refreshPending } = useOutletContext<OutletCtx>();
  const onCountChange = (_n: number) => refreshPending();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function load() {
    setLoading(true);
    setError(false);
    api.getPending()
      .then((its) => {
        setItems(its);
        setLoading(false);
        onCountChange(its.length);
      })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

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

  if (loading) return <p className="muted">Lädt Freigabe-Warteschlange …</p>;
  if (error) return <p className="err">Freigabe-Liste konnte nicht geladen werden.</p>;

  return (
    <div className="approval-queue">
      <div className="approval-header">
        <h2>Freigabe-Warteschlange</h2>
        {items.length > 0 && (
          <div className="approval-actions">
            <label className="select-all-label">
              <input type="checkbox"
                checked={selected.size === items.length && items.length > 0}
                onChange={toggleAll} />
              Alle auswählen
            </label>
            <button onClick={handleApprove} disabled={busy || !selected.size} className="btn-approve">
              Freigeben ({selected.size})
            </button>
            <button onClick={handleReject} disabled={busy || !selected.size} className="btn-reject">
              Ablehnen ({selected.size})
            </button>
          </div>
        )}
      </div>

      {msg && <p className="approval-msg">{msg}</p>}

      {!items.length && <p className="muted">Keine Fotos warten auf Freigabe.</p>}

      <div className="approval-grid">
        {items.map((item) => (
          <div key={item.id}
            className={`approval-item${selected.has(item.id) ? " selected" : ""}`}
            onClick={() => toggleItem(item.id)}>
            <div className="approval-thumb-wrap">
              <img src={item.thumbUrl} alt={item.caption || "Foto"} loading="lazy" className="approval-thumb" />
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
    </div>
  );
}
