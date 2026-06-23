import type { Sql } from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

// ---------------------------------------------------------------------------
// DomainsRepo
// ---------------------------------------------------------------------------

export interface DomainsRepo {
  list(): Promise<string[]>;
  add(domain: string): Promise<void>;
  remove(domain: string): Promise<void>;
}

export function createPostgresDomainsRepo(sql: SqlTag): DomainsRepo {
  return {
    async list() {
      const rows = await sql<{ domain: string }[]>`
        SELECT domain FROM allowed_domains ORDER BY domain`;
      return rows.map((r) => r.domain);
    },

    async add(domain) {
      const normalized = domain.trim().toLowerCase();
      await sql`
        INSERT INTO allowed_domains (domain) VALUES (${normalized})
        ON CONFLICT DO NOTHING`;
    },

    async remove(domain) {
      await sql`DELETE FROM allowed_domains WHERE domain = ${domain.trim().toLowerCase()}`;
    },
  };
}

// ---------------------------------------------------------------------------
// ClassOptionsRepo
// ---------------------------------------------------------------------------

export interface ClassOption {
  id: string;
  /** Stored fallback/display label (used for legacy classes; computed for cohorts). */
  label: string;
  /** Zug, e.g. "m"; "" for the regular class (Plan 7). */
  track: string;
  /** Einschulungsjahr; null = legacy class (Plan 7). */
  startYear: number | null;
  sortOrder: number;
  createdAt: string;
}

export interface ClassOptionInput {
  /** Stored label — required for legacy classes, optional for cohorts. */
  label?: string;
  track?: string;
  startYear?: number | null;
}

export interface ClassOptionsRepo {
  list(): Promise<ClassOption[]>;
  /** Idempotent add. For legacy classes pass a label; for cohorts pass track + startYear. */
  add(input: ClassOptionInput): Promise<ClassOption>;
  /** Patch track/startYear/label of an existing class. */
  update(id: string, input: ClassOptionInput): Promise<ClassOption | null>;
  remove(id: string): Promise<void>;
}

/** Stable, UNIQUE internal label key for a cohort (the shown label is computed). */
function cohortKey(track: string, startYear: number | null): string {
  return startYear !== null ? `${track}@${startYear}` : "";
}

function mapClassOption(r: Record<string, unknown>): ClassOption {
  return {
    id: r.id as string,
    label: (r.label as string) ?? "",
    track: (r.track as string) ?? "",
    startYear: (r.start_year as number | null) ?? null,
    sortOrder: r.sort_order as number,
    createdAt: r.created_at as string,
  };
}

export function createPostgresClassOptionsRepo(sql: SqlTag): ClassOptionsRepo {
  return {
    async list() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM class_options ORDER BY sort_order, label`;
      return rows.map(mapClassOption);
    },

    async add(input) {
      const track = (input.track ?? "").trim();
      const startYear = input.startYear ?? null;
      // Cohorts display a COMPUTED label (cohortInfo); the stored `label` is only
      // an internal UNIQUE key. For cohorts derive a stable key `track@startYear`
      // so two cohorts never collide on an empty label (which would make the
      // ON CONFLICT overwrite the first cohort instead of adding a second).
      const label = (input.label ?? "").trim() || cohortKey(track, startYear);
      // Idempotent on the key (label is UNIQUE): re-adding the same cohort/label
      // updates track/start_year instead of throwing a raw 23505 → 500.
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO class_options (label, track, start_year)
        VALUES (${label}, ${track}, ${startYear})
        ON CONFLICT (label) DO UPDATE
          SET track = EXCLUDED.track, start_year = EXCLUDED.start_year
        RETURNING *`;
      return mapClassOption(rows[0]);
    },

    async update(id, input) {
      const current = (await sql<Record<string, unknown>[]>`
        SELECT * FROM class_options WHERE id = ${id}`)[0];
      if (!current) return null;
      if (input.label === undefined && input.track === undefined && input.startYear === undefined) {
        return mapClassOption(current);
      }

      const track = input.track !== undefined ? input.track.trim() : ((current.track as string) ?? "");
      // startYear may be set to null explicitly (back to legacy).
      const startYear = input.startYear !== undefined ? input.startYear : ((current.start_year as number | null) ?? null);
      // Keep the internal label key consistent: explicit label wins; otherwise a
      // cohort gets its `track@startYear` key, a legacy class keeps its label.
      const label =
        input.label !== undefined
          ? input.label.trim()
          : startYear !== null
            ? cohortKey(track, startYear)
            : ((current.label as string) ?? "");

      const rows = await sql<Record<string, unknown>[]>`
        UPDATE class_options SET label = ${label}, track = ${track}, start_year = ${startYear}
        WHERE id = ${id} RETURNING *`;
      return rows.length ? mapClassOption(rows[0]) : null;
    },

    async remove(id) {
      await sql`DELETE FROM class_options WHERE id = ${id}`;
    },
  };
}
