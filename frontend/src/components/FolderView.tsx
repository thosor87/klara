import { useEffect, useState } from "react";
import { api, type Folder, type Item } from "../api";
import { UploadDialog } from "./UploadDialog";

export function FolderView({ folder, onBack }: { folder: Folder; onBack: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  function loadItems() {
    setLoading(true);
    setError(false);
    api.getFolderItems(folder.id)
      .then((its) => { setItems(its); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => { loadItems(); }, [folder.id]);

  return (
    <div className="folder-view">
      <div className="folder-view-header">
        <button className="btn-ghost-dark" onClick={onBack} aria-label="Zurück zur Ordnerübersicht">← Zurück</button>
        <div>
          <h2 className="folder-view-title">{folder.name}</h2>
          {(folder.schoolYear || folder.classLabel) && (
            <p className="muted folder-view-meta">{[folder.schoolYear, folder.classLabel].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button onClick={() => setShowUpload(true)}>Fotos hochladen</button>
      </div>

      {loading && <p className="muted">Lädt Fotos …</p>}
      {!loading && error && <p className="err">Fotos konnten nicht geladen werden.</p>}
      {!loading && !error && !items.length && <p className="muted">Noch keine freigegebenen Fotos.</p>}

      {!loading && items.length > 0 && (
        <div className="photo-grid" role="list" aria-label={`Fotos in ${folder.name}`}>
          {items.map((item) => (
            <a
              key={item.id}
              href={item.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="photo-thumb"
              title={item.caption || undefined}
              role="listitem"
              aria-label={item.caption || "Foto öffnen"}
            >
              <img src={item.thumbUrl} alt={item.caption || "Foto"} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {showUpload && (
        <UploadDialog
          folderId={folder.id}
          onClose={() => setShowUpload(false)}
          onUploaded={loadItems}
        />
      )}
    </div>
  );
}
