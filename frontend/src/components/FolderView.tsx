import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useOutletContext, Link } from "react-router-dom";
import { api, type Folder, type Item, type Me } from "../api";
import { UploadDialog } from "./UploadDialog";
import { Gallery } from "./Gallery";
import { Lightbox } from "./Lightbox";
import { ShareDialog } from "./ShareDialog";
import { useConfirm } from "./ConfirmDialog";

type SortOrder = "newest" | "oldest";

type OutletCtx = { me?: Me; refreshPending?: () => void };

export function FolderView() {
  const { folderId = "" } = useParams();
  const { me, refreshPending } = useOutletContext<OutletCtx>();
  const isAdmin = me?.role === "admin";
  // After an admin pulls a photo back to pending, refresh the items AND the
  // nav badge immediately (instead of waiting for the 30s poll).
  const onItemsChanged = () => { loadItems(); refreshPending?.(); };
  const [searchParams, setSearchParams] = useSearchParams();

  const [folder, setFolder] = useState<Folder | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [sort, setSort] = useState<SortOrder>("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState("");
  const { ask, dialog } = useConfirm();

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

  // Split approved (shown in the gallery + lightbox) from the member's own
  // pending uploads (shown separately, with a delete button).
  const approved = useMemo(() => {
    const list = items.filter((i) => i.status === "approved");
    list.sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
    return list;
  }, [items, sort]);

  const myPending = useMemo(
    () => items.filter((i) => i.mine && i.status === "pending"),
    [items],
  );

  // The lightbox index is derived from the ?foto= query param so deep links and
  // the back button work. It only ever indexes the APPROVED gallery list.
  const fotoId = searchParams.get("foto");
  const lightboxIndex = fotoId ? approved.findIndex((i) => i.id === fotoId) : -1;

  function openLightbox(index: number) {
    const next = new URLSearchParams(searchParams);
    next.set("foto", approved[index].id);
    setSearchParams(next, { replace: false });
  }
  function changeLightbox(index: number) {
    const next = new URLSearchParams(searchParams);
    next.set("foto", approved[index].id);
    setSearchParams(next, { replace: true });
  }
  function closeLightbox() {
    const next = new URLSearchParams(searchParams);
    next.delete("foto");
    setSearchParams(next, { replace: true });
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    const ok = await ask({
      title: "Foto löschen",
      message: "Dieses Foto wirklich löschen? Es ist noch nicht freigegeben.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    setDeleteErr("");
    setDeletingId(id);
    try {
      await api.deleteItem(id);
      loadItems();
    } catch {
      setDeleteErr("Löschen fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setDeletingId(null);
    }
  }

  const title = folder?.name ?? "Album";
  const meta = folder && (folder.schoolYear || folder.classLabel)
    ? [folder.schoolYear, folder.classLabel].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="folder-view">
      {dialog}
      <div className="folder-view-header">
        <Link to="/" className="btn-back" aria-label="Zurück zur Albenübersicht">
          <span aria-hidden="true">←</span> Alben
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

      {/* Member's own pending uploads — awaiting approval */}
      {!loading && !error && myPending.length > 0 && (
        <section className="pending-section">
          <h2 className="pending-section-title">Deine Uploads — wartet auf Freigabe</h2>
          {deleteErr && (
            <p className="inline-error" role="alert">
              <span>{deleteErr}</span>
              <button type="button" aria-label="Hinweis schließen" onClick={() => setDeleteErr("")}>×</button>
            </p>
          )}
          <ul className="pending-grid">
            {myPending.map((item) => (
              <li key={item.id} className="pending-tile">
                <img src={item.thumbUrl} alt={item.caption || "Foto"} loading="lazy" />
                <span className="pending-badge">wartet auf Freigabe</span>
                <button
                  className="pending-delete"
                  aria-label="Foto löschen"
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                >×</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && !error && !approved.length && !myPending.length && (
        <p className="muted empty-hint">Noch keine freigegebenen Fotos.</p>
      )}

      {!loading && approved.length > 0 && (
        <>
          <div className="gallery-toolbar">
            <button
              className="sort-toggle"
              onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}
              aria-label="Sortierung umschalten"
            >
              {sort === "newest" ? "Neueste zuerst ↓" : "Älteste zuerst ↑"}
            </button>
          </div>
          <Gallery items={approved} onOpen={openLightbox} label={`Fotos in ${title}`} />
        </>
      )}

      {lightboxIndex >= 0 && (
        <Lightbox
          items={approved}
          index={lightboxIndex}
          folderId={folderId}
          isAdmin={isAdmin}
          onIndexChange={changeLightbox}
          onChanged={onItemsChanged}
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
