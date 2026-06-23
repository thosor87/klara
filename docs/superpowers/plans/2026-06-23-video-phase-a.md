# Video-Support Phase A — Implementation Plan

> Umsetzung test-first (Backend hat vitest; Frontend: tsc/Build). Reihenfolge: Backend-Kern
> (TDD) → Routen → Migration → Frontend → Build → Migration live → Deploy.

**Goal:** Kurze Videos hochladen, freigeben, abspielen — Limits pro Clip, keine Transkodierung,
B-ready Key-Schema (`s3_key` zeigt aufs abspielbare Objekt).

**Architektur/Stack:** Wie Spec `2026-06-23-video-support-design.md`.

---

## Task 1: Storage `head(key)` (Größe)

**Files:** `backend/src/storage/s3.ts` (+ Interface), alle Storage-Fakes
(`folders/routes.test.ts`, `admin/trash-routes.test.ts`, `items/*.test.ts`, ggf. weitere).

- [ ] Test (service-Ebene später nutzt es) — kein eigener Storage-Unit-Test nötig; Interface +
  Fakes.
- [ ] Interface: `head(key: string): Promise<{ size: number } | null>`.
- [ ] S3-Impl: `HeadObjectCommand` → `{ size: ContentLength ?? 0 }`, bei 404 `null`.
- [ ] Alle Storage-Fakes um `head: async () => ({ size: 0 })` (bzw. steuerbar) ergänzen.

## Task 2: Config `maxVideoBytes`

**Files:** `backend/src/config.ts`, `backend/src/config.test.ts` (falls vorhanden).

- [ ] `maxVideoBytes`: `Number(process.env.MAX_VIDEO_BYTES ?? 157286400)` (150 MB).

## Task 3: Repo `insertPending` mit `type`

**Files:** `backend/src/items/repo.ts`, `backend/src/items/*.test.ts` (Fakes), Interface.

- [ ] Interface `insertPending` Daten um `type?: "photo" | "video"` (Default photo).
- [ ] SQL: `INSERT INTO items (..., type) VALUES (..., ${data.type ?? 'photo'})`.
- [ ] Fakes anpassen (Signatur bleibt kompatibel, optionales Feld).

## Task 4: Service `presignUpload(kind)` — TDD

**Files:** `backend/src/items/service.ts`, `backend/src/items/service.test.ts`.

- [ ] **Test:** `presignUpload(folder, "video/mp4", user, "video")` → webKey endet auf `/source`,
  `presignPut` mit `"video/mp4"`. Default/`"photo"` → `/web.jpg` (Regression).
- [ ] Impl: Signatur `presignUpload(folderId, contentType, user, kind = "photo")`; webKey =
  kind==="video" ? `items/{id}/source` : `items/{id}/web.jpg`. Thumb unverändert.

## Task 5: Service `confirmUpload(kind)` + Größencheck — TDD

**Files:** `backend/src/items/service.ts`, `service.test.ts`.

- [ ] **Test:** Video unter Limit → Item `type:"video"`, `s3Key` endet auf `/source`.
- [ ] **Test:** Video über `maxVideoBytes` → wirft `AppError("video_too_large")`,
  `storage.deleteObjects` mit [webKey, thumbKey] aufgerufen, `insertPending` NICHT aufgerufen.
- [ ] **Test:** Foto-Pfad ruft `head` nicht / legt ohne Größencheck an (Regression).
- [ ] Impl: `confirmUpload(folderId, itemId, caption, userId, user, kind = "photo")`; bei video
  webKey=`/source`; nach `headExists` für video `storage.head(webKey)` → wenn `size > maxVideoBytes`:
  `deleteObjects([webKey, thumbKey])` + throw. `insertPending({ ..., type: kind })`.
- [ ] `ItemsServiceDeps` braucht `maxVideoBytes` (aus config injizieren in server.ts).

## Task 6: Routen `kind` durchreichen + 413 — TDD

**Files:** `backend/src/items/routes.ts`, `backend/src/items/routes.test.ts`.

- [ ] **Test:** presign Body `{ contentType, kind:"video" }` → 200, Service mit kind aufgerufen.
- [ ] **Test:** confirm Body `{ itemId, caption, kind:"video" }` zu groß → 413 `video_too_large`.
- [ ] Impl: Body-Typen um `kind?: "photo"|"video"`; an Service durchreichen; AppError-Mapping
  `video_too_large` → 413.

## Task 7: Migration 008

**Files:** `migrations/008_video_type.sql`.

- [ ] CHECK-Constraint von items.type auf `('photo','document','video')` erweitern
  (drop + add constraint; Spalten-/Constraint-Name verifizieren).

## Task 8: Frontend api + Item.type

**Files:** `frontend/src/api.ts`.

- [ ] `Item.type: "photo" | "video"`.
- [ ] `presignUpload(folderId, contentType, kind?)` Body um kind.
- [ ] `confirmUpload(...)` (bzw. der Aufruf) Body um kind.

## Task 9: Frontend Upload-Pfad

**Files:** `frontend/src/upload.ts`, `frontend/src/components/UploadDialog.tsx`.

- [ ] Konstanten `MAX_VIDEO_BYTES = 157286400`, `MAX_VIDEO_SECONDS = 60`.
- [ ] `accept="image/*,video/*"`, Filter erlaubt image/* + video/*.
- [ ] Video-Helfer: Dauer prüfen (`<video>` metadata), Größe prüfen → Fehler bei Verstoß.
- [ ] Thumbnail aus Frame (~1 s) via canvas; Fallback gebündeltes Platzhalter-JPEG (Data-URL).
- [ ] Upload Original → source, Thumb → thumb.jpg; `confirmUpload(kind:"video")`.

## Task 10: Frontend Wiedergabe

**Files:** `frontend/src/components/FolderView.tsx` (Galerie-Kachel), `Lightbox.tsx`, `styles.css`,
`frontend/src/download.ts`.

- [ ] Galerie: Play-Badge bei `type==="video"`.
- [ ] Lightbox: `<video controls playsinline preload="metadata">` bei video; Diashow-Auto-Advance
  startet nicht auf Videos.
- [ ] Download: Endung je Typ.
- [ ] CSS: `.video-badge`, Lightbox-Video-Maße.

## Task 11: Build + Tests + Migration + Deploy

- [ ] `npm run build` grün, `npm --prefix backend run test` grün.
- [ ] Migration 008 gegen Neon (Freigabe einholen).
- [ ] Merge → main → push → Deploy.
