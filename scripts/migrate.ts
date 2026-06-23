import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../migrations");

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL nicht gesetzt"); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1, prepare: false });

// Track applied migrations so each runs EXACTLY once. Without this, re-running
// migrate re-executes every migration's seed — and a seed with
// `on conflict do nothing` re-inserts rows an admin has since deleted (e.g. the
// default class options). Tracking makes re-runs no-ops.
await sql`create table if not exists schema_migrations (
  filename   text primary key,
  applied_at timestamptz not null default now()
)`;

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
let applied = new Set(
  (await sql<{ filename: string }[]>`select filename from schema_migrations`).map((r) => r.filename),
);

// One-time baseline: an existing database (the `users` table is present) that
// has no tracking rows yet is assumed to already be at the latest shipped
// migration. Record the current migrations as applied WITHOUT re-running them,
// so their seeds don't fire a second time. New migrations added later run
// normally (tracking table is already populated by then).
if (applied.size === 0) {
  const usersExists = (await sql<{ t: string | null }[]>`select to_regclass('public.users') as t`)[0].t != null;
  if (usersExists) {
    for (const f of files) {
      await sql`insert into schema_migrations (filename) values (${f}) on conflict do nothing`;
    }
    applied = new Set(files);
    console.log("baseline: bestehende DB erkannt — aktuelle Migrationen als angewendet markiert (nichts erneut ausgeführt)");
  }
}

let ran = 0;
for (const file of files) {
  if (applied.has(file)) { console.log(`skip ${file} (bereits angewendet)`); continue; }
  const text = readFileSync(path.join(dir, file), "utf8");
  console.log(`applying ${file} …`);
  await sql.unsafe(text);
  await sql`insert into schema_migrations (filename) values (${file})`;
  ran++;
}
console.log(`migrations done (${ran} neu, ${files.length - ran} übersprungen)`);
await sql.end();
