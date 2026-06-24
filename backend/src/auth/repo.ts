import type { Sql } from "postgres";
import type { User, UserRole, UserStatus, LoginTokenRow } from "../types.js";
import { MAX_CODE_ATTEMPTS } from "./tokens.js";

export interface NewLoginToken {
  email: string;
  codeHash: string;
  linkTokenHash: string;
  expiresAt: Date;
}

export interface AuthRepo {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createPendingUser(email: string): Promise<User>;
  insertLoginToken(t: NewLoginToken): Promise<void>;
  /** Neuester, nicht verbrauchter, nicht abgelaufener Token für die E-Mail. */
  findLatestActiveToken(email: string): Promise<LoginTokenRow | null>;
  /** Token über den Link-Hash finden (der Link trägt keine E-Mail). */
  findActiveTokenByLinkHash(linkHash: string): Promise<LoginTokenRow | null>;
  markTokenUsed(id: string): Promise<void>;
  incrementCodeAttempts(id: string): Promise<void>;
  /** How many login tokens were issued for this email since `since` (rate limiting). */
  countRecentLoginTokens(email: string, since: Date): Promise<number>;
  listUsers(): Promise<User[]>;
  upsertActiveUser(email: string, role: UserRole): Promise<User>;
  updateUser(
    id: string,
    data: { status?: UserStatus; role?: UserRole; classId?: string | null },
  ): Promise<User | null>;
  /** Bulk-assign (or clear) a class for many users at once. Returns the updated rows. */
  assignClass(ids: string[], classId: string | null): Promise<User[]>;
  listAdminEmails(): Promise<string[]>;
}

// Re-export MAX_CODE_ATTEMPTS so callers only need one import point.
export { MAX_CODE_ATTEMPTS };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = Sql<any>;

function mapUser(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    email: r.email as string,
    role: r.role as User["role"],
    status: r.status as User["status"],
    classId: (r.class_id as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

function mapToken(r: Record<string, unknown>): LoginTokenRow {
  return {
    id: r.id as string,
    email: r.email as string,
    codeHash: r.code_hash as string,
    linkTokenHash: r.link_token_hash as string,
    expiresAt: r.expires_at as string,
    usedAt: r.used_at as string | null,
    attempts: Number(r.attempts),
  };
}

export function createPostgresAuthRepo(sql: SqlTag): AuthRepo {
  return {
    async findUserByEmail(email) {
      const rows = await sql<Record<string, unknown>[]>`select * from users where email = ${email}`;
      return rows.length ? mapUser(rows[0]) : null;
    },

    async findUserById(id) {
      const rows = await sql<Record<string, unknown>[]>`select * from users where id = ${id}`;
      return rows.length ? mapUser(rows[0]) : null;
    },

    async createPendingUser(email) {
      const rows = await sql<Record<string, unknown>[]>`
        insert into users (email) values (${email}) returning *`;
      return mapUser(rows[0]);
    },

    async insertLoginToken(t) {
      await sql`
        insert into login_tokens (email, code_hash, link_token_hash, expires_at)
        values (${t.email}, ${t.codeHash}, ${t.linkTokenHash}, ${t.expiresAt})`;
    },

    async findLatestActiveToken(email) {
      const rows = await sql<Record<string, unknown>[]>`
        select * from login_tokens
        where email = ${email}
          and used_at is null
          and expires_at > now()
          and attempts < ${MAX_CODE_ATTEMPTS}
        order by created_at desc
        limit 1`;
      return rows.length ? mapToken(rows[0]) : null;
    },

    async findActiveTokenByLinkHash(linkHash) {
      const rows = await sql<Record<string, unknown>[]>`
        select * from login_tokens
        where link_token_hash = ${linkHash}
          and used_at is null
          and expires_at > now()
        order by created_at desc
        limit 1`;
      return rows.length ? mapToken(rows[0]) : null;
    },

    async markTokenUsed(id) {
      await sql`update login_tokens set used_at = now() where id = ${id}`;
    },

    async incrementCodeAttempts(id) {
      await sql`update login_tokens set attempts = attempts + 1 where id = ${id}`;
    },

    async countRecentLoginTokens(email, since) {
      const rows = await sql<{ count: string }[]>`
        select count(*)::int as count from login_tokens
        where email = ${email} and created_at > ${since}`;
      return Number(rows[0]?.count ?? 0);
    },

    async listUsers() {
      const rows = await sql<Record<string, unknown>[]>`select * from users order by created_at asc`;
      return rows.map(mapUser);
    },

    async upsertActiveUser(email, role) {
      // On conflict: activate the existing user but preserve their current role.
      // Callers who want to change role must use updateUser explicitly.
      const rows = await sql<Record<string, unknown>[]>`
        insert into users (email, role, status)
        values (${email}, ${role}, 'active')
        on conflict (email) do update set status = 'active'
        returning *`;
      return mapUser(rows[0]);
    },

    async updateUser(id, data) {
      const updates: Record<string, unknown> = {};
      if (data.status !== undefined) updates.status = data.status;
      if (data.role !== undefined) updates.role = data.role;
      // classId may be set to null explicitly (remove class assignment), so a
      // plain `!== undefined` check is what distinguishes "not provided" from
      // "set to null".
      if (data.classId !== undefined) updates.class_id = data.classId;

      // Route guards ensure updates is never empty; branch kept for interface correctness.
      if (Object.keys(updates).length === 0) {
        const rows = await sql<Record<string, unknown>[]>`select * from users where id = ${id}`;
        return rows.length ? mapUser(rows[0]) : null;
      }

      const rows = await sql<Record<string, unknown>[]>`
        update users set ${sql(updates)} where id = ${id} returning *`;
      return rows.length ? mapUser(rows[0]) : null;
    },

    async assignClass(ids, classId) {
      if (ids.length === 0) return [];
      const rows = await sql<Record<string, unknown>[]>`
        update users set class_id = ${classId}
        where id = any(${ids}::uuid[])
        returning *`;
      return rows.map(mapUser);
    },

    async listAdminEmails() {
      const rows = await sql<{ email: string }[]>`
        select email from users where role = 'admin' and status = 'active' order by created_at asc`;
      return rows.map((r) => r.email);
    },
  };
}
