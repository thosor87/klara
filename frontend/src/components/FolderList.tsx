import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, type Folder, type ClassOption, type Me } from "../api";
import { formatDateRange } from "../dates";

type OutletCtx = { me?: Me };

export function FolderList() {
  const { me } = useOutletContext<OutletCtx>();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.getFolders(), api.getClassOptions()])
      .then(([f, c]) => { setFolders(f); setClassOptions(c); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  if (loading) return <p className="muted">Lädt Alben …</p>;
  if (error) return <p className="err">Alben konnten nicht geladen werden.</p>;

  const isAdmin = me?.role === "admin";
  const classLabelFor = (id: string) => classOptions.find((c) => c.id === id)?.label ?? "";

  // Member-specific empty states (admins keep the normal "no albums" view).
  function memberEmpty() {
    if (me && me.classId == null) {
      return (
        <p className="muted empty-hint">
          Du bist noch keiner Klasse zugeordnet — die Lehrerin macht das, dann erscheinen
          hier die Alben deiner Klasse.
        </p>
      );
    }
    return (
      <p className="muted empty-hint">
        Hier sind noch keine Alben für deine Klasse. Sobald die Lehrerin eins freigibt,
        erscheint es hier.
      </p>
    );
  }

  return (
    <section className="folders-page">
      <header className="page-head">
        <p className="page-kicker">Unser Klassenalbum</p>
        <h1 className="page-title">Alben</h1>
      </header>

      {!folders.length ? (
        isAdmin ? (
          <p className="muted empty-hint">Noch keine Alben vorhanden.</p>
        ) : (
          memberEmpty()
        )
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
              {f.schoolYear && <div className="folder-meta">{f.schoolYear}</div>}
              {f.classIds?.length > 0 && (
                <div className="class-chips folder-class-chips">
                  {f.classIds.map((id) => (
                    <span key={id} className="class-chip">{classLabelFor(id)}</span>
                  ))}
                </div>
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
