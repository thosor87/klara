import postgres from "postgres";
import { config } from "./config.js";

// Eine Verbindung pro Prozess; Neon-pooled-URL verträgt Serverless.
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
});
