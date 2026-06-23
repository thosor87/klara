import type { Sql } from "postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

export interface Folder {
  id: string;
  name: string;
  schoolYear: string;
  classLabel: string;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  coverItemId: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

export interface FoldersRepo {
  listAll(): Promise<Folder[]>;
  listEnabled(): Promise<Folder[]>;
  create(data: {
    name: string;
    schoolYear: string;
    classLabel: string;
    createdBy: string;
    coverItemId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }): Promise<Folder>;
  update(
    id: string,
    data: {
      name?: string;
      schoolYear?: string;
      classLabel?: string;
      enabled?: boolean;
      coverItemId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    },
  ): Promise<Folder | null>;
  findById(id: string): Promise<Folder | null>;
  /** folderId → approved item count */
  itemCounts(): Promise<Map<string, number>>;
  /**
   * Swap sort_order with adjacent folder (up = lower sort_order, down = higher).
   * Returns true if swap happened, false if already at boundary (no-op).
   */
  move(id: string, direction: "up" | "down"): Promise<boolean>;
}

function mapFolder(r: Record<string, unknown>): Folder {
  return {
    id: r.id as string,
    name: r.name as string,
    schoolYear: r.school_year as string,
    classLabel: r.class_label as string,
    enabled: r.enabled as boolean,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
    coverItemId: (r.cover_item_id as string | null) ?? null,
    startDate: (r.start_date as string | null) ?? null,
    endDate: (r.end_date as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
  };
}

export function createPostgresFoldersRepo(sql: SqlTag): FoldersRepo {
  return {
    async listAll() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM folders ORDER BY sort_order, created_at`;
      return rows.map(mapFolder);
    },

    async listEnabled() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM folders WHERE enabled = true ORDER BY sort_order, created_at`;
      return rows.map(mapFolder);
    },

    async create(data) {
      // New folders append at the end of the manual order.
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO folders (name, school_year, class_label, created_by, cover_item_id, start_date, end_date, sort_order)
        VALUES (
          ${data.name}, ${data.schoolYear}, ${data.classLabel}, ${data.createdBy},
          ${data.coverItemId ?? null}, ${data.startDate ?? null}, ${data.endDate ?? null},
          (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM folders)
        )
        RETURNING *`;
      return mapFolder(rows[0]);
    },

    async findById(id) {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM folders WHERE id = ${id}`;
      return rows.length ? mapFolder(rows[0]) : null;
    },

    async update(id, data) {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.schoolYear !== undefined) updates.school_year = data.schoolYear;
      if (data.classLabel !== undefined) updates.class_label = data.classLabel;
      if (data.enabled !== undefined) updates.enabled = data.enabled;
      if (data.coverItemId !== undefined) updates.cover_item_id = data.coverItemId;
      if (data.startDate !== undefined) updates.start_date = data.startDate;
      if (data.endDate !== undefined) updates.end_date = data.endDate;

      if (Object.keys(updates).length === 0) {
        return this.findById(id);
      }

      const rows = await sql<Record<string, unknown>[]>`
        UPDATE folders SET ${sql(updates)} WHERE id = ${id} RETURNING *`;
      return rows.length ? mapFolder(rows[0]) : null;
    },

    async itemCounts() {
      const rows = await sql<{ folder_id: string; count: string }[]>`
        SELECT folder_id, COUNT(*) AS count
        FROM items
        WHERE status = 'approved'
        GROUP BY folder_id`;

      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(row.folder_id, Number(row.count));
      }
      return map;
    },

    async move(id, direction) {
      // Take the current visible order, swap the item with its neighbor, then
      // re-index everyone to distinct 0..n-1 values. Reindexing (rather than a
      // pairwise sort_order swap) is robust even when folders share a sort_order
      // (e.g. all default 0), and uses single-id UPDATEs (correct uuid binding).
      const all = await sql<{ id: string }[]>`
        SELECT id FROM folders ORDER BY sort_order, created_at`;

      const idx = all.findIndex((f) => f.id === id);
      if (idx === -1) return false;

      const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= all.length) return false;

      const order = all.map((f) => f.id);
      [order[idx], order[neighborIdx]] = [order[neighborIdx], order[idx]];

      await sql.begin(async (tx) => {
        for (let k = 0; k < order.length; k++) {
          await tx`UPDATE folders SET sort_order = ${k} WHERE id = ${order[k]}`;
        }
      });

      return true;
    },
  };
}
