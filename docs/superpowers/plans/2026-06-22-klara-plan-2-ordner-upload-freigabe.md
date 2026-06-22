# KlaRa Plan 2 — Ordner + Upload + Freigabe + Admin-Verwaltung

> **For agentic workers:** Use TDD per task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** KlaRa wird zur echten App: Ordner (nach Schuljahr/Klasse), Foto-Upload direkt nach S3 (Client verkleinert + entfernt EXIF), Freigabe-Workflow (einzeln + Masse), und Admin-Verwaltung von Nutzern (pending bestätigen, Mitglieder anlegen, Rollen, deaktivieren). Mitglieder sehen freigegebene Fotos in einem einfachen Grid (die schöne Galerie ist Plan 3).

**Architecture:** Baut auf Plan 1 (Fastify-Monolith, Postgres, signiertes Session-Cookie). Neu: S3-Storage-Modul (presigned URLs, privater Bucket `klara-fotos-example`), generische `items`-Tabelle, Auth-Guards (`requireUser`/`requireAdmin`) als wiederverwendbares Extrakt aus Plan 1. Fotos laufen **nie** durch die Function — Up-/Download direkt Client↔S3 via presigned URL.

**Tech Stack:** zusätzlich `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Frontend: Canvas-Resize (EXIF-Strip) im Browser.

**Infra (bereits provisioniert):** Bucket `klara-fotos-example` (eu-central-1, privat, BucketOwnerEnforced, CORS für PUT/GET vom App-Origin). Runtime-User `klara-ses` hat `s3:PutObject/GetObject/DeleteObject` auf den Bucket. Vercel-Env: `S3_BUCKET`, `S3_REGION`.

---

## Datenmodell (Migration `migrations/002_folders_items.sql`)

```sql
create table if not exists folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  school_year text not null default '',
  class_label text not null default '',
  enabled     boolean not null default true,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table if not exists items (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references folders(id) on delete cascade,
  type        text not null default 'photo' check (type in ('photo','document')),
  status      text not null default 'pending' check (status in ('pending','approved','trashed')),
  s3_key      text not null,
  thumb_key   text not null,
  caption     text not null default '',
  uploaded_by uuid references users(id),
  approved_by uuid references users(id),
  created_at  timestamptz not null default now(),
  trashed_at  timestamptz
);
create index if not exists items_folder_status_idx on items (folder_id, status);
create index if not exists items_status_idx on items (status);
```

S3-Key-Konvention (Server berechnet sie, **nie** dem Client vertrauen):
`items/<itemId>/web.jpg` und `items/<itemId>/thumb.jpg`.

## Config-Erweiterung (`backend/src/config.ts`)

Ergänze:
```ts
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "eu-central-1",
```
AWS-Credentials kommen wie bei SES über die Chain (statische Keys, wenn gesetzt — `klara-ses` auf Vercel).

## Modulgrenzen (neu)

| Datei | Verantwortung |
|---|---|
| `backend/src/storage/s3.ts` | `Storage`-Interface + S3-Impl: `presignPut`, `presignGet`, `headExists`, `deleteObjects`. Kennt keine Geschäftslogik. |
| `backend/src/auth/guard.ts` | `requireUser`/`requireAdmin` (aus Plan-1-`currentUser` extrahiert), wiederverwendbar in allen Route-Modulen. |
| `backend/src/folders/repo.ts` + `routes.ts` | Folder-CRUD (Admin), Liste (Member: nur `enabled`). |
| `backend/src/items/repo.ts` + `service.ts` + `routes.ts` | Upload-Presign, Confirm (HeadObject → Insert pending), Listen mit presigned GET-URLs, Freigabe-Übergänge. |
| `backend/src/admin/users-routes.ts` | Nutzer-Verwaltung (Liste, anlegen, Rolle/Status ändern). |
| `frontend/src/*` | Ordner-Ansicht, Upload (Canvas-Resize), Freigabe-Queue, Admin-Nutzer, einfaches Grid freigegebener Fotos. |

## Endpoint-Verträge (alle unter `/api`, JSON; Authz angegeben)

**Auth-Guard-Verhalten:** `requireUser` → 401 wenn nicht eingeloggt/aktiv. `requireAdmin` → 403 wenn nicht `admin`. Member sehen nie `pending`/`trashed` Items (404, nicht 403 — Existenz nicht verraten).

### Ordner
- `GET /api/folders` (user) → `[{id,name,schoolYear,classLabel,enabled,itemCount}]`. Member: nur `enabled`. Admin: alle.
- `POST /api/admin/folders` (admin) `{name, schoolYear?, classLabel?}` → erzeugter Folder.
- `PATCH /api/admin/folders/:id` (admin) `{name?, schoolYear?, classLabel?, enabled?}` → aktualisierter Folder.

### Upload (zweistufig: presign → confirm)
- `POST /api/folders/:folderId/uploads/presign` (user) `{contentType}` → prüft Folder existiert+`enabled`; erzeugt `itemId`=uuid; Keys `items/<itemId>/web.jpg`,`/thumb.jpg`; → `{itemId, webUploadUrl, thumbUploadUrl}` (presigned PUT, 10 Min). Legt **keine** DB-Zeile an.
- `POST /api/folders/:folderId/items` (user) `{itemId, caption?}` → Server berechnet Keys aus `itemId`, prüft per `headExists` dass **beide** Objekte in S3 liegen (sonst 400 `upload_incomplete`), INSERT `item` `status=pending`, `uploaded_by`=user. → erzeugtes Item.

### Listen (mit presigned GET-URLs, 1 h)
- `GET /api/folders/:folderId/items` (user) → Member: nur `approved`. → `[{id,caption,status,createdAt,thumbUrl,webUrl}]`.
- `GET /api/admin/pending` (admin) → alle `pending` Items über alle Ordner `[{id,folderId,folderName,caption,createdAt,thumbUrl,webUrl}]` (für Freigabe-Queue + Badge).

### Freigabe (admin, Masse-fähig)
- `POST /api/admin/items/approve` (admin) `{ids:[uuid]}` → setzt für alle übergebenen **pending** Items `status=approved`, `approved_by`=admin. → `{approved:n}`.
- `POST /api/admin/items/reject` (admin) `{ids:[uuid]}` → setzt `status=trashed`, `trashed_at=now()`. → `{rejected:n}`.

### Admin-Nutzerverwaltung
- `GET /api/admin/users` (admin) → `[{id,email,role,status,createdAt}]`.
- `POST /api/admin/users` (admin) `{email, role?='member'}` → legt `status=active` User an (Allowlist-Eintrag); idempotent per `on conflict (email) do update set status='active'`. → User.
- `PATCH /api/admin/users/:id` (admin) `{status?, role?}` → bestätigt pending (→active), deaktiviert (→disabled), ändert Rolle. **Guard:** der eigene Account darf nicht deaktiviert oder von admin→member gesetzt werden (400 `cannot_modify_self`).

## Reihenfolge der Tasks

**Backend-Fundament:** (1) Migration 002, (2) Config-S3, (3) Storage-Modul (TDD mit S3-Mock), (4) Auth-Guard-Extrakt (`requireUser`/`requireAdmin`, TDD).
**Backend-Features:** (5) Folders repo+routes (TDD), (6) Items repo+service+routes: presign/confirm/list/freigabe (TDD mit Fakes für Storage+Repo), (7) Admin-Users routes (TDD).
**Verdrahtung:** (8) alle neuen Routen in `server.ts`/`defaultRuntime` registrieren; Storage-Adapter bauen.
**Frontend:** (9) API-Client erweitern, (10) Ordner-Ansicht + Admin-Folder-Mgmt, (11) Upload (Canvas-Resize/EXIF-Strip → presign → PUT → confirm), (12) Freigabe-Queue (Grid, Mehrfachauswahl, approve/reject), (13) Admin-Nutzer-Ansicht, (14) einfaches Grid freigegebener Fotos pro Ordner.

## Schlüssel-Code: Storage-Modul (`backend/src/storage/s3.ts`)

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export interface Storage {
  presignPut(key: string, contentType: string): Promise<string>;
  presignGet(key: string): Promise<string>;
  headExists(key: string): Promise<boolean>;
  deleteObjects(keys: string[]): Promise<void>;
}

export function createS3Storage(): Storage {
  const hasStatic = Boolean(config.ses.accessKeyId && config.ses.secretAccessKey);
  const client = new S3Client({
    region: config.s3Region,
    ...(hasStatic
      ? { credentials: { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey } }
      : {}),
  });
  const Bucket = config.s3Bucket;
  return {
    async presignPut(key, contentType) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), { expiresIn: 600 });
    },
    async presignGet(key) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });
    },
    async headExists(key) {
      try { await client.send(new HeadObjectCommand({ Bucket, Key: key })); return true; }
      catch { return false; }
    },
    async deleteObjects(keys) {
      if (!keys.length) return;
      await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
    },
  };
}
```
(`config.ses.accessKeyId/secretAccessKey` werden für die AWS-Chain wiederverwendet — dieselben `klara-ses`-Keys gelten für S3 und SES.)

## Schlüssel-Code: Client-Resize + EXIF-Strip (`frontend/src/upload.ts`)

Canvas-Re-Encode entfernt EXIF inhärent. Web max 2048 px lange Kante, Thumb max 400 px.

```ts
async function fileToResizedBlob(file: File, maxEdge: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}

export async function makeWebAndThumb(file: File): Promise<{ web: Blob; thumb: Blob }> {
  return { web: await fileToResizedBlob(file, 2048), thumb: await fileToResizedBlob(file, 400) };
}

export async function putToS3(url: string, blob: Blob): Promise<void> {
  const res = await fetch(url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}
```
Wichtig: Der `content-type` beim PUT muss zu dem passen, mit dem presigned wurde (`image/jpeg`). Der Presign-Request schickt also `{contentType:"image/jpeg"}`.

## TDD-Schwerpunkte
- **Storage:** Unit-Tests mit gemocktem S3-Client (vi.fn auf `client.send`), prüfen dass die richtigen Commands/Keys/Bucket genutzt werden und `headExists` `false` bei Fehler liefert.
- **Items-Service:** Fakes für `ItemsRepo` + `Storage`; Tests für: presign liefert beide URLs; confirm verweigert wenn `headExists` false; confirm legt pending an; approve/reject nur auf pending; Member-Liste filtert auf approved.
- **Guards:** Tests dass `requireAdmin` Member mit 403 ablehnt, nicht eingeloggt mit 401.
- **Admin-Users:** `cannot_modify_self`-Guard getestet.
- **Status-Übergänge** und **Berechtigungsgrenzen** sind die wichtigsten Fälle.

## Definition of Done (Plan 2)
- Alle Backend-Tests grün; `npm run build` sauber.
- Migration 002 gegen Neon ausgeführt.
- Manuell/automatisiert verifiziert (gegen echten Bucket): Upload (presign→PUT→confirm) legt pending an; Admin sieht es in der Queue; approve macht es für Member sichtbar; reject → trashed; Admin kann Ordner anlegen/abschalten und Nutzer verwalten.
- Member sehen nie pending/trashed.
