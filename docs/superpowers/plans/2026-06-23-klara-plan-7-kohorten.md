# KlaRa Plan 7 — Klassen als stabile Kohorten (Zug + Einschulungsjahr)

> Backend TDD (Fakes). Frontend = Build-Verifikation. Design konsistent ("Klassenalbum").

**Goal:** Eine „Klasse" ist nicht mehr ein wanderndes Label, sondern eine **stabile Gruppe**, intern definiert durch **Zug** (z.B. „m" oder „" für die Regelklasse) + **Einschulungsjahr**. Das Stufen-Label („2m") wird automatisch aus dem aktuellen Schuljahr berechnet. Zugriff hängt an der stabilen Gruppe → Kinder behalten über Jahreswechsel hinweg automatisch Zugriff auf ihre alten Alben. Album- und Nutzer-Pflege braucht nur noch „die Klasse" (kein separates Schuljahr).

**Lebenszyklus einer Gruppe** (Stichtag 1. August):
- **Stufe 1–4** → `active` (sichtbar, wählbar).
- Nach Klasse 4 (ab 1. August des Jahres `Einschulungsjahr + 4`):
  - **0–90 Tage** → `alumni` (Mitglieder sehen ihre Alben weiter).
  - **90–180 Tage** → `archived` (für Mitglieder ausgeblendet; Admins sehen noch).
  - **> 180 Tage** → per Cron **gelöscht**: Gruppe, ihre (verwaisten) Alben, Items + S3-Objekte.

## Schuljahr-Logik
`schoolYearStart(now)` = Kalenderjahr, wenn Monat ≥ August, sonst Kalenderjahr − 1.
`grade = schoolYearStart(now) − startYear + 1`. `gradAug = 1. August des Jahres (startYear + 4)`.

| grade | Status | Label (Beispiel track="m") |
|---|---|---|
| < 1 | `future` | „m · ab <startYear>" |
| 1–4 | `active` | „<grade>m" (z.B. „2m"), Schuljahr „<sy>/<sy+1>" |
| > 4, < 90 Tage nach gradAug | `alumni` | „Ehemalige m (<sy3>/<sy4>)" |
| > 4, 90–180 Tage | `archived` | „Archiviert m" |
| > 4, > 180 Tage | `expired` | (zur Löschung fällig) |

Legacy-Klassen ohne `start_year` (die jetzigen Test-Labels) → Status `legacy`, Label = gespeichertes `label`, immer sichtbar/wählbar (kein Lebenszyklus), bis die Lehrkraft sie auf Zug+Einschulungsjahr umstellt oder löscht.

## Datenmodell (Migration `migrations/006_kohorten.sql`)
```sql
alter table class_options add column if not exists track      text not null default '';
alter table class_options add column if not exists start_year int;   -- Einschulungsjahr; null = legacy
```
(`label` bleibt als Fallback/Anzeige für Legacy-Klassen; für Kohorten wird das Label berechnet.)

## Backend
| Datei | Inhalt |
|---|---|
| `backend/src/classes/cohort.ts` (neu) | reine Funktionen: `schoolYearStart(now)`, `cohortInfo(track, startYear\|null, now)` → `{ grade\|null, status, label, schoolYear\|null, daysSinceGraduation\|null }`. TDD-Kern. |
| `backend/src/settings/repo.ts` | `ClassOption` trägt `track`, `startYear`; `add/update` setzen sie; `list()` liefert sie (Label/Status berechnet die Service/Route-Schicht via `cohortInfo`). |
| `backend/src/settings/routes.ts` | `GET /api/class-options` (+ admin) liefert je Klasse `{id, track, startYear, label, status, schoolYear}` (berechnet mit Server-`now`). `POST/PATCH` akzeptieren `track`,`startYear`. |
| `backend/src/folders/repo.ts` | **Sichtbarkeit lebenszyklus-bewusst:** `listForClass`/`isVisibleToClass` für Mitglieder nur, wenn die Klasse `active`/`alumni`/`legacy` ist (nicht `archived`/`expired`/`future`). Da das vom Datum abhängt, in der Repo-/Service-Schicht den Status der Klasse des Nutzers prüfen (join class_options + `cohortInfo`), nicht nur die `folder_classes`-Verknüpfung. |
| `backend/src/cron/routes.ts` | `GET /api/cron/graduation` (Bearer-`CRON_SECRET`): Klassen mit `start_year` und `now > gradAug + 180 Tage` löschen — `folder_classes`-Links entfernen, dann **verwaiste** Alben (keine Klassen-Verknüpfung mehr) inkl. Items per `storage.deleteObjects` + DB löschen, `users.class_id` auf null setzen, Klassenzeile löschen. Zähler zurück. |
| `vercel.json` | Cron `/api/cron/graduation` täglich (z.B. `30 3 * * *`). |
| `server.ts` | Verdrahtung. |

**Wichtig (Sichtbarkeit):** Die bisherige reine `folder_classes`-Prüfung reicht nicht mehr — ein Mitglied einer `archived` Klasse darf nichts sehen. Der Member-Pfad (`listForClass`, `isVisibleToClass`) muss zusätzlich den **Status der Klasse des Mitglieds** über `cohortInfo` berücksichtigen. Admins unverändert (alles).

## Frontend
| Stelle | Änderung |
|---|---|
| Album-Formular (`AdminFolders`) | **Schuljahr-Feld entfällt.** Klassen-Mehrfachauswahl zeigt nur `active`-Klassen (+ Legacy) mit berechnetem Label (z.B. „2m · 2025/26"). |
| Nutzer-Klasse (`AdminUsers`) | Dropdown zeigt `active`/`alumni`/Legacy mit berechnetem Label. |
| Admin „Klassen" (`Settings`) | Verwaltung als **Kohorten**: anlegen mit **Zug** (Textfeld, leer = Regelklasse) + **Einschulungsjahr** (Dropdown der letzten ~6 Jahre). Liste zeigt berechnetes Label + Status-Pill (Aktiv / Ehemalige / Archiviert). Legacy-Klassen mit Hinweis „Einschulungsjahr setzen". |
| Album-Anzeige | Statt `schoolYear`/`classLabel` die zugeordneten Klassen-Chips (berechnetes Label). |

## TDD-Schwerpunkte
- `cohort.ts`: `schoolYearStart` (Juli vs August-Grenze), `cohortInfo` für alle Status (Stufen 1–4, alumni <90d, archived 90–180d, expired >180d, future, legacy bei startYear=null). Zeit als Parameter `now` injizierbar.
- **Sichtbarkeit:** Mitglied in `active`/`alumni`/`legacy` Klasse sieht deren Alben; Mitglied in `archived`/`expired` Klasse → leer / 404 auf Items. Admin sieht alles.
- **Graduation-Cron:** wählt nur Klassen > 180 Tage nach gradAug; löscht verwaiste Alben + S3-Keys; setzt user.class_id null; Bearer-Schutz.
- `setClasses`/Zuordnung unverändert korrekt.

## Definition of Done
- Backend-Tests grün; `npm run build` sauber.
- Migration 006 gegen Neon (Tracking-Migrate, läuft genau einmal).
- Verifiziert (echte Infra): Klasse mit Zug+Einschulungsjahr zeigt korrektes Label/Schuljahr; Mitglied sieht die Alben seiner aktiven Klasse; eine künstlich „archiviert" gesetzte Klasse macht die Alben für das Mitglied unsichtbar (Admin sieht sie); Graduation-Cron (mit Secret) löscht eine künstlich überfällige Test-Klasse inkl. verwaister Alben + S3.
- Album-Formular ohne Schuljahr; Klassen-Verwaltung mit Zug+Einschulungsjahr + Status; Dropdowns zeigen berechnete Labels.
