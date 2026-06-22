import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../migrations");

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL nicht gesetzt"); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const text = readFileSync(path.join(dir, file), "utf8");
  console.log(`applying ${file} …`);
  await sql.unsafe(text);
}
console.log("migrations done");
await sql.end();
