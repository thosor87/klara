import type { Sql } from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

export interface DocumentRow {
  id: string;
  folderId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  s3Key: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface DocumentsRepo {
  listByFolder(folderId: string): Promise<DocumentRow[]>;
  countByFolder(folderId: string): Promise<number>;
  insert(data: {
    id: string;
    folderId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    s3Key: string;
    uploadedBy: string | null;
  }): Promise<DocumentRow>;
  findById(id: string): Promise<DocumentRow | null>;
  /** Delete a row, returning its s3Key (or null if not found). */
  deleteById(id: string): Promise<{ s3Key: string } | null>;
}

function mapDoc(r: Record<string, unknown>): DocumentRow {
  return {
    id: r.id as string,
    folderId: r.folder_id as string,
    filename: r.filename as string,
    contentType: r.content_type as string,
    sizeBytes: Number(r.size_bytes ?? 0),
    s3Key: r.s3_key as string,
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export function createPostgresDocumentsRepo(sql: SqlTag): DocumentsRepo {
  return {
    async listByFolder(folderId) {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM documents WHERE folder_id = ${folderId} ORDER BY created_at ASC`;
      return rows.map(mapDoc);
    },
    async countByFolder(folderId) {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::int AS count FROM documents WHERE folder_id = ${folderId}`;
      return Number(rows[0]?.count ?? 0);
    },
    async insert(data) {
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO documents (id, folder_id, filename, content_type, size_bytes, s3_key, uploaded_by)
        VALUES (${data.id}, ${data.folderId}, ${data.filename}, ${data.contentType}, ${data.sizeBytes}, ${data.s3Key}, ${data.uploadedBy})
        RETURNING *`;
      return mapDoc(rows[0]);
    },
    async findById(id) {
      const rows = await sql<Record<string, unknown>[]>`SELECT * FROM documents WHERE id = ${id}`;
      return rows.length ? mapDoc(rows[0]) : null;
    },
    async deleteById(id) {
      const rows = await sql<{ s3_key: string }[]>`
        DELETE FROM documents WHERE id = ${id} RETURNING s3_key`;
      return rows.length ? { s3Key: rows[0].s3_key } : null;
    },
  };
}
