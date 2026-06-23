# KlaRa Plan 6 — Klassen-basierte Berechtigung

> Backend TDD (Fakes). Frontend = Build-Verifikation. Design konsistent ("Klassenalbum", Lila #5b3fb0, Amber, Fraunces).

**Goal:** Zugriff regelt sich über Klassen-Zugehörigkeit statt "alle Mitglieder sehen alles".
- Jede **Person** gehört zu **genau einer** Klasse (`users.class_id`, optional/null = noch nicht zugeordnet).
- Jedes **Album** gehört zu **einer oder mehreren** Klassen (`folder_classes` n:m).
- Ein Mitglied sieht ein Album genau dann, wenn **seine Klasse in den Klassen des Albums** ist.
- **Admins sehen alle** Alben (Klassen egal).
- Album **ohne** zugeordnete Klasse → **nur Admins** (für Mitglieder unsichtbar).
- Mitglied **ohne** Klasse → sieht (außer ggf. nichts) keine klassengebundenen Alben; klare Hinweis-Ansicht.

Die bestehende, admin-pflegbare Liste **`class_options`** wird die kanonische Klassen-Entität (sie hat schon id/label/sort_order und eine Verwaltungs-UI). Das frühere freie `folders.class_label` wird durch die n:m-Zuordnung ersetzt (Spalte bleibt vorerst, wird im Formular nicht mehr genutzt).

## Datenmodell (Migration `migrations/005_klassen.sql`)
```sql
-- Person -> genau eine Klasse (null = noch nicht zugeordnet)
alter table users add column if not exists class_id uuid references class_options(id) on delete set null;

-- Album -> mehrere Klassen
create table if not exists folder_classes (
  folder_id uuid not null references folders(id) on delete cascade,
  class_id  uuid not null references class_options(id) on delete cascade,
  primary key (folder_id, class_id)
);
create index if not exists folder_classes_class_idx on folder_classes (class_id);

-- Bestandsdaten: Album dessen class_label zu einer class_options.label passt → Zuordnung übernehmen
insert into folder_classes (folder_id, class_id)
  select f.id, c.id from folders f
  join class_options c on c.label = f.class_label
  on conflict do nothing;
```
Bestehende Mitglieder haben danach `class_id = null` (Admin ordnet zu). Die zwei Seed-Admins sind Admins → unbetroffen.

## Sichtbarkeits-Regeln (Backend, autoritativ)
- **Alben-Liste (Mitglied):** nur `enabled` Alben, die eine `folder_classes`-Zeile mit `class_id = user.class_id` haben. (Mitglied ohne Klasse → leere Liste.)
- **Alben-Liste (Admin):** alle.
- **Album-Detail / Items / Upload (Mitglied):** Zugriff nur, wenn das Album für die Klasse des Mitglieds sichtbar ist (sonst 404 — Existenz nicht verraten). Gilt für `GET items`, `presign`, `confirm`.
- **Admin:** voller Zugriff.

## Endpoint-Änderungen
- `GET /api/me` → liefert zusätzlich `classId` (+ optional `className`) des Nutzers.
- `GET /api/folders`:
  - Admin: alle (jeweils mit `classIds`/`classLabels`).
  - Mitglied: nur sichtbare; Response-Items tragen die Klassen-Labels nicht zwingend (oder ja, schadet nicht).
- `POST /api/admin/folders` + `PATCH /api/admin/folders/:id` → akzeptieren `classIds: string[]` und pflegen `folder_classes` (ersetzen die Menge). Response enthält `classIds`.
- `GET /api/folders/:id/items`, `POST .../uploads/presign`, `POST .../items` → für Nicht-Admins zusätzlich Klassen-Sichtbarkeit prüfen (sonst 404).
- `GET /api/admin/users` → je Nutzer `classId`. `PATCH /api/admin/users/:id` → akzeptiert zusätzlich `classId` (null erlaubt = Zuordnung entfernen). Beim Freischalten eines pending-Nutzers kann gleich die Klasse mitgegeben werden.
- `GET /api/class-options` bleibt (Quelle fürs Klassen-Dropdown bei Album & Nutzer).

## Module
| Datei | Änderung |
|---|---|
| `migrations/005_klassen.sql` | siehe oben |
| `backend/src/folders/repo.ts` | `setClasses(folderId, classIds[])`, `classIdsByFolder()`/Join; `listForClass(classId)` (enabled ∩ folder_classes); `isVisibleToClass(folderId, classId)`; create/update pflegen Klassen |
| `backend/src/folders/routes.ts` | `classIds` in POST/PATCH; Member-Liste klassengefiltert; Detail/Items/Upload-Routen prüfen Sichtbarkeit |
| `backend/src/items/service.ts` | `listFolderItems`/`presignUpload`/`confirmUpload` bekommen `user` (role+classId); Nicht-Admin → `assertVisible(folderId, classId)` (404 sonst) |
| `backend/src/auth/repo.ts` | `users.class_id` in mapUser; `updateUser` akzeptiert `classId`; `findUserById`/listUsers liefern `classId` |
| `backend/src/auth/guard.ts` / `/api/me` | `classId` (+`className`) im User/me |
| Frontend | Album-Formular: **Mehrfach-Klassen-Auswahl** (Checkboxen aus `class-options`) statt Einzel-Dropdown; AdminUsers: **Klasse pro Nutzer** zuweisen (Dropdown, auch beim Freischalten); Mitglied-Ansicht: Hinweis wenn keine Klasse / keine sichtbaren Alben |

## TDD-Schwerpunkte
- **Sichtbarkeit:** Mitglied Klasse A sieht Album(A) und Album(A,B), NICHT Album(B), NICHT Album(ohne Klasse). Admin sieht alle. Mitglied ohne Klasse → leere Liste.
- **Item/Upload-Gate:** Mitglied ohne Sichtbarkeit auf Album → 404 bei `GET items`, `presign`, `confirm`.
- **setClasses:** ersetzt die Klassenmenge korrekt (hinzufügen/entfernen), `::uuid[]`-sauber.
- **updateUser classId:** setzen + auf null entfernen.
- **Bestandsmigration:** folder mit passendem class_label bekommt die Zuordnung (in Integration/E2E geprüft).

## Frontend-Details
- **Album-Formular:** ersetze das einzelne Klassen-`<select>` durch eine Gruppe Checkboxen/Chips "Für welche Klassen?" (aus `class-options`). Anzeige in Album-Karten/Verwaltung: die zugeordneten Klassen als kleine Chips. Hinweis wenn keine Klasse gewählt: "Ohne Klasse sehen nur Admins dieses Album."
- **AdminUsers:** je Nutzer ein Klassen-`<select>` ("Klasse: …"), inkl. beim Freischalten von pending. Zeige die Klasse in der Zeile.
- **Mitglied ohne sichtbare Alben:** freundliche Leer-Ansicht: "Hier sind noch keine Alben für deine Klasse. Sobald die Lehrerin eins freigibt, erscheint es hier." Und falls `classId == null`: "Du bist noch keiner Klasse zugeordnet — die Lehrerin macht das."

## Definition of Done
- Backend-Tests grün; `npm run build` sauber.
- Migration 005 gegen Neon gelaufen (Bestands-Zuordnung übernommen).
- Verifiziert (echte Infra): Mitglied(KlasseA) sieht nur A-Alben (Liste + Item-Zugriff), B-Album → 404; Admin sieht alle; Album ohne Klasse für Mitglied unsichtbar; Klasse einem Nutzer zuweisen wirkt sofort; Album mehreren Klassen zuordnen wirkt.
- Album-Formular Mehrfach-Klassen; AdminUsers Klassen-Zuweisung; Mitglied-Leer-Hinweis.
