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
}

export interface FoldersRepo {
  listAll(): Promise<Folder[]>;
  listEnabled(): Promise<Folder[]>;
  create(data: {
    name: string;
    schoolYear: string;
    classLabel: string;
    createdBy: string;
  }): Promise<Folder>;
  update(
    id: string,
    data: { name?: string; schoolYear?: string; classLabel?: string; enabled?: boolean },
  ): Promise<Folder | null>;
  findById(id: string): Promise<Folder | null>;
  /** folderId → approved item count */
  itemCounts(): Promise<Map<string, number>>;
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
  };
}

export function createPostgresFoldersRepo(sql: SqlTag): FoldersRepo {
  return {
    async listAll() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM folders ORDER BY created_at DESC`;
      return rows.map(mapFolder);
    },

    async listEnabled() {
      const rows = await sql<Record<string, unknown>[]>`
        SELECT * FROM folders WHERE enabled = true ORDER BY created_at DESC`;
      return rows.map(mapFolder);
    },

    async create(data) {
      const rows = await sql<Record<string, unknown>[]>`
        INSERT INTO folders (name, school_year, class_label, created_by)
        VALUES (${data.name}, ${data.schoolYear}, ${data.classLabel}, ${data.createdBy})
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
  };
}
