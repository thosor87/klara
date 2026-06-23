# KlaRa Plan 4 — Melden + Papierkorb + Digest-Cron

> Backend TDD wie gehabt (Fakes für Repo/Storage/Mailer). Frontend = Build-Verifikation.

**Goal:** KlaRa-Sicherheits- und Lifecycle-Features: (1) **Melden** — jeder kann ein freigegebenes Foto mit Begründung melden, die Lehrerin bearbeitet (ignorieren / antworten / löschen). (2) **Papierkorb** — alles `trashed` (abgelehnte Uploads, gelöschte Fotos, gelöschte Meldungen) wird nach **30 Tagen** per Cron endgültig gelöscht, **inklusive der S3-Objekte**. (3) **Digest** — eine Sammel-Mail pro Tag an Admins, wenn etwas offen ist (Freigaben + Meldungen).

**Architecture:** Backend auf Plan-1/2-Basis. Neu: `reports`-Tabelle, Reports-Modul, zwei **Vercel-Cron**-Endpunkte (`/api/cron/purge`, `/api/cron/digest`) abgesichert per `CRON_SECRET`. Frontend: Melden-Button in der Lightbox + Dialog, Admin-Reports-Queue, einfache Papierkorb-Ansicht.

**Tech Stack:** unverändert (SES-Mailer aus Plan 1 für Digest, S3-Storage aus Plan 2 für Purge). Vercel `crons` in `vercel.json`.

## Datenmodell (Migration `migrations/003_reports.sql`)
```sql
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  reason      text not null default '',
  reported_by uuid references users(id),
  status      text not null default 'open' check (status in ('open','answered','ignored','trashed')),
  response    text not null default '',
  created_at  timestamptz not null default now(),
  trashed_at  timestamptz
);
create index if not exists reports_status_idx on reports (status);
create index if not exists reports_item_idx on reports (item_id);
```

## Config-Erweiterung
`cronSecret: process.env.CRON_SECRET ?? ""`, `trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30)`.

## Endpoint-Verträge
### Melden (Member darf melden; Admin bearbeitet)
- `POST /api/items/:itemId/reports` (requireUser) `{reason}` → erstellt `report` `status=open`. Nur auf existierende, **approved** Items (sonst 404). → `{ok:true}`.
- `GET /api/admin/reports` (requireAdmin) → offene + beantwortete Meldungen `[{id,itemId,reason,status,response,createdAt,thumbUrl,webUrl,folderName,reportedByEmail}]` (presigned Thumb/Web des gemeldeten Items).
- `PATCH /api/admin/reports/:id` (requireAdmin) `{action:"ignore"|"answer"|"delete", response?}`:
  - `ignore` → `status=ignored`.
  - `answer` → `status=answered`, `response`=Text.
  - `delete` → `status=trashed`, `trashed_at=now()` **und** das zugehörige Item `status=trashed`, `trashed_at=now()` (Meldung löschen heißt: Foto in den Papierkorb).
  - **Badge:** offene Meldungen zählen für das Admin-Badge mit.

### Papierkorb (Admin-Sicht + Wiederherstellen)
- `GET /api/admin/trash` (requireAdmin) → `trashed` Items `[{id,folderName,caption,trashedAt,daysLeft,thumbUrl}]` (`daysLeft` = 30 − Alter). 
- `POST /api/admin/trash/:itemId/restore` (requireAdmin) → Item zurück auf `status=pending` (Admin gibt dann neu frei), `trashed_at=null`.

### Cron (per `CRON_SECRET` abgesichert; Vercel sendet `Authorization: Bearer <CRON_SECRET>`)
- `GET /api/cron/purge` → löscht alle `items` **und** `reports` mit `trashed_at < now() − retentionDays`; für gelöschte Items **vorher** die S3-Objekte (`s3_key`,`thumb_key`) via `storage.deleteObjects` entfernen. → `{purgedItems,purgedReports}`.
- `GET /api/cron/digest` → zählt `pending` Items + `open` Reports; wenn >0, eine Mail an alle aktiven **Admins** (`mailer.sendDigest(to, {pendingCount, openReports})` — neue Mailer-Methode). → `{sent, pendingCount, openReports}`.
- Beide: ohne gültiges Bearer-`CRON_SECRET` → 401. (So kann man sie nicht von außen triggern.)

## Vercel-Cron (`vercel.json` → `crons`)
```json
"crons": [
  { "path": "/api/cron/purge",  "schedule": "0 3 * * *" },
  { "path": "/api/cron/digest", "schedule": "0 7 * * *" }
]
```
(Täglich 03:00 Purge, 07:00 Digest — UTC. Vercel ruft sie mit dem `CRON_SECRET`-Bearer auf, wenn die Env-Var gesetzt ist.)

## Module
| Datei | Inhalt |
|---|---|
| `backend/src/reports/repo.ts` | `ReportsRepo`: `create({itemId,reason,reportedBy})`, `listForAdmin()` (open+answered, join item+folder+reporter), `findById`, `setIgnored(id)`, `setAnswered(id,response)`, `setTrashed(id)`, `countOpen()`, `purgeTrashed(beforeDate)`. |
| `backend/src/reports/service.ts` | `report(itemId,reason,userId)` (prüft Item approved), Admin-Aktionen (delete koppelt Item→trashed), Listen mit presigned URLs. |
| `backend/src/reports/routes.ts` | die Report-Routen. |
| `backend/src/items/repo.ts` (erweitern) | `listTrashed()`, `restore(id)`, `purgeTrashed(beforeDate)` (returnt die gelöschten `{s3Key,thumbKey}` zum S3-Cleanup), Badge: `countPending()`. |
| `backend/src/cron/routes.ts` | `/api/cron/purge`, `/api/cron/digest` + Bearer-Check (`requireCron(cronSecret)`). |
| `backend/src/auth/mailer.ts` (erweitern) | `sendDigest(to, {pendingCount, openReports})` (Text+HTML, kindgerecht-sachlich; Link zur App). Console-Fallback loggt. |
| Frontend | Melden-Button+Dialog in `Lightbox`; `ReportsQueue.tsx` (Admin); `Trash.tsx` (Admin, Papierkorb mit Restzeit + Wiederherstellen); Badge zählt pending+open. |

## TDD-Schwerpunkte
- **Reports-Service:** melden nur auf approved Items (sonst 404); `delete` setzt Item UND Report auf trashed; `answer` speichert Text.
- **Purge:** wählt nur Items/Reports älter als `retentionDays`; ruft `storage.deleteObjects` mit den richtigen Keys; löscht dann die DB-Zeilen; gibt Zähler zurück. (Fake-Storage + Fake-Repo, Zeit als Parameter `now` injizierbar.)
- **Cron-Auth:** ohne/falscher Bearer → 401; mit korrektem `CRON_SECRET` → läuft.
- **Digest:** sendet nur wenn pending+open > 0; an alle aktiven Admins.
- **Restore:** trashed → pending, `trashed_at` zurückgesetzt.

## Frontend
- **Lightbox:** dezenter „Melden"-Button → kleiner Dialog (Begründung, Pflichtfeld) → `POST .../reports` → freundliche Bestätigung („Danke, die Lehrerin schaut sich das an.").
- **ReportsQueue (Admin):** Liste mit Foto-Thumbnail, Grund, Melder; Aktionen **Ignorieren** / **Antworten** (Textfeld) / **Löschen** (Foto in Papierkorb). Badge-Sync.
- **Trash (Admin):** Grid der Papierkorb-Items mit „noch N Tage", **Wiederherstellen**-Button, Hinweis auf automatische Löschung nach 30 Tagen.
- **NavBar:** Admin-Badge = `pending` Freigaben + `open` Meldungen; neue Nav-Punkte **Meldungen** und **Papierkorb**.

## Definition of Done
- Backend-Tests grün; `npm run build` sauber.
- Migration 003 gegen Neon ausgeführt.
- Verifiziert (gegen echte Infra): melden → erscheint in Admin-Queue; löschen → Item+Report trashed; Purge-Endpoint (mit Secret) löscht alte trashed-Items inkl. S3-Objekte und respektiert die 30-Tage-Grenze; Digest-Endpoint zählt korrekt und sendet (Console-Mailer im Test).
- Cron-Endpunkte ohne Secret → 401. `vercel.json` enthält die `crons`. `CRON_SECRET` in Vercel gesetzt.
