import type { Sql } from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

export type ReportStatus = "open" | "answered" | "ignored" | "trashed";

export interface Report {
  id: string;
  itemId: string;
  reason: string;
  reportedBy: string | null;
  status: ReportStatus;
  response: string;
  createdAt: string;
  trashedAt: string | null;
}

export interface ReportWithDetails extends Report {
  folderName: string;
  reportedByEmail: string | null;
  itemS3Key: string;
  itemThumbKey: string;
}

export interface ReportsRepo {
  create(data: { itemId: string; reason: string; reportedBy: string | null }): Promise<Report>;
  listForAdmin(): Promise<ReportWithDetails[]>;
  findById(id: string): Promise<Report | null>;
  setIgnored(id: string): Promise<boolean>;
  setAnswered(id: string, response: string): Promise<boolean>;
  setTrashed(id: string): Promise<boolean>;
  countOpen(): Promise<number>;
  purgeTrashed(before: Date): Promise<number>;
}

function mapReport(r: Record<string, unknown>): Report {
  return {
    id: r.id as string,
    itemId: r.item_id as string,
    reason: r.reason as string,
    reportedBy: (r.reported_by as string | null) ?? null,
    status: r.status as ReportStatus,
    response: r.response as string,
    createdAt: r.created_at as string,
    trashedAt: (r.trashed_at as string | null) ?? null,
  };
}

function mapReportWithDetails(r: Record<string, unknown>): ReportWithDetails {
  return {
    ...mapReport(r),
    folderName: r.folder_name as string,
    reportedByEmail: (r.reported_by_email as string | null) ?? null,
    itemS3Key: r.item_s3_key as string,
    itemThumbKey: r.item_thumb_key as string,
  };
}

export function createPostgresReportsRepo(sql: SqlTag): ReportsRepo {
  return {
    async create(data) {
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO reports (item_id, reason, reported_by)
        VALUES (${data.itemId}, ${data.reason}, ${data.reportedBy ?? null})
        RETURNING *`;
      return mapReport(rows[0]);
    },

    async listForAdmin() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT
          reports.*,
          folders.name AS folder_name,
          reporter.email AS reported_by_email,
          items.s3_key AS item_s3_key,
          items.thumb_key AS item_thumb_key
        FROM reports
        JOIN items ON reports.item_id = items.id
        JOIN folders ON items.folder_id = folders.id
        LEFT JOIN users reporter ON reports.reported_by = reporter.id
        WHERE reports.status IN ('open', 'answered')
        ORDER BY reports.created_at DESC`;
      return rows.map(mapReportWithDetails);
    },

    async findById(id) {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM reports WHERE id = ${id}`;
      return rows.length ? mapReport(rows[0]) : null;
    },

    async setIgnored(id) {
      const rows = await sql<{ id: string }[]>`
        UPDATE reports SET status = 'ignored' WHERE id = ${id} AND status = 'open'
        RETURNING id`;
      return rows.length > 0;
    },

    async setAnswered(id, response) {
      const rows = await sql<{ id: string }[]>`
        UPDATE reports SET status = 'answered', response = ${response}
        WHERE id = ${id} AND status = 'open'
        RETURNING id`;
      return rows.length > 0;
    },

    async setTrashed(id) {
      const rows = await sql<{ id: string }[]>`
        UPDATE reports SET status = 'trashed', trashed_at = now()
        WHERE id = ${id}
        RETURNING id`;
      return rows.length > 0;
    },

    async countOpen() {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::int AS count FROM reports WHERE status = 'open'`;
      return Number(rows[0]?.count ?? 0);
    },

    async purgeTrashed(before) {
      const rows = await sql<{ id: string }[]>`
        DELETE FROM reports
        WHERE status = 'trashed' AND trashed_at < ${before}
        RETURNING id`;
      return rows.length;
    },
  };
}
