import type { Sql } from "postgres";
import type { TrashedS3Keys } from "../items/repo.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

/**
 * Plan 7 — DB operations the graduation cron orchestrates. Kept separate from
 * the orchestration logic (which classes are expired) so the cron can be unit
 * tested with a Fake. The cron decides WHICH classes to purge (via cohortInfo);
 * this repo performs the destructive DB work for one class.
 */
export interface GraduationRepo {
  /** folder ids currently linked to this class via folder_classes. */
  foldersForClass(classId: string): Promise<string[]>;
  /** Remove all folder_classes links for this class. */
  unlinkClass(classId: string): Promise<void>;
  /** Of the given folders, which now have NO folder_classes rows (orphaned)? */
  orphanFolders(folderIds: string[]): Promise<string[]>;
  /** s3/thumb keys of all items in the given folders. */
  itemKeysForFolders(folderIds: string[]): Promise<TrashedS3Keys[]>;
  /** Delete the given folders and their items. Returns counts. */
  deleteFoldersAndItems(folderIds: string[]): Promise<{ folders: number; items: number }>;
  /** Set users.class_id = null where it references this class. */
  unassignUsers(classId: string): Promise<void>;
  /** Delete the class_options row. */
  deleteClass(classId: string): Promise<void>;
}

export function createPostgresGraduationRepo(sql: SqlTag): GraduationRepo {
  return {
    async foldersForClass(classId) {
      const rows = await sql<{ folder_id: string }[]>`
        SELECT folder_id FROM folder_classes WHERE class_id = ${classId}`;
      return rows.map((r) => r.folder_id);
    },

    async unlinkClass(classId) {
      await sql`DELETE FROM folder_classes WHERE class_id = ${classId}`;
    },

    async orphanFolders(folderIds) {
      if (folderIds.length === 0) return [];
      const rows = await sql<{ id: string }[]>`
        SELECT f.id FROM folders f
        WHERE f.id = ANY(${folderIds}::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM folder_classes fc WHERE fc.folder_id = f.id
          )`;
      return rows.map((r) => r.id);
    },

    async itemKeysForFolders(folderIds) {
      if (folderIds.length === 0) return [];
      const rows = await sql<{ s3_key: string; thumb_key: string }[]>`
        SELECT s3_key, thumb_key FROM items
        WHERE folder_id = ANY(${folderIds}::uuid[])`;
      return rows.map((r) => ({ s3Key: r.s3_key, thumbKey: r.thumb_key }));
    },

    async deleteFoldersAndItems(folderIds) {
      if (folderIds.length === 0) return { folders: 0, items: 0 };
      return sql.begin(async (tx) => {
        const items = await tx<{ id: string }[]>`
          DELETE FROM items WHERE folder_id = ANY(${folderIds}::uuid[]) RETURNING id`;
        const folders = await tx<{ id: string }[]>`
          DELETE FROM folders WHERE id = ANY(${folderIds}::uuid[]) RETURNING id`;
        return { folders: folders.length, items: items.length };
      });
    },

    async unassignUsers(classId) {
      await sql`UPDATE users SET class_id = NULL WHERE class_id = ${classId}`;
    },

    async deleteClass(classId) {
      await sql`DELETE FROM class_options WHERE id = ${classId}`;
    },
  };
}
