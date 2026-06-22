import postgres from "postgres";
import "dotenv/config";

const email = (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!email) { console.error("INITIAL_ADMIN_EMAIL nicht gesetzt"); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1 });

await sql`
  insert into users (email, role, status) values (${email}, 'admin', 'active')
  on conflict (email) do update set role = 'admin', status = 'active'
`;
console.log(`Erst-Admin gesetzt: ${email}`);
await sql.end();
