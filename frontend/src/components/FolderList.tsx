import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Folder } from "../api";
import { formatDateRange } from "../dates";

export function FolderList() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.getFolders()
      .then((f) => { setFolders(f); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) return <p className="muted">Lädt Ordner …</p>;
  if (error) return <p className="err">Ordner konnten nicht geladen werden.</p>;

  return (
    <section className="folders-page">
      <header className="page-head">
        <p className="page-kicker">Unser Klassenalbum</p>
        <h1 className="page-title">Ordner</h1>
      </header>

      {!folders.length ? (
        <p className="muted empty-hint">Noch keine Ordner vorhanden.</p>
      ) : (
        <div className="folder-grid">
          {folders.map((f, i) => {
            const range = formatDateRange(f.startDate, f.endDate);
            return (
            <Link
              key={f.id}
              to={`/ordner/${f.id}`}
              className="folder-card"
              style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
            >
              {f.coverThumbUrl ? (
                <span className="folder-cover">
                  <img src={f.coverThumbUrl} alt="" loading="lazy" draggable={false} />
                </span>
              ) : (
                <span className="folder-icon" aria-hidden="true">🌿</span>
              )}
              <div className="folder-name">{f.name}</div>
              {(f.schoolYear || f.classLabel) && (
                <div className="folder-meta">{[f.schoolYear, f.classLabel].filter(Boolean).join(" · ")}</div>
              )}
              {range && <div className="folder-meta">{range}</div>}
              <div className="folder-count">{f.itemCount} Foto{f.itemCount !== 1 ? "s" : ""}</div>
            </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
