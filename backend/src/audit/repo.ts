import type { Sql } from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface AuditRepo {
  log(e: { actorId: string | null; actorEmail: string; action: string; summary: string }): Promise<void>;
  /** Newest first, capped at 500. */
  list(limit: number): Promise<AuditEntry[]>;
}

function mapEntry(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as string,
    actorEmail: r.actor_email as string,
    action: r.action as string,
    summary: r.summary as string,
    createdAt: r.created_at as string,
  };
}

export function createPostgresAuditRepo(sql: SqlTag): AuditRepo {
  return {
    async log(e) {
      await sql`
        INSERT INTO audit_log (actor_id, actor_email, action, summary)
        VALUES (${e.actorId}, ${e.actorEmail}, ${e.action}, ${e.summary})`;
    },
    async list(limit) {
      const capped = Math.max(1, Math.min(500, Math.floor(limit) || 200));
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ${capped}`;
      return rows.map(mapEntry);
    },
  };
}
