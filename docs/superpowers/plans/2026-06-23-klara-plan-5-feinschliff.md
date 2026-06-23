# KlaRa Plan 5 — Feinschliff (12 Features)

> Backend TDD (Fakes); Frontend = Build-Verifikation. Design konsistent mit „Klassenalbum" (Lila `#5b3fb0`, Amber-Akzent, Fraunces-Headings, runde Karten).

**Goal:** 12 von Thomas gewünschte Verbesserungen, die KlaRa praxistauglich machen — Upload-Zähler, Vollbild-Freigabe, eigene Uploads löschen, Favicon, Ordner-Titelbild, admin-pflegbare Login-Domains, klarere Nutzertrennung, Ordner-Datumsbereich, Klassen-Dropdown (admin-pflegbar), Schuljahr-Dropdown, umstellbare Sortierung, Massen-Freigabe (existiert, wird geschärft).

## Datenmodell (Migration `migrations/004_feinschliff.sql`)
```sql
-- Ordner: Titelbild, Datumsbereich, manuelle Reihenfolge
alter table folders add column if not exists cover_item_id uuid references items(id) on delete set null;
alter table folders add column if not exists start_date date;
alter table folders add column if not exists end_date   date;
alter table folders add column if not exists sort_order int not null default 0;

-- Admin-pflegbare Login-Domains (#6)
create table if not exists allowed_domains (
  domain     text primary key,
  created_at timestamptz not null default now()
);
-- initial aus der bisherigen Env-Domain seeden
insert into allowed_domains (domain) values ('gs-alexandersfeld.de') on conflict do nothing;

-- Admin-pflegbare Klassen-Werte (#9)
create table if not exists class_options (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into class_options (label, sort_order) values
  ('1. Klasse',1),('2. Klasse',2),('3. Klasse',3),('4. Klasse',4)
  on conflict do nothing;
```

## Features → Umsetzung

### #1 Upload-Zähler pro Nutzer
- Backend: `itemsRepo.uploadCountsByUser()` → `Map<userId, number>` (zählt alle `items` je `uploaded_by`). `GET /api/admin/users` (oder ein zusätzliches Feld) liefert `uploadCount` pro User.
- Frontend: in `AdminUsers` je Nutzer „N Fotos".

### #2 + #12 Freigabe: Vollbild-Einzelprüfung + Massen-Auswahl
- Massen-Auswahl existiert in `ApprovalQueue` (Checkboxen, „Alle auswählen", Bulk Freigeben/Ablehnen) — beibehalten und visuell klarer machen (sichtbare Auswahl-Leiste mit Zähler „3 ausgewählt").
- NEU: Klick auf ein Pending-Foto öffnet eine **Vollbild-Ansicht** (`webUrl`) mit **Freigeben** / **Ablehnen**-Buttons und Vor/Zurück durch die Pending-Liste (Tastatur + Buttons). Aktion wirkt sofort und springt zum nächsten. Reuse/Anlehnung an die `Lightbox`-Mechanik (eigene Komponente `ApprovalLightbox.tsx`, da Buttons/Logik anders).

### #3 Eigene, noch nicht freigegebene Fotos löschen
- Backend: `DELETE /api/items/:id` (requireUser) — nur wenn `uploaded_by === req.user.id` **und** `status === 'pending'` (sonst 403/404). Hard-Delete: S3-Objekte (`s3_key`,`thumb_key`) via `storage.deleteObjects`, dann DB-Zeile. → `{deleted:true}`.
- Frontend: `FolderView` zeigt dem Mitglied **seine eigenen** `pending` Uploads (klar markiert „wartet auf Freigabe") zusätzlich zu den freigegebenen — mit Lösch-Button (X, mit Bestätigung). Dafür braucht die Item-Liste die eigenen pending: `GET /api/folders/:folderId/items` liefert für Nicht-Admins jetzt `approved` **plus** die eigenen `pending` (Feld `mine:boolean`, `status`). Member sehen weiterhin NICHT fremde pending/trashed.

### #4 Favicon
- `frontend/public/favicon.svg` (KlaRa-Marke: rundes lila Feld, freundliches Kamera/Foto-Symbol oder „K"; Amber-Akzent) + Fallback `favicon.ico`/PNG. In `index.html` verlinken (`<link rel="icon" ...>`), dazu `apple-touch-icon` und ein kleines `site.webmanifest` (Name „KlaRa", Theme-Color `#5b3fb0`). Vite kopiert `public/` automatisch.

### #5 Ordner-Titelbild (aus Ordner-Fotos)
- Backend: `folders.cover_item_id`. `PATCH /api/admin/folders/:id {coverItemId}` (muss ein **approved** Item desselben Ordners sein, sonst 400). Folder-Liste liefert `coverThumbUrl` (presigned thumb des Cover-Items; sonst null).
- Frontend: in `AdminFolders` (oder im Ordner) „Titelbild wählen" → Auswahl aus den freigegebenen Fotos des Ordners. `FolderList`-Karten zeigen das Titelbild (Fallback: erstes Foto oder Platzhalter-Icon).

### #6 Login-Domains admin-pflegbar
- Backend: `domainsRepo` (`list()`, `add(domain)`, `remove(domain)`). Auth-Service holt die erlaubten Domains zur Laufzeit aus der DB (statt aus `config.allowedDomains`): `requestLogin` lädt `domainsRepo.list()` und übergibt sie an `decideLoginAction` (reine Logik bleibt). Damit lösen Nicht-Domain-/Nicht-Allowlist-Adressen **keine** Code-Mail aus (bereits so; jetzt DB-gesteuert).
- Routes (requireAdmin): `GET /api/admin/domains`, `POST /api/admin/domains {domain}` (normalisiert lowercase/trim), `DELETE /api/admin/domains/:domain`.
- Frontend: kleiner Bereich in der Verwaltung „Erlaubte Domains" (Liste + hinzufügen/entfernen). Hinweis: „Adressen dieser Domains dürfen sich anmelden; alle anderen brauchen einen Allowlist-Eintrag."

### #7 Admins klarer von Nutzern trennen
- Frontend `AdminUsers`: drei klar getrennte Abschnitte — **Wartet auf Freischaltung** (pending), **Admins**, **Mitglieder** — je mit eigener Überschrift; Rollen-/Status-Aktionen pro Zeile; eigener Account nicht degradierbar (`cannot_modify_self`).

### #8 Ordner Von–Bis-Datum (auch ein Tag)
- Backend: `folders.start_date`,`end_date`. Create/Update akzeptieren `startDate?`,`endDate?` (ISO `YYYY-MM-DD`). Ein Tag = `start==end` oder nur `start`. Folder-Liste/Detail liefert die Daten.
- Frontend: zwei Datumsfelder (Von / Bis) im Ordner-Formular; Anzeige als „14.06.2026" bzw. „14.–16.06.2026". Bis-Datum optional.

### #9 Klassen-Dropdown (admin-pflegbar)
- Backend: `classOptionsRepo` (`list()`, `add(label)`, `remove(id)`). Routes (requireAdmin): `GET /api/admin/class-options`, `POST`, `DELETE /:id`. `GET /api/class-options` (requireUser) für das Dropdown im Ordner-Formular.
- Frontend: Ordner-Formular nutzt ein `<select>` aus `class-options`; Verwaltung „Klassen" zum Pflegen der Liste.

### #10 Schuljahr-Dropdown 2023 bis aktuell
- Frontend-only: Helper `schoolYearOptions()` erzeugt `["2023/2024", … , "<aktuell>/<aktuell+1>"]` (aktuelles Jahr aus `new Date().getFullYear()`; 2026 → bis „2026/2027"). Im Ordner-Formular als `<select>`.

### #11 Sortierung umstellbar
- **Fotos im Ordner:** Client-Toggle in der Galerie „Neueste zuerst / Älteste zuerst" (Sortierung nach `createdAt`). Standard: neueste zuerst. Rein clientseitig.
- **Ordner-Reihenfolge:** `folders.sort_order`; `GET /api/folders` sortiert nach `sort_order` (dann `created_at`). `POST /api/admin/folders/:id/move {direction:"up"|"down"}` tauscht `sort_order` mit dem Nachbarn (atomar). In `AdminFolders` Hoch/Runter-Pfeile.

## Backend-Module (neu/erweitert)
| Datei | Änderung |
|---|---|
| `migrations/004_feinschliff.sql` | siehe oben |
| `backend/src/settings/repo.ts` + `routes.ts` | `allowed_domains` + `class_options` Repos & Admin/User-Routen |
| `backend/src/folders/repo.ts` | `cover_item_id`/`start_date`/`end_date`/`sort_order` in create/update/list; `coverThumbKey` für presign; `move(id,dir)`; Liste nach `sort_order` |
| `backend/src/folders/routes.ts` | `coverItemId`/`startDate`/`endDate` in PATCH; `/move`; `coverThumbUrl` (presign) in der Liste |
| `backend/src/items/repo.ts` | `uploadCountsByUser()`; `deleteOwnPending(id,userId)` (returnt Keys); `listForMember(folderId,userId)` = approved + eigene pending |
| `backend/src/items/routes.ts` | `DELETE /api/items/:id`; Member-Liste erweitert |
| `backend/src/auth/service.ts` + `repo.ts` | Domains zur Laufzeit aus DB; AdminUsers-Liste mit `uploadCount` |
| `server.ts` | neue Routen/Repos verdrahten |

## TDD-Schwerpunkte
- `deleteOwnPending`: nur eigene + pending; fremde/approved → Fehler; ruft `deleteObjects` mit beiden Keys; löscht DB-Zeile.
- Domains: requestLogin nutzt DB-Domains; unbekannte Domain ohne Allowlist → keine Mail (`decideLoginAction` → noop/deny).
- Cover: nur approved Item desselben Ordners als Cover (sonst 400).
- `move`: tauscht sort_order korrekt, Ränder (oberster „up" = no-op).
- Member-Liste: approved + eigene pending, **keine** fremden pending.
- class-options/domains CRUD + requireAdmin (Member 403).

## Definition of Done
- Backend-Tests grün; `npm run build` sauber.
- Migration 004 gegen Neon ausgeführt (seeded Domain + Klassen).
- Verifiziert (echte Infra): eigene pending löschen (DB+S3 weg); Cover setzen; Domain hinzufügen/entfernen wirkt auf Login-Eligibility; Ordner-Move ändert Reihenfolge; Vollbild-Freigabe approved/rejected.
- Favicon sichtbar; Schuljahr/Klassen-Dropdowns gefüllt; AdminUsers in Abschnitten; Foto-Sort-Toggle wirkt.
