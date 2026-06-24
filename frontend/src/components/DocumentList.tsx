import { type AlbumDocument } from "../api";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Short type tag from filename/content-type (PDF, DOCX, XLSX, …). */
export function docTag(doc: AlbumDocument): string {
  const ext = doc.filename.split(".").pop()?.toUpperCase();
  if (ext && ext.length <= 4) return ext;
  if (doc.contentType.includes("pdf")) return "PDF";
  return "DATEI";
}

/**
 * Read-only list of an album's documents, shown at the very top of the album view.
 * Each row links to a presigned download URL (forces download with the original name).
 */
export function DocumentList({ documents }: { documents: AlbumDocument[] }) {
  if (!documents.length) return null;
  return (
    <section className="doc-list" aria-label="Dokumente">
      <h2 className="doc-list-title">Dokumente</h2>
      <ul className="doc-list-items">
        {documents.map((doc) => (
          <li key={doc.id} className="doc-row">
            <span className="doc-icon" aria-hidden="true">
              <FileIcon />
              <span className="doc-tag">{docTag(doc)}</span>
            </span>
            <span className="doc-meta">
              <span className="doc-name">{doc.filename}</span>
              <span className="doc-size">{formatBytes(doc.sizeBytes)}</span>
            </span>
            <a className="doc-download" href={doc.downloadUrl} download={doc.filename}>
              Herunterladen
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
