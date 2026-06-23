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
  label: string;
  sortOrder: number;
  createdAt: string;
}

export interface ClassOptionsRepo {
  list(): Promise<ClassOption[]>;
  add(label: string): Promise<ClassOption>;
  remove(id: string): Promise<void>;
}

function mapClassOption(r: Record<string, unknown>): ClassOption {
  return {
    id: r.id as string,
    label: r.label as string,
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

    async add(label) {
      // Idempotent: re-adding an existing label returns the existing row
      // (label is UNIQUE) instead of throwing a raw 23505 → 500.
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO class_options (label)
        VALUES (${label})
        ON CONFLICT (label) DO UPDATE SET label = EXCLUDED.label
        RETURNING *`;
      return mapClassOption(rows[0]);
    },

    async remove(id) {
      await sql`DELETE FROM class_options WHERE id = ${id}`;
    },
  };
}
