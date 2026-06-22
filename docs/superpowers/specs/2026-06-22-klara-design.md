# KlaRa — Design-Spec

**Stand:** 2026-06-22
**Status:** Freigegeben (Brainstorming abgeschlossen, vor Implementierungsplan)

## Was KlaRa ist

KlaRa (für „Klassenraum") ist eine private Plattform zum einfachen, geprüften
Austausch von Fotos innerhalb einer Grundschulklasse — Ersatz für den
herumgereichten USB-Stick. Eltern und Kinder laden Fotos von Ausflügen hoch,
die Lehrerin gibt sie frei, danach sind sie für die ganze Klasse sichtbar.

Der Name ist bewusst allgemein gewählt: v1 macht ausschließlich **Fotos**, das
Datenmodell ist aber generisch (`items`), sodass **Dokumente** später ohne
Umbau dazukommen können.

Es ist ein **privates Projekt** (kein BTC, kein Souveränitäts-Anspruch). Es
läuft aber im **Echtbetrieb mit echten Fotos echter Kinder**, daher gelten
Datenschutz-Basics als Pflicht: Eltern-Einwilligung, EXIF/GPS-Entfernung,
durchgehend privater Storage, Daten in DE-Region.

## Nicht-Ziele (v1)

- Keine Dokumente/PDFs (Modell ist vorbereitet, Feature kommt später).
- Kein öffentlicher Zugriff ohne Login (auch Teilen-Links nicht).
- Kein Souveränitäts-/Cloud-Act-Anspruch, keine AVV-Zeremonie über das
  Notwendige hinaus.
- Keine Mehrsprachigkeit, keine KI-Komponenten.

## Stack

Muster wie fragkim: eine Anwendung, ein Function-Monolith, SPA-Frontend.

| Baustein | Wahl | Region |
|---|---|---|
| Frontend | React + Vite (SPA) | — |
| API | Fastify als **eine** Vercel-Function | `fra1` (Frankfurt) |
| Foto-Storage | AWS S3, **privater** Bucket | `eu-central-1` |
| Datenbank | Neon Postgres | Frankfurt |
| E-Mail | AWS SES (Login-Mails, Digest) | `eu-central-1` |
| Auth | eigener Magic-Link/OTP, Session-Cookie | — |
| Cron | Vercel Cron (Papierkorb-Löschung, Digest) | — |

**Begründung Monolith:** Bei einer Klasse am billigsten und einfachsten zu
betreiben, 1:1 das bekannte fragkim-Muster. Fotos laufen **nie** durch die
Function (kein Timeout, keine Transferkosten) — nur Metadaten und
Berechtigungen.

### Architektur-Skizze

```
Browser (Eltern/Kinder/Lehrerin, Handy/iPad)
      │
      ▼
React-SPA  ──────►  Fastify-Function (fra1)  ──►  Neon Postgres (Metadaten)
   │  ▲                     │                 ──►  AWS SES (Mails)
   │  │                     └── stellt presigned URLs aus
   │  │
   └──┴── Upload/Download  ◄────────────────────►  AWS S3 (privat, eu-central-1)
                          (direkt Client↔S3 via presigned URL)
```

## Sicherheitsprinzipien (nicht verhandelbar)

1. **Bucket komplett privat.** Kein Foto je über eine öffentliche URL
   erreichbar. Jeder Up-/Download läuft über **presigned URLs**, die die API
   erst nach Auth- und Freigabe-Prüfung ausstellt, kurzlebig. Die API ist
   Türsteher, S3 nur Tresor.
2. **EXIF/GPS-Entfernung beim Upload.** Handyfotos tragen unsichtbare
   Metadaten — meist die GPS-Koordinate des Aufnahmeorts, Datum/Uhrzeit und das
   Gerätemodell. Bei Kinderfotos verrät das faktisch Wohn-/Aufenthaltsorte und
   wandert beim Teilen unbemerkt mit; nach DSGVO sind das besonders
   schützenswerte personenbezogene Daten. Der Client verkleinert das Bild
   daher über ein Canvas-Re-Encode (entfernt diese Metadaten inhärent) und
   erzeugt eine Web- und eine Thumbnail-Version. Beide werden hochgeladen;
   das Original verlässt das Gerät nicht ungefiltert.
3. **Kein Zugriff ohne aktiven, bestätigten Account.** Auch Teilen-Links
   führen nur zum Login.

## Datenmodell (Postgres)

Generisch gehalten (`items`), damit Dokumente später ohne Migration passen.

### `users`
- `id`, `email` (unique), `role` (`admin` | `member`),
  `status` (`pending` | `active` | `disabled`), `created_at`
- Die Tabelle **ist** die Allowlist: wer `active` ist, darf rein.
- Die Lehrerin ist immer Admin und kann weitere Admins ernennen sowie Zugänge
  verwalten (bestätigen, deaktivieren, Rolle ändern).

### `folders`
- `id`, `name`, `school_year` (z.B. „2025/2026"), `class_label`
  (z.B. „2. Klasse"), `enabled` (bool), `created_by`, `created_at`
- Die Lehrerin kann Ordner an-/abschalten (`enabled`); abgeschaltete Ordner
  sind für `member` unsichtbar.

### `items`
- `id`, `folder_id`, `type` (`photo`; künftig `document`),
  `status` (`pending` | `approved` | `trashed`),
  `s3_key`, `thumb_key`, `uploaded_by`, `approved_by`, `caption` (optional),
  `created_at`, `trashed_at` (nullable)

### `reports`
- `id`, `item_id`, `reason` (Text), `reported_by`,
  `status` (`open` | `answered` | `ignored` | `trashed`),
  `response` (optional), `created_at`, `trashed_at` (nullable)

### `login_tokens`
- `id`, `email`, `code_hash`, `link_token_hash`, `expires_at`, `used_at`
- Beide Wege (6-stelliger Code und Magic-Link) teilen sich denselben
  Token-Datensatz; Ablauf z.B. 15 Min, Einmal-Nutzung.

## Kern-Abläufe

### Login
1. Nutzer gibt E-Mail ein.
2. Prüfung: Adresse gehört zur **Schul-Domain** ODER steht auf der Allowlist
   (`users`).
3. Erst-Zugang über Schul-Domain: Account wird mit `status=pending` angelegt;
   die Lehrerin bestätigt einmalig (→ `active`). Bereits `active` Nutzer
   bekommen sofort Zugang.
4. SES schickt eine Mail mit **Klick-Link UND 6-stelligem Code**.
5. Erfolgreiche Bestätigung setzt ein persistentes **Session-Cookie (~30
   Tage)**, damit Eltern nicht ständig neu ranmüssen.

### Upload → Freigabe
1. Jeder `active` Nutzer kann hochladen (in einen `enabled` Ordner).
2. Client erzeugt Web- + Thumbnail-Version (EXIF entfernt), lädt beide per
   presigned URL **direkt nach S3**.
3. API legt `item` mit `status=pending` an.
4. Lehrerin sieht Freigabe-Ansicht: **Einzelfreigabe und Mehrfachauswahl
   (Massenbearbeitung)**. Freigeben → `approved` (für alle sichtbar).
   Ablehnen → `trashed`.

### Melden
1. Jeder kann ein freigegebenes Bild mit Begründung melden → `report` mit
   `status=open`.
2. Bei der Lehrerin: **ignorieren** (`ignored`), **antworten** (`answered`,
   Text), **löschen** (`trashed`, Bild zusätzlich → `items.trashed`).

### Papierkorb
- Alles mit `status=trashed` (abgelehnte Uploads, gelöschte Bilder, gelöschte
  Meldungen) bleibt **30 Tage**, dann **endgültige Löschung per Vercel-Cron**
  inkl. der zugehörigen **S3-Objekte**.

### Benachrichtigung
- **In-App-Badge** für Admins („N warten auf Freigabe", offene Meldungen).
- **Vercel-Cron**: höchstens **eine Digest-Mail pro Tag** an Admins, wenn
  etwas offen ist. Keine Sofort-Mails.

### Galerie / Ansicht
- Kindgerechte, moderne Darstellung.
- Vollbild-Modus, **konfigurierbare Diashow**.
- Mobile-Layout für iPad und iPhone.
- Teilen-Dialog: erzeugt **Ordner-Deeplink, nur für Eingeloggte** nutzbar.
- Download einzelner Bilder.
- Ordner sortiert nach Schuljahr/Klasse.

## Rollen-Matrix

| Aktion | `member` | `admin` (Lehrerin) |
|---|---|---|
| Fotos ansehen (freigegeben) | ✓ | ✓ |
| Hochladen | ✓ | ✓ |
| Melden | ✓ | ✓ |
| Teilen-Link erzeugen / Download | ✓ | ✓ |
| Freigeben / ablehnen (einzeln + Masse) | — | ✓ |
| Meldungen bearbeiten | — | ✓ |
| Ordner anlegen / an-/abschalten | — | ✓ |
| Zugänge verwalten, Admins ernennen | — | ✓ |

## Komponenten-Grenzen

- **Auth-Modul** — Magic-Link/OTP, Domain-/Allowlist-Prüfung, Session. Hängt
  von `users`, `login_tokens`, SES ab.
- **Storage-Modul** — presigned URLs ausstellen, S3-Objekte löschen. Hängt von
  S3 ab, kennt keine Geschäftslogik.
- **Items/Freigabe-Modul** — Upload-Registrierung, Status-Übergänge, Freigabe.
  Hängt von `items`, Storage-Modul ab.
- **Reports-Modul** — Melden, Admin-Bearbeitung. Hängt von `reports`, `items`.
- **Folders-Modul** — CRUD, enable/disable.
- **Cron-Modul** — Papierkorb-Löschung, Digest. Hängt von allen Datentabellen
  + Storage + SES.
- **Frontend** — SPA mit Galerie, Upload, Admin-Bereich, Login.

Jedes Modul ist eigenständig testbar; Module reden über klar definierte
Funktionen, nicht über geteilten Zustand.

## Fehlerbehandlung (Leitlinien)

- Presigned-URL-Upload schlägt fehl → `item` wird nicht angelegt bzw. als
  unvollständig verworfen (keine verwaisten DB-Zeilen ohne S3-Objekt).
- Verwaiste S3-Objekte ohne `item` werden vom Cron mit aufgeräumt.
- Login-Token abgelaufen/verbraucht → klare, kindgerechte Fehlermeldung.
- Zugriff auf `pending`/`trashed` Items durch `member` → 404 (nicht 403, keine
  Existenz verraten).

## Testbarkeit

- Backend-Module mit Vitest (wie fragkim), S3/SES/DB hinter Interfaces, in
  Tests gemockt.
- Status-Übergänge (`pending`→`approved`→`trashed`→gelöscht) und
  Berechtigungs-Grenzen sind die wichtigsten Testfälle.

## Konfiguration (Env)

- `ALLOWED_EMAIL_DOMAINS` (z.B. `grundschule-xy.de`)
- S3: Bucket, Region, Credentials
- SES: Absender, Region, Credentials
- Neon: Connection-String
- `SESSION_SECRET`, Token-/Session-Laufzeiten
- `TRASH_RETENTION_DAYS=30`

## Offene Punkte für den Implementierungsplan

- Genaue Web-/Thumbnail-Zielgrößen und ob ein höher aufgelöstes Original für
  den Download vorgehalten wird (Qualität vs. Speicher).
- Deploy-Weg (PR-basiert wie fragkim?) und Vercel-Projekt-Setup.
- Konkrete Datenschutzerklärung / Eltern-Einwilligungstext (Inhalt, nicht
  Technik).
