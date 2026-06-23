import { useState, useRef } from "react";
import { api } from "../api";
import { makeWebAndThumb, putToS3, isVideoFile, validateVideo, makeVideoThumb } from "../upload";

type FileState = { file: File; status: "pending" | "uploading" | "done" | "error"; progress: string };

export function UploadDialog({ folderId, onClose, onUploaded }: {
  folderId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<FileState[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allDone = files.length > 0 && files.every((f) => f.status === "done");
  const hasRetryable = files.some((f) => f.status === "pending" || f.status === "error");

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    setFiles(picked.map((file) => ({ file, status: "pending", progress: "" })));
  }

  async function startUpload() {
    if (!files.length || busy) return;
    setBusy(true);

    // Reset errors to pending so they get retried; skip already-done files
    const updated = files.map((f) =>
      f.status === "error" ? { ...f, status: "pending" as const, progress: "" } : { ...f }
    );
    setFiles([...updated]);

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "done") continue;

      const file = updated[i].file;
      const isVideo = isVideoFile(file);
      updated[i] = { ...updated[i], status: "uploading", progress: isVideo ? "Prüfe Video …" : "Verkleinere …" };
      setFiles([...updated]);

      try {
        if (isVideo) {
          await validateVideo(file); // throws a user-facing message if too big/long
          updated[i] = { ...updated[i], progress: "Lädt Video hoch …" };
          setFiles([...updated]);

          const presign = await api.presignUpload(folderId, file.type, "video");
          // Generate the thumbnail in parallel with the (slow) video upload, so the
          // dialog doesn't wait on frame extraction before the upload even starts.
          await Promise.all([
            putToS3(presign.webUploadUrl, file, file.type),
            makeVideoThumb(file).then((thumb) => putToS3(presign.thumbUploadUrl, thumb, "image/jpeg")),
          ]);
          await api.confirmUpload(folderId, presign.itemId, undefined, "video");
        } else {
          const { web, thumb } = await makeWebAndThumb(file);
          updated[i] = { ...updated[i], progress: "Lade hoch …" };
          setFiles([...updated]);

          const presign = await api.presignUpload(folderId, "image/jpeg");
          await Promise.all([
            putToS3(presign.webUploadUrl, web),
            putToS3(presign.thumbUploadUrl, thumb),
          ]);
          await api.confirmUpload(folderId, presign.itemId);
        }
        updated[i] = { ...updated[i], status: "done", progress: "✓ Fertig" };
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        const friendly = msg.includes("video_too_large")
          ? "Video ist zu groß (Server-Limit)."
          : /zu groß|zu lang/.test(msg)
            ? msg
            : "Fehler beim Upload";
        updated[i] = { ...updated[i], status: "error", progress: friendly };
      }
      setFiles([...updated]);
    }

    setBusy(false);
    if (updated.some((f) => f.status === "done")) {
      onUploaded();
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title">
      <div className="dialog-card">
        <h2 id="upload-dialog-title">Fotos & Videos hochladen</h2>
        <p className="muted">
          Fotos werden verkleinert; Videos (max. 60&nbsp;s, 150&nbsp;MB) werden direkt geladen.
          Alles geht zur Freigabe an die Lehrerin.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={pickFiles}
          style={{ display: "none" }}
          aria-hidden="true"
        />
        <button className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Fotos / Videos auswählen
        </button>

        {files.length > 0 && (
          <ul className="file-list" aria-label="Ausgewählte Dateien">
            {files.map((f, i) => (
              <li key={i} className={`file-item file-${f.status}`}>
                <span className="file-name">{f.file.name}</span>
                <span className="file-progress" aria-live="polite">{f.progress}</span>
              </li>
            ))}
          </ul>
        )}

        {allDone && (
          <p className="upload-done" role="status">Alles hochgeladen — wartet auf Freigabe.</p>
        )}

        <div className="dialog-actions">
          <button onClick={onClose} className="btn-ghost-dark" disabled={busy}>Schließen</button>
          {files.length > 0 && hasRetryable && (
            <button onClick={startUpload} disabled={busy}>
              {busy ? "Lädt hoch …" : `${files.filter(f => f.status !== "done").length} ${files.filter(f => f.status !== "done").length !== 1 ? "Dateien" : "Datei"} hochladen`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
