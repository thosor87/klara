# KlaRa Album-Dokumente — Design / Spec

**Datum:** 2026-06-24
**Status:** zur Abnahme

## Ziel

Die Lehrerin (Admin) kann **pro Album bis zu 10 Dokumente** hinterlegen (z. B. Elternbriefe,
Listen, Formulare). **Normale Nutzer können keine Dokumente hochladen** — nur ansehen/herunterladen.
In der Albumansicht erscheinen die Dokumente **ganz oben als Liste, über Bildern und Videos**.

## Entscheidungen

1. **Eigene Tabelle `documents`** (nicht `items` überladen): Dokumente haben kein Thumbnail, keine
   Freigabe, sind admin-only und brauchen den Originaldateinamen. Eigene Tabelle ist sauberer.
2. **Freies Format** (beliebiger Content-Type) erlaubt. (docx/xlsx/pdf sind der Hauptfall, aber
   nicht erzwungen.)
3. **Admin-only Upload/Löschen**; **Mitglieder** mit Klassen-Sichtbarkeit aufs Album dürfen
   **lesen/herunterladen** (gleiche Sichtbarkeits-Gates wie Fotos).
4. **Keine Freigabe** — die Lehrerin ist vertrauenswürdig, Dokumente sind sofort sichtbar.
5. **Limit 10 pro Album** (server-seitig erzwungen) + **Größenlimit 25 MB pro Dokument**
   (server-seitig, konfigurierbar `MAX_DOCUMENT_BYTES`).

## Datenmodell — Migration 010

```sql
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid not null references folders(id) on delete cascade,
  filename     text not null,            -- Originalname für den Download
  content_type text not null,
  size_bytes   bigint not null default 0,
  s3_key       text not null,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists documents_folder_idx on documents (folder_id);
```

## Storage

- Key: `documents/{docId}` (eine Datei pro Dokument; Originalname steckt in der DB).
- Download: `presignGet(key, { ResponseContentDisposition: 'attachment; filename="…"', ResponseContentType })`
  → Browser lädt mit Originalname + korrektem Typ. Dafür `Storage.presignGet` um optionale
  Response-Header erweitern (oder eine neue `presignDownload(key, filename, contentType)`).
- Löschen: `deleteObjects([key])`.

## Backend

**Repo `DocumentsRepo`** (`backend/src/documents/repo.ts`):
- `listByFolder(folderId): Promise<DocumentRow[]>`
- `countByFolder(folderId): Promise<number>`
- `insert({ id, folderId, filename, contentType, sizeBytes, s3Key, uploadedBy }): Promise<DocumentRow>`
- `findById(id): Promise<DocumentRow | null>`
- `deleteById(id): Promise<{ s3Key } | null>`

**Service/Routes** (`backend/src/documents/routes.ts`, kleine Logik ggf. inline oder Service):
- `POST /api/admin/folders/:folderId/documents/presign` (requireAdmin)
  - Folder existiert? `countByFolder >= 10` → 409 `document_limit_reached`.
  - `{ docId, uploadUrl }` (presignPut `documents/{docId}` mit contentType aus Body).
- `POST /api/admin/folders/:folderId/documents` (requireAdmin) — confirm
  - Body `{ docId, filename, contentType }`. `headExists` + `storage.head` Größe ≤ `MAX_DOCUMENT_BYTES`
    sonst Objekt löschen + 413 `document_too_large`. Erneuter `countByFolder >= 10`-Check (Race).
  - `insert(...)` → 201 Dokument.
- `GET /api/folders/:folderId/documents` (requireUser, **klassen-gegated** wie Fotos: nur wenn
  `isVisibleToClass` oder Admin) → Liste mit `downloadUrl` (presigned), `filename`, `contentType`,
  `sizeBytes`, `createdAt`.
- `DELETE /api/admin/documents/:docId` (requireAdmin) → `deleteById` + `deleteObjects`.

**Config:** `maxDocumentBytes` (Default `26214400` = 25 MB).

**Registrierung** in `server.ts` (`registerDocumentRoutes({ documentsRepo, foldersRepo, storage, requireUser, requireAdmin, maxDocumentBytes })`).

## Frontend

**API (`api.ts`):** Typ `AlbumDocument { id, filename, contentType, sizeBytes, createdAt, downloadUrl }`;
`presignDocument`, `confirmDocument`, `getFolderDocuments`, `deleteDocument`.

**Albumansicht (`FolderView.tsx`):** ganz oben (vor dem Galerie-Toolbar) eine **`DocumentList`** —
nur wenn `documents.length > 0`. Pro Eintrag: Typ-Icon (pdf/docx/xlsx/generisch), Dateiname,
Größe, Download-Link (`downloadUrl`, öffnet/lädt mit Originalname). Für Mitglieder rein lesend.

**Albenverwaltung (`AdminFolders.tsx`):** je Album ein Bereich **„Dokumente (n/10)"** —
Upload-Button (Datei wählen → presign → PUT → confirm), Liste der vorhandenen Dokumente mit
Löschen (Bestätigung via `useConfirm`). Upload sperrt bei 10/10. Fehlertexte für zu groß / Limit.

Frontend hat keine Test-Infra → Build + manuell.

## Teststrategie (TDD, Backend)

- **Repo/Service via Fakes** in Routen-Tests:
  - presign: Folder fehlt → 404; `count >= 10` → 409; sonst 200 + `documents/{id}`-Key.
  - confirm: zu groß → 413 + `deleteObjects` + kein insert; ≤ Limit → 201, Felder korrekt;
    `count >= 10` beim confirm → 409.
  - GET: Admin sieht; Mitglied ohne Sichtbarkeit → 404/403; mit Sichtbarkeit → Liste + downloadUrl.
  - DELETE: admin löscht Row + S3; non-admin → 403.
- **Storage-Fake** ggf. um `presignGet`-Optionen / `head` (existiert schon) erweitern; alle
  bestehenden Fakes anpassen.
- **Migration 010** gegen Neon (Freigabe) vor App-Deploy.

## Reihenfolge

1. Migration 010 + `DocumentsRepo`.
2. Storage-Download-Presign (Content-Disposition).
3. Routen + Config (TDD).
4. Frontend API + `DocumentList` (FolderView) + Verwaltung (AdminFolders).
5. Migration live + Build/Tests + Deploy.

## Offene Punkte / Risiken

- **Größenlimit 25 MB** und **10 Dokumente** ok? (Vorschlag, anpassbar.)
- Dokumente zählen **nicht** in den Foto/Video-Bulk-ZIP-Download (separate Liste).
- Dateiname-Sanitizing für Content-Disposition (Anführungszeichen/Sonderzeichen escapen).
