# KlaRa Video-Support — Design / Spec

**Datum:** 2026-06-23
**Status:** zur Abnahme

## Ziel

KlaRa soll neben Fotos auch **kurze Videos** aufnehmen können — hochgeladen von Eltern/Kindern,
durch die Lehrerin (Admin) freigegeben, dann für die Klasse sichtbar. Genau wie Fotos durchlaufen
Videos die Freigabe-Warteschlange (`pending` → `approved`).

Die Umsetzung erfolgt in **zwei Phasen**:

- **Phase A (dieses Spec):** Videos grundsätzlich — Upload mit Pro-Clip-Limits, Thumbnail im
  Browser, Wiedergabe per `<video>`. **Keine** Transkodierung.
- **Phase B (späteres, eigenes Spec):** asynchrone Backend-Komprimierung via S3-getriggerter
  AWS-Lambda (ffmpeg) → 720p H.264. Phase A wird **B-ready** verdrahtet, sodass Phase B nur
  „andockt".

## Entscheidungen (aus der Vorbesprechung)

1. **Limits pro Clip**, beim Upload geprüft — **kein** globales Speicherkontingent.
   - Standard (konfigurierbar): **max. 60 s Dauer**, **max. 150 MB Dateigröße**.
2. **Keine Transkodierung in Phase A.** Handy-Videos sind bereits H.264/HEVC-komprimiert.
   - Bekannter, akzeptierter Nachteil: HEVC/.mov spielt nicht in jedem Browser. Das löst erst
     Phase B. Da Videos ohnehin durch die Freigabe gehen, ist das Risiko eingegrenzt.
3. **B-ready Key-Schema** (siehe unten), damit Phase B keinen Umbau erzwingt.

## Architektur

### Storage-Key-Schema

| Item-Typ | abgespielter Key (`s3_key`) | Thumbnail (`thumb_key`) |
|----------|------------------------------|--------------------------|
| photo    | `items/{id}/web.jpg`         | `items/{id}/thumb.jpg`   |
| video (Phase A) | `items/{id}/source` (Original, Original-Content-Type) | `items/{id}/thumb.jpg` |
| video (Phase B) | `items/{id}/web.mp4` (transkodiert) — Lambda setzt `s3_key` um | `items/{id}/thumb.jpg` |

**Kernidee für B-Readiness:** `items.s3_key` zeigt **immer auf das aktuell abspielbare Objekt**.
In Phase A ist das die Originaldatei (`source`). In Phase B transkodiert die Lambda `source` →
`web.mp4` und setzt `s3_key` auf `web.mp4` um (und löscht ggf. `source`). Die App spielt stets
`s3_key` — **keine App-Änderung in Phase B nötig**. Ein „wird verarbeitet"-Zustand kommt erst in
Phase B dazu.

### Datenmodell

- `items.type` existiert bereits (`text not null default 'photo'`), aber die CHECK-Constraint
  erlaubt nur `('photo','document')`. **Migration 008** erweitert sie auf
  `('photo','document','video')`.
- `items.s3_key` / `thumb_key` / `caption` / `status` / `trashed_at` bleiben unverändert.
- Repo `insertPending` bekommt einen optionalen `type`-Parameter (Default `'photo'`).

### Backend-Fluss (presign → upload → confirm)

**presignUpload** (`POST /api/folders/:folderId/uploads/presign`)
- Body erweitert: `{ contentType: string; kind?: "photo" | "video" }` (Default `"photo"`).
- `kind === "video"`:
  - Web-Key = `items/{id}/source`, presigned PUT mit dem übergebenen `contentType`
    (z.B. `video/mp4`, `video/quicktime`).
  - Thumb-Key = `items/{id}/thumb.jpg` (image/jpeg) wie gehabt.
- `kind === "photo"`: unverändert (`web.jpg`).
- Rückgabe zusätzlich `kind` zurückspiegeln ist nicht nötig; der Client kennt ihn.

**confirmUpload** (`POST /api/folders/:folderId/items`)
- Body erweitert: `{ itemId, caption, kind?: "photo" | "video" }`.
- Beide Objekte müssen existieren (`headExists`) — wie heute.
- **Server-seitige Größenprüfung (neu, nur Video):** über `storage.head(webKey)` die
  `ContentLength` holen. Ist sie > `maxVideoBytes`, **Objekt(e) löschen** und Fehler
  `video_too_large` (HTTP 413). Das ist die harte Schranke (presigned PUT kann Größe selbst
  nicht erzwingen; Client-Check ist nur UX).
- `insertPending` mit `type: kind === "video" ? "video" : "photo"` und `s3Key` = der jeweilige
  Web/Source-Key.

**Storage-Interface** bekommt eine Methode
`head(key): Promise<{ size: number } | null>` (S3 `HeadObject`, liefert `ContentLength`).
`headExists` kann darauf aufbauen oder bleibt daneben bestehen.

**Limits — Quelle der Wahrheit:**
- `maxVideoBytes` (150 MB) lebt in der **Backend-Config** (`backend/src/config.ts`, via Env
  überschreibbar) und wird **serverseitig autoritativ erzwungen** (Größenprüfung in `confirmUpload`).
- Client hält **dieselben Werte als Konstanten** (`frontend/src/upload.ts`: `MAX_VIDEO_BYTES`,
  `MAX_VIDEO_SECONDS`) nur für die UX-Vorprüfung. **Kein neuer Endpoint, kein Server→Client-
  Transport** — die Zahlen werden manuell synchron gehalten; driften sie, gewinnt der Server
  (lehnt ab). `maxVideoSeconds` (60 s) ist reine Client-Konstante (Server prüft Dauer nicht,
  ffprobe fehlt).

### Frontend

**Upload (`UploadDialog` + `upload.ts`)**
- `accept="image/*,video/*"`; Verzweigung nach `file.type`.
- **Foto-Pfad:** unverändert (Canvas → JPEG, EXIF-Strip).
- **Video-Pfad:**
  1. **Client-Validierung vor Upload:** `file.size <= maxVideoBytes` und Dauer (`<video>`
     metadata, `video.duration`) `<= maxVideoSeconds`. Sonst klare Fehlermeldung, kein Upload.
  2. **Thumbnail extrahieren:** Video in ein `<video>` laden, auf ~1 s seeken,
     Frame in `<canvas>` zeichnen → `image/jpeg`-Blob. Schlägt das fehl (z.B. HEVC in
     Nicht-Safari, oder `seeked`-Timeout), wird ein **gebündeltes Platzhalter-JPEG**
     (ein dunkles Kachelbild mit Film-Symbol, als Modul-importierter Asset/Data-URL in
     `upload.ts`) als `thumb.jpg` hochgeladen. So ist `thumbExists` in `confirmUpload` immer
     erfüllt; die Galerie zeigt zusätzlich ein Play-Badge.
  3. **Upload:** Original-Video unverändert per presigned PUT → `source`; Thumbnail → `thumb.jpg`.
  4. `confirmUpload` mit `kind: "video"`.
- Fortschrittsanzeige für den (potenziell minutenlangen) Video-Upload wäre wünschenswert; für
  Phase A genügt ein „lädt hoch …"-Busy-State (XHR-Progress optional, kein Muss).

**Wiedergabe**
- `Item` bekommt im Frontend `type: "photo" | "video"` (Backend liefert es via `mapItem`).
- **Galerie-Kachel:** Video zeigt das Thumbnail + ein **Play-Badge** (Overlay-Dreieck).
- **Lightbox:** bei `type === "video"` ein `<video controls playsinline preload="metadata">`
  mit `src = webUrl` statt `<img>`. Swipe/Tasten-Navigation bleibt; die **Diashow überspringt
  Videos** (oder pausiert nicht automatisch auf ihnen — Entscheidung: Auto-Advance-Timer startet
  bei Videos nicht, der Nutzer steuert manuell weiter).
- **Download:** lädt `webUrl` (Original) mit passender Endung. `buildFilename` um Endung je Typ
  ergänzen.

### Freigabe / Trash / Bulk-Download (unverändert)

- Videos sind `pending` → erscheinen in der Freigabe-Warteschlange (`ReportsQueue`/Approval) wie
  Fotos. Approval/Reject/Unapprove arbeiten auf Item-IDs → keine Änderung.
- Trash, endgültiges Löschen, Soft-Delete-Album: arbeiten auf Keys/IDs → funktionieren ohne
  Änderung (löschen `source`/`web.mp4` + `thumb.jpg` via `deleteObjects`).
- Der **Bulk-Foto-Download** in der Album-Ansicht: Videos sollten dort sinnvoll behandelt werden
  (mit-herunterladen oder ausschließen). Entscheidung: **Videos aus dem Bulk-„alle als ZIP"
  ausschließen** (zu groß), einzeln per Lightbox-Download möglich. (Falls der Bulk-Download
  client-seitig Bilder in eine ZIP packt, würde Video das sprengen.)

## Phase-B-Forward-Compat (nur Notizen, NICHT Teil dieser Umsetzung)

- Lambda liest `items/{id}/source`, schreibt `items/{id}/web.mp4` (720p H.264), erzeugt ggf. ein
  besseres Thumbnail, setzt `items.s3_key = web.mp4`, löscht `source`.
- Statusmeldung „fertig": App **pollt** S3/Item (Lambda bleibt isoliert) — Designentscheidung in
  Phase B. Ein `processing`-Flag/Status kommt dann dazu.
- Nichts in Phase A verbaut diesen Pfad: `s3_key` ist die einzige „Quelle der Wahrheit" fürs
  Abspielen.

## Teststrategie (TDD)

Backend hat vitest; **Frontend hat keine Test-Infra** → Frontend-Änderungen werden per
`tsc`/Build + manuell verifiziert. TDD-Fokus liegt auf dem Backend:

- **presignUpload (Service):**
  - `kind: "video"` → Web-Key endet auf `/source`, presignPut mit übergebenem Content-Type.
  - `kind: "photo"` (Default) → Web-Key endet auf `/web.jpg` (Regression).
- **confirmUpload (Service):**
  - Video unter Limit → Item mit `type: "video"`, `s3_key` = source-Key.
  - Video über `maxVideoBytes` → Fehler `video_too_large`, Objekte werden gelöscht
    (`deleteObjects` aufgerufen), **kein** Item angelegt.
  - Foto-Pfad ohne Größenprüfung → Regression bleibt grün.
- **Route-Ebene** (`items/routes.test.ts`): presign akzeptiert `kind`, confirm reicht `kind`
  durch; 413 bei zu großem Video.
- **Storage-Fake** bekommt `head` (Größe steuerbar) in allen ItemsRepo-/Storage-Fakes.
- **Migration 008** wird gegen Neon ausgeführt, bevor der Deploy live geht.

## Offene Risiken

- **HEVC/.mov-Wiedergabe** auf Nicht-Safari — bekannt, von Phase B adressiert.
- **Thumbnail-Extraktion** kann bei HEVC in Nicht-Safari fehlschlagen → Platzhalter.
- **Upload-Dauer** großer Clips über Mobilfunk — durch Limit begrenzt, Busy-State im UI.
- **Server-Größenprüfung** erfordert eine zusätzliche `HeadObject`-Berechtigung des Runtime-IAM-
  Users (`klara-ses`) — i.d.R. durch bestehende `s3:GetObject`/`HeadObject`-Rechte abgedeckt;
  vor Deploy verifizieren.
