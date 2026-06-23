import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, type Folder, type Item } from "../api";
import { UploadDialog } from "./UploadDialog";
import { Gallery } from "./Gallery";
import { Lightbox } from "./Lightbox";
import { ShareDialog } from "./ShareDialog";

export function FolderView() {
  const { folderId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);

  function loadItems() {
    setLoading(true);
    setError(false);
    api.getFolderItems(folderId)
      .then((its) => { setItems(its); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }

  // Folder metadata comes from the folders list (no single-folder endpoint).
  useEffect(() => {
    api.getFolders()
      .then((fs) => setFolder(fs.find((f) => f.id === folderId) ?? null))
      .catch(() => setFolder(null));
  }, [folderId]);

  useEffect(() => { loadItems(); }, [folderId]);

  // The lightbox index is derived from the ?foto= query param so deep links and
  // the back button work. -1 means closed.
  const fotoId = searchParams.get("foto");
  const lightboxIndex = fotoId ? items.findIndex((i) => i.id === fotoId) : -1;

  function openLightbox(index: number) {
    const next = new URLSearchParams(searchParams);
    next.set("foto", items[index].id);
    setSearchParams(next, { replace: false });
  }
  function changeLightbox(index: number) {
    const next = new URLSearchParams(searchParams);
    next.set("foto", items[index].id);
    setSearchParams(next, { replace: true });
  }
  function closeLightbox() {
    const next = new URLSearchParams(searchParams);
    next.delete("foto");
    setSearchParams(next, { replace: true });
  }

  const title = folder?.name ?? "Ordner";
  const meta = folder && (folder.schoolYear || folder.classLabel)
    ? [folder.schoolYear, folder.classLabel].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="folder-view">
      <div className="folder-view-header">
        <Link to="/" className="btn-back" aria-label="Zurück zur Ordnerübersicht">
          <span aria-hidden="true">←</span> Ordner
        </Link>
        <div className="folder-view-titlebox">
          <h1 className="folder-view-title">{title}</h1>
          {meta && <p className="muted folder-view-meta">{meta}</p>}
        </div>
        <div className="folder-view-actions">
          <button className="btn-secondary btn-inline" onClick={() => setShowShare(true)}>Teilen</button>
          <button className="btn-inline" onClick={() => setShowUpload(true)}>Fotos hochladen</button>
        </div>
      </div>

      {loading && <p className="muted">Lädt Fotos …</p>}
      {!loading && error && <p className="err">Fotos konnten nicht geladen werden.</p>}
      {!loading && !error && !items.length && (
        <p className="muted empty-hint">Noch keine freigegebenen Fotos.</p>
      )}

      {!loading && items.length > 0 && (
        <Gallery items={items} onOpen={openLightbox} label={`Fotos in ${title}`} />
      )}

      {lightboxIndex >= 0 && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          folderId={folderId}
          onIndexChange={changeLightbox}
          onClose={closeLightbox}
        />
      )}

      {showShare && (
        <ShareDialog folderId={folderId} title={title} onClose={() => setShowShare(false)} />
      )}

      {showUpload && (
        <UploadDialog
          folderId={folderId}
          onClose={() => setShowUpload(false)}
          onUploaded={loadItems}
        />
      )}
    </div>
  );
}
