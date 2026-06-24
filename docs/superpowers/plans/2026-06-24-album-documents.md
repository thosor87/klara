# Album-Dokumente — Implementation Plan

> TDD auf den Routen (vitest); Frontend per Build + manuell. Spec:
> `2026-06-24-album-documents-design.md`. Limits: 10/Album, 25 MB/Datei. Download = attachment.

## Task 1: Migration 010 + Storage download-presign
- `migrations/010_documents.sql` (Tabelle `documents`).
- `Storage.presignGet(key, opts?: { downloadFilename?, contentType? })` — Real-Impl setzt
  `ResponseContentDisposition: attachment; filename="…"` + `ResponseContentType`. Signaturerweiterung
  ist rückwärtskompatibel → keine Fake-Änderungen.

## Task 2: DocumentsRepo + Config
- `backend/src/documents/repo.ts`: `DocumentRow`, `listByFolder`, `countByFolder`, `insert`,
  `findById`, `deleteById`.
- `config.maxDocumentBytes` (26214400).

## Task 3: Routen (TDD)
- `backend/src/documents/routes.ts` + `routes.test.ts`:
  - `POST /api/admin/folders/:id/documents/presign` (admin): folder fehlt→404; count≥10→409; sonst `documents/{docId}`-Key.
  - `POST /api/admin/folders/:id/documents` (admin): zu groß→413+delete+kein insert; count≥10→409; sonst 201.
  - `GET /api/folders/:id/documents` (user, klassen-gegated): admin sieht; member ohne Sicht→404; sonst Liste+downloadUrl.
  - `DELETE /api/admin/documents/:docId` (admin): delete row+S3; non-admin→403; fehlt→404.
- `server.ts`: `registerDocumentRoutes({ documentsRepo, foldersRepo, storage, requireUser, requireAdmin, maxDocumentBytes })`.

## Task 4: Frontend
- `api.ts`: `AlbumDocument`, `presignDocument`, `confirmDocument`, `getFolderDocuments`, `deleteDocument`.
- `FolderView.tsx`: `DocumentList` ganz oben, nur wenn `documents.length>0`.
- `AdminFolders.tsx`: je Album „Dokumente (n/10)" — Upload (presign→PUT→confirm), Liste, Löschen (confirm).
- `styles.css`: Doc-Liste + Icons.

## Task 5: Migration live + Deploy
- Migration 010 gegen Neon (Freigabe). Build + Tests grün. Merge→push.
