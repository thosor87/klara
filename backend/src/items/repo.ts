import type { Sql } from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

export type ItemStatus = "pending" | "approved" | "trashed";

export interface Item {
  id: string;
  folderId: string;
  type: string;
  status: ItemStatus;
  s3Key: string;
  thumbKey: string;
  caption: string;
  uploadedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  trashedAt: string | null;
}

export interface ItemWithFolderName extends Item {
  folderName: string;
}

export interface TrashedS3Keys {
  s3Key: string;
  thumbKey: string;
}

export interface ItemsRepo {
  insertPending(data: {
    id: string;
    folderId: string;
    s3Key: string;
    thumbKey: string;
    caption: string;
    uploadedBy: string;
  }): Promise<Item | null>;
  listByFolder(folderId: string, statuses: ItemStatus[]): Promise<Item[]>;
  listPending(): Promise<ItemWithFolderName[]>;
  setStatusApproved(ids: string[], approvedBy: string): Promise<number>;
  setStatusTrashed(ids: string[]): Promise<number>;
  findById(id: string): Promise<Item | null>;
  listTrashed(): Promise<ItemWithFolderName[]>;
  restore(id: string): Promise<boolean>;
  countPending(): Promise<number>;
  purgeTrashed(before: Date): Promise<TrashedS3Keys[]>;
  /** Trash any item by id (regardless of current status). Used when a report is deleted. */
  trashItemById(id: string): Promise<boolean>;
}

function mapItem(r: Record<string, unknown>): Item {
  return {
    id: r.id as string,
    folderId: r.folder_id as string,
    type: r.type as string,
    status: r.status as ItemStatus,
    s3Key: r.s3_key as string,
    thumbKey: r.thumb_key as string,
    caption: r.caption as string,
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    approvedBy: (r.approved_by as string | null) ?? null,
    createdAt: r.created_at as string,
    trashedAt: (r.trashed_at as string | null) ?? null,
  };
}

function mapItemWithFolderName(r: Record<string, unknown>): ItemWithFolderName {
  return {
    ...mapItem(r),
    folderName: r.folder_name as string,
  };
}

export function createPostgresItemsRepo(sql: SqlTag): ItemsRepo {
  return {
    async insertPending(data) {
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO items (id, folder_id, s3_key, thumb_key, caption, uploaded_by)
        VALUES (${data.id}, ${data.folderId}, ${data.s3Key}, ${data.thumbKey}, ${data.caption}, ${data.uploadedBy})
        ON CONFLICT (id) DO NOTHING
        RETURNING *`;
      return rows.length ? mapItem(rows[0]) : null;
    },

    async listByFolder(folderId, statuses) {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM items
        WHERE folder_id = ${folderId}
          AND status = ANY(${sql.array(statuses)})
        ORDER BY created_at DESC`;
      return rows.map(mapItem);
    },

    async listPending() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT items.*, folders.name AS folder_name
        FROM items
        JOIN folders ON items.folder_id = folders.id
        WHERE items.status = 'pending'
        ORDER BY items.created_at DESC`;
      return rows.map(mapItemWithFolderName);
    },

    async setStatusApproved(ids, approvedBy) {
      if (ids.length === 0) return 0;
      const rows = await sql<{ id: string }[]>`
        UPDATE items
        SET status = 'approved', approved_by = ${approvedBy}
        WHERE id = ANY(${sql.array(ids)}::uuid[]) AND status = 'pending'
        RETURNING id`;
      return rows.length;
    },

    async setStatusTrashed(ids) {
      if (ids.length === 0) return 0;
      const rows = await sql<{ id: string }[]>`
        UPDATE items
        SET status = 'trashed', trashed_at = now()
        WHERE id = ANY(${sql.array(ids)}::uuid[]) AND status = 'pending'
        RETURNING id`;
      return rows.length;
    },

    async findById(id) {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM items WHERE id = ${id}`;
      return rows.length ? mapItem(rows[0]) : null;
    },

    async listTrashed() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT items.*, folders.name AS folder_name
        FROM items
        JOIN folders ON items.folder_id = folders.id
        WHERE items.status = 'trashed'
        ORDER BY items.trashed_at DESC`;
      return rows.map(mapItemWithFolderName);
    },

    async restore(id) {
      const rows = await sql<{ id: string }[]>`
        UPDATE items
        SET status = 'pending', trashed_at = null
        WHERE id = ${id} AND status = 'trashed'
        RETURNING id`;
      return rows.length > 0;
    },

    async countPending() {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::int AS count FROM items WHERE status = 'pending'`;
      return Number(rows[0]?.count ?? 0);
    },

    async purgeTrashed(before) {
      const rows = await sql<{ s3_key: string; thumb_key: string }[]>`
        DELETE FROM items
        WHERE status = 'trashed' AND trashed_at < ${before}
        RETURNING s3_key, thumb_key`;
      return rows.map((r) => ({ s3Key: r.s3_key, thumbKey: r.thumb_key }));
    },

    async trashItemById(id) {
      const rows = await sql<{ id: string }[]>`
        UPDATE items
        SET status = 'trashed', trashed_at = now()
        WHERE id = ${id}
        RETURNING id`;
      return rows.length > 0;
    },
  };
}
