# KlaRa Video Phase B — Backend-Transkodierung (Design / Spec)

**Datum:** 2026-06-23
**Status:** zur Abnahme
**Voraussetzung erfüllt:** `thomas` (Profil `lilapixel`, Account 123456789012) hat via Gruppe
`klara-admins` die Managed Policy `KlaraPhaseBSetup` — Lambda/IAM-Rolle/S3-Notification auf
`klara-*` bzw. `klara-fotos-example` verifiziert.

## Ziel

Hochgeladene Videos werden **asynchron serverseitig transkodiert** nach **720p H.264 (+AAC)**,
sodass sie in **jedem** Browser laufen (löst HEVC/.mov aus Phase A) und kleiner werden. Die
Lambda erzeugt zugleich ein **verlässliches Thumbnail** (Phase A scheiterte daran bei HEVC).
Weil Videos ohnehin durch die Freigabe gehen, darf das alles **asynchron** passieren — niemand
wartet interaktiv.

## Entscheidungen

1. **Compute:** AWS Lambda, **arm64 (Graviton)**, **Zip + ffmpeg-Layer** (kein ECR) → dauerhaft
   im Always-Free-Tier, 0 €/Monat.
2. **Trigger:** S3 `ObjectCreated` auf `klara-fotos-example`, gefiltert auf Suffix `/source`
   (nur Video-Originale; Fotos `web.jpg`/Thumbs `thumb.jpg` triggern NICHT → keine Schleife).
3. **„Fertig"-Signal: Lambda → Neon direkt.** Die Lambda updatet die Zeile (`s3_key`, `processing`)
   über die öffentliche Neon-Pooler-URL (`prepare:false`). Sauberste UX (Item flippt sofort),
   kein Frontend-Dauerpolling nötig außer leichtem Refresh.
4. **B-ready aus Phase A bleibt:** `items.s3_key` zeigt aufs abspielbare Objekt. Lambda schreibt
   `web.mp4`, setzt `s3_key=items/{id}/web.mp4`, löscht `source`.

## Ablauf (End-to-End)

1. Client lädt Original → `items/{id}/source` (+ Browser-Thumbnail → `thumb.jpg`), `confirmUpload`
   legt das Item an mit **`type='video'`, `processing=true`**, `s3_key='items/{id}/source'`.
2. S3-Event (`/source`) triggert **`klara-video-transcoder`**.
3. Lambda: lädt `source` nach `/tmp`, ffmpeg → `web.mp4` (H.264 high@720p, AAC 128k, faststart),
   ffmpeg-Frame (~1 s) → `thumb.jpg` (überschreibt Browser-Thumb). Beide nach S3 hoch.
4. Lambda updatet Neon: `s3_key='items/{id}/web.mp4'`, `processing=false`. Löscht `source`.
5. App: Video ist „ready" — Galerie/Lightbox/Freigabe spielen `web.mp4` (überall abspielbar).

**Fehlerfall (ffmpeg scheitert, z. B. korrupt):** Lambda setzt `processing=false`, lässt
`s3_key=source` (Fallback: Original abspielbar, ggf. nur in Safari) und loggt den Fehler. Kein
Item bleibt ewig in „processing".

## Datenmodell — Migration 009

```sql
alter table items add column if not exists processing boolean not null default false;
```
- Foto-Items: immer `processing=false`.
- Video-Items: `confirmUpload` setzt `processing=true`; Lambda setzt es auf `false`.
- **Bestands-Videos aus Phase A** (bereits hochgeladen, `s3_key=…/source`): bekommen per Default
  `processing=false` → gelten als „ready" und spielen das Original (ggf. nur Safari). Optional
  einmalig nachtranskodieren (manuelles Re-Trigger durch erneutes Schreiben von `/source`), aber
  kein Muss — bei eurem Stand sind das ein, zwei Testclips.

## Backend (App) Änderungen

- `insertPending` / `confirmUpload`: bei `kind='video'` → `processing=true` schreiben.
- `mapItem` + API `Item`/`PendingItem`: Feld `processing: boolean` mitliefern.
- **Listen filtern NICHT** auf processing (Items sind sichtbar, nur als „in Arbeit" markiert),
  außer: **Freigabe** — ein Video, das noch `processing=true` ist, kann **nicht freigegeben**
  werden (Button deaktiviert, Hinweis „wird noch verarbeitet"); sobald ready, normal freigebbar.
- TDD: `confirmUpload(video)` setzt processing=true (Service-Test); Foto-Pfad bleibt false.

## Frontend Änderungen

- `Item.processing` im Typ.
- **Galerie/Trash/Freigabe-Grid:** Video-Kachel mit `processing` zeigt statt Play-Badge einen
  „⏳ wird verarbeitet"-Overlay; Klick öffnet zwar, aber Lightbox zeigt „Video wird noch
  verarbeitet …" statt Player.
- **Lightbox / ApprovalLightbox:** bei `processing` Platzhalter statt `<video>`.
- **Leichtes Polling:** In Album-Ansicht + Freigabe-Queue: solange ein sichtbares Item
  `processing=true` ist, alle ~10 s neu laden (stoppt, wenn keins mehr verarbeitet). Kein
  globales Dauerpolling.
- Frontend hat keine Test-Infra → Build + manuell.

## Lambda — Paket & Deploy

**Struktur (neu im Repo, `lambda/video-transcoder/`):**
- `index.mjs` — Handler: S3-Event → key parsen → ffmpeg → upload → Neon-Update.
- `package.json` — Dep `postgres` (für Neon). Kein AWS-SDK-Dep nötig (in Lambda-Runtime vorhanden).
- `build-layer.sh` — lädt statisches **arm64-Linux-ffmpeg** (johnvansickle static build), packt
  `layer.zip` (`bin/ffmpeg`), `PublishLayerVersion` als `klara-ffmpeg`.
- `deploy.sh` — `npm ci --omit=dev`, zippt Handler+node_modules, legt (idempotent) die
  Execution-Rolle + Inline-Policy an, `CreateFunction`/`UpdateFunctionCode` (`klara-video-
  transcoder`, arm64, Node 20, Layer angehängt, Timeout 300 s, Memory 2048 MB, Ephemeral
  `/tmp` 4096 MB, Env `DATABASE_URL`), `AddPermission` für S3-Invoke, dann
  `PutBucketNotificationConfiguration` (Suffix `/source`). Alles via `--profile lilapixel`.

**Execution-Rolle `klara-video-transcoder-role`** (Inline-Policy):
- `s3:GetObject/PutObject/DeleteObject` auf `klara-fotos-example/*`,
- `logs:CreateLogGroup/CreateLogStream/PutLogEvents` auf `/aws/lambda/klara-video-transcoder`.
- Trust: `lambda.amazonaws.com`.

**ffmpeg-Aufrufe:**
- Transkode: `ffmpeg -i source -vf "scale='min(1280,iw)':'-2'" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart web.mp4` (720p-Kante, sinnvolle Größe/Qualität).
- Thumb: `ffmpeg -ss 1 -i source -frames:v 1 -vf "scale='min(640,iw)':'-2'" thumb.jpg`.

**Secrets:** `DATABASE_URL` als Lambda-Env (gleiche Neon-Pooler-URL wie Vercel). Wird beim Deploy
gesetzt; nicht im Repo. `prepare:false`, `ssl:'require'`, `max:1`.

## Sicherheit / Kosten

- Lambda läuft außerhalb VPC (Neon ist öffentlich erreichbar, TLS).
- Kosten: Compute Always-Free (1 Mio Req + 400k GB-s/Monat), Layer/Code-Storage gratis → **0 €**.
- Keine neuen offenen Ports/Endpunkte; S3 bleibt privat.

## Teststrategie

- **Backend-App (vitest, TDD):** `confirmUpload(video)` → processing=true; processing im mapItem;
  Freigabe-Gating (kann processing-Video nicht approven — Service/Route-Test).
- **Lambda:** Handler-Logik (key-parsing, Neon-Update-Aufruf) wo sinnvoll unit-testbar; das
  ffmpeg-Transkodieren wird **per echtem Test-Upload** in S3 integрations-verifiziert (manuell):
  kurzes .mov hochladen → prüfen, dass `web.mp4`+`thumb.jpg` entstehen, `processing` flippt,
  Wiedergabe in Chrome läuft.
- **Migration 009** gegen Neon (mit Freigabe) vor Deploy der App.

## Reihenfolge der Umsetzung

1. App-Backend (Migration 009, processing-Feld, confirmUpload, Freigabe-Gating) — TDD.
2. App-Frontend (processing-UI, Polling).
3. Lambda (Handler, build-layer.sh, deploy.sh) + AWS-Setup (Rolle, Layer, Funktion, Trigger)
   via `--profile lilapixel`.
4. Integrationstest mit echtem Clip; dann App-Deploy.

## Offene Punkte / Risiken

- **DATABASE_URL in Lambda:** muss gesetzt werden (kein Repo). Beim Deploy als Env übergeben.
- **Kaltstart**-Latenz (Zip+Layer gering) — egal, da asynchron.
- **Sehr große/lange Clips** trotz Phase-A-Limit (150 MB/60 s): Lambda Timeout 300 s + 2 GB RAM
  reichen für 60-s-720p locker.
- **Doppel-Trigger** bei erneutem `source`-Put: idempotent (überschreibt web.mp4/thumb, setzt
  processing erneut false) — unkritisch.
