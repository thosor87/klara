import { useState, useRef } from "react";
import { api } from "../api";
import { makeWebAndThumb, putToS3 } from "../upload";

type FileState = { file: File; status: "pending" | "uploading" | "done" | "error"; progress: string };

export function UploadDialog({ folderId, onClose, onUploaded }: {
  folderId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setFiles(picked.map((file) => ({ file, status: "pending", progress: "" })));
    setAllDone(false);
  }

  async function startUpload() {
    if (!files.length || busy) return;
    setBusy(true);

    const updated = [...files];
    for (let i = 0; i < updated.length; i++) {
      updated[i] = { ...updated[i], status: "uploading", progress: "Verkleinere …" };
      setFiles([...updated]);

      try {
        const { web, thumb } = await makeWebAndThumb(updated[i].file);
        updated[i] = { ...updated[i], progress: "Lade hoch …" };
        setFiles([...updated]);

        const presign = await api.presignUpload(folderId, "image/jpeg");
        await Promise.all([
          putToS3(presign.webUploadUrl, web),
          putToS3(presign.thumbUploadUrl, thumb),
        ]);

        await api.confirmUpload(folderId, presign.itemId);
        updated[i] = { ...updated[i], status: "done", progress: "✓ Fertig" };
      } catch {
        updated[i] = { ...updated[i], status: "error", progress: "Fehler beim Upload" };
      }
      setFiles([...updated]);
    }

    setBusy(false);
    const anySucceeded = updated.some((f) => f.status === "done");
    if (anySucceeded) {
      setAllDone(true);
      onUploaded();
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
      <div className="dialog-card">
        <h2 id="upload-dialog-title">Fotos hochladen</h2>
        <p className="muted">Fotos werden verkleinert und gehen zur Freigabe an die Lehrerin.</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={pickFiles}
          style={{ display: "none" }}
          aria-hidden="true"
        />
        <button className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Fotos auswählen
        </button>

        {files.length > 0 && (
          <ul className="file-list" aria-label="Ausgewählte Fotos">
            {files.map((f, i) => (
              <li key={i} className={`file-item file-${f.status}`}>
                <span className="file-name">{f.file.name}</span>
                <span className="file-progress" aria-live="polite">{f.progress}</span>
              </li>
            ))}
          </ul>
        )}

        {allDone && (
          <p className="upload-done" role="status">Alle Fotos hochgeladen — sie warten auf Freigabe.</p>
        )}

        <div className="dialog-actions">
          <button onClick={onClose} className="btn-ghost-dark" disabled={busy}>Schließen</button>
          {files.length > 0 && !allDone && (
            <button onClick={startUpload} disabled={busy || !files.some(f => f.status === "pending")}>
              {busy ? "Lädt hoch …" : `${files.length} Foto${files.length !== 1 ? "s" : ""} hochladen`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
