# Video Phase B — Implementation Plan

> Test-first auf der App-Seite (vitest); Lambda/AWS per Skript + Integrationstest. Siehe Spec
> `2026-06-23-video-phase-b-design.md`.

**Goal:** Videos asynchron via Lambda+ffmpeg nach 720p H.264 transkodieren (+Thumbnail), Status
über `items.processing`, Lambda→Neon meldet fertig.

## Task 1: Migration 009
- `migrations/009_video_processing.sql`: `alter table items add column if not exists processing boolean not null default false;`

## Task 2: Backend processing + Gating (TDD)
**Files:** `backend/src/items/repo.ts` (insertPending+mapItem+setStatusApproved), `service.ts`,
`items/service.test.ts`, evtl. `routes.test.ts`.
- [ ] mapItem liefert `processing` (r.processing).
- [ ] `insertPending` Daten um `processing?: boolean`; SQL schreibt es.
- [ ] `confirmUpload(kind='video')` → `processing:true` an insertPending (Test: video→true, foto→false/absent).
- [ ] `setStatusApproved(ids)` SQL: `... AND processing = false` (processing-Videos werden NICHT approved). Test über Service `approve`.
- [ ] `Item`/`ItemWithFolderName` Typ um `processing: boolean`.

## Task 3: Frontend processing
**Files:** `frontend/src/api.ts` (Item.processing), `Gallery.tsx`, `Lightbox.tsx`,
`ApprovalLightbox.tsx`, `ApprovalQueue.tsx`, `FolderView.tsx`, `styles.css`.
- [ ] `Item.processing?: boolean`.
- [ ] Galerie/Approval-Grid: bei `processing` „⏳ wird verarbeitet"-Overlay statt Play-Badge.
- [ ] Lightbox + ApprovalLightbox: bei `processing` Platzhalter statt `<video>`.
- [ ] ApprovalQueue: Freigeben-Button für processing-Item deaktiviert.
- [ ] Polling: FolderView + ApprovalQueue laden alle 10 s neu, solange ein Item processing ist.

## Task 4: Lambda-Code
**Files (neu):** `lambda/video-transcoder/{index.mjs,package.json}`, `lambda/video-transcoder/build-layer.sh`, `lambda/video-transcoder/deploy.sh`, `lambda/README.md`.
- [ ] `index.mjs`: parse `items/{id}/source` → download /tmp → ffmpeg web.mp4 + thumb.jpg → upload → `update items set s3_key, processing=false where id` → delete source. Fehler: `processing=false`, source behalten.
- [ ] `package.json`: dep `postgres` (AWS SDK v3 ist in Node20-Runtime vorhanden).
- [ ] `build-layer.sh`: statisches arm64-ffmpeg → `layer.zip` (`bin/ffmpeg`) → PublishLayerVersion `klara-ffmpeg`.
- [ ] `deploy.sh`: Rolle `klara-video-transcoder-role` (trust+inline s3/logs), zip Handler+node_modules, Create/Update `klara-video-transcoder` (arm64, nodejs20, Layer, 300s, 2048MB, /tmp 4096MB, Env DATABASE_URL), AddPermission S3, PutBucketNotification (Suffix `/source`). Alles `--profile lilapixel`.

## Task 5: AWS-Setup ausführen
- [ ] `build-layer.sh` (Layer publish).
- [ ] `deploy.sh` mit DATABASE_URL (aus Vercel/.env) — legt Rolle/Funktion/Trigger an.

## Task 6: Migration live + Deploy + Integrationstest
- [ ] Migration 009 gegen Neon (Freigabe).
- [ ] App build + backend tests grün; merge → push.
- [ ] Echten kurzen Clip hochladen → web.mp4+thumb.jpg entstehen, processing flippt, Chrome-Wiedergabe ok.
