# KlaRa Audit-Log — Design / Spec

**Datum:** 2026-06-24
**Status:** zur Abnahme

## Ziel

Ein **Audit-Log**: nachvollziehen, **wer wann was** getan hat. Dezent versteckt unten in der
Nutzer-Verwaltung (admin-only), neueste zuerst.

## Entscheidungen

1. **Geloggt werden** (inkl. **Logins**): Nutzer-Verwaltung, Album-Lebenszyklus,
   Foto/Video-Moderation, Meldungen, Dokumente, **Anmeldungen**.
2. **Anzeige:** default letzte **200**, per „Mehr anzeigen" auf **500** erweiterbar.
3. **Actor-E-Mail wird denormalisiert gespeichert** (bleibt lesbar, auch wenn ein Konto später
   gelöscht wird). `actor_id` als FK mit `on delete set null`.
4. **Vorgerendeter deutscher Text** (`summary`) pro Eintrag → Anzeige trivial; `action`-Key für
   Kategorie/Icon/Filter.
5. **Audit darf nie eine Aktion brechen:** Logging ist fire-and-forget mit Fehler-Catch.

## Datenmodell — Migration 011

```sql
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id) on delete set null,
  actor_email text not null,
  action      text not null,   -- machine key: 'login', 'user.activate', 'folder.delete', …
  summary     text not null,   -- human-readable German
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);
```

## Backend

**Repo `AuditRepo`** (`backend/src/audit/repo.ts`):
- `log(e: { actorId: string|null; actorEmail: string; action: string; summary: string }): Promise<void>`
- `list(limit: number): Promise<AuditEntry[]>` (neueste zuerst, `limit` geklemmt ≤ 500)

**Recorder-Helfer** (`backend/src/audit/recorder.ts`): `createAudit(repo): Audit` mit
`record(req, action, summary)` — liest Actor aus `req.user`, ruft `repo.log` **fire-and-forget**
(`.catch` → console.warn). Wird in die betroffenen Route-Gruppen injiziert (`audit` in Deps).

**Instrumentierte Stellen** (nach erfolgreicher Mutation `audit.record(...)`):
- **auth/routes:** nach `setSession` (verify + link) → `action 'login'`, summary `"angemeldet"`.
- **admin/users-routes:** create (eingeladen/aktiviert), patch (status→aktiv/deaktiviert, rolle→admin/member, klasse gesetzt/entfernt), assign-class (bulk: „N Konten Klasse X zugewiesen").
- **folders/routes:** create, patch (bearbeitet / aktiviert / deaktiviert), delete (Album gelöscht), move (optional, eher nicht — Rauschen).
- **items/routes:** approve (N freigegeben), reject (N abgelehnt), unapprove (zurückgezogen).
- **admin/trash-routes:** permanent delete (endgültig gelöscht).
- **reports/routes:** ignore (Meldung ignoriert), delete (Foto nach Meldung entfernt).
- **documents/routes:** confirm (Dokument hochgeladen), delete (Dokument gelöscht).

**Route** (`backend/src/audit/routes.ts`): `GET /api/admin/audit?limit=200` (requireAdmin) →
`auditRepo.list(min(limit||200, 500))`. Antwort: `{ id, actorEmail, action, summary, createdAt }[]`.

**Server-Wiring:** `auditRepo = createPostgresAuditRepo(sql)`, `audit = createAudit(auditRepo)`,
`audit` in die o.g. Route-Deps; `registerAuditRoutes(app, { auditRepo, requireAdmin })`.

## Frontend

**API:** Typ `AuditEntry { id, actorEmail, action, summary, createdAt }`; `getAudit(limit?)`.

**`AuditLog`-Komponente** (in `AdminUsers.tsx`, ganz unten, nach `DomainsCard`):
- Eingeklappter Abschnitt **„Protokoll"** (Button/Details-Toggle) — dezent.
- Beim Aufklappen: `getAudit(200)` laden, Liste (neueste zuerst): Actor-E-Mail · Summary ·
  Zeit (lokal). Kleines Kategorie-Icon je `action`-Präfix (login/user/folder/item/report/document).
- „Mehr anzeigen" → `getAudit(500)`.

Frontend hat keine Test-Infra → Build + manuell.

## Teststrategie (TDD, Backend)

- **AuditRepo-Fake** in den betroffenen Route-Tests (no-op `log`, steuerbares `list`).
- **audit/routes.test.ts:** GET listet (admin); non-admin → 403; `limit` wird auf 500 geklemmt.
- **Instrumentierung (stichprobenartig):** in 1–2 bestehenden Route-Tests (z. B. users-patch,
  folder-delete) prüfen, dass `audit.record` mit passender `action` aufgerufen wird (via Fake-Spy).
- Audit-Fehler dürfen die Aktion nicht brechen: `record` fängt Fehler (Test: `log` wirft → Route
  trotzdem 2xx).
- **Migration 011** gegen Neon (Freigabe) vor Deploy.

## Reihenfolge

1. Migration 011 + AuditRepo + Recorder + GET-Route (TDD).
2. Instrumentierung der Mutations-Routen (audit in Deps).
3. Frontend `AuditLog` in AdminUsers.
4. Migration live + Build/Tests + Deploy.

## Offene Punkte / Risiken

- Viele Instrumentierungs-Stellen → Route-Deps erweitern + Fakes anpassen (überschaubar, aber breit).
- Keine PII über das Nötige hinaus (nur Actor-E-Mail + Klartext-Summary; keine Foto-Inhalte).
- Aufräumen alter Einträge: vorerst keins (Menge klein); später optional in den purge-Cron.
