import { useEffect, useState } from "react";
import { api, type Folder } from "../api";

export function FolderList({ onOpenFolder }: { onOpenFolder: (folder: Folder) => void }) {
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
  if (!folders.length) return <p className="muted">Noch keine Ordner vorhanden.</p>;

  return (
    <div className="folder-grid">
      {folders.map((f) => (
        <button key={f.id} className="folder-card" onClick={() => onOpenFolder(f)}>
          <span className="folder-icon">📁</span>
          <div className="folder-name">{f.name}</div>
          {(f.schoolYear || f.classLabel) && (
            <div className="folder-meta">{[f.schoolYear, f.classLabel].filter(Boolean).join(" · ")}</div>
          )}
          <div className="folder-count">{f.itemCount} Foto{f.itemCount !== 1 ? "s" : ""}</div>
        </button>
      ))}
    </div>
  );
}
