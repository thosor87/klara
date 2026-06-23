import postgres from "postgres";
import { config } from "./config.js";

// Eine Verbindung pro Prozess; Neon-pooled-URL verträgt Serverless.
// prepare:false ist Pflicht für Neons gepoolte Verbindung (pgbouncer im
// Transaction-Mode): Prepared Statements / gecachte Pläne überleben dort
// Schema-Änderungen nicht ("cached plan must not change result type" nach
// Migrationen). Ohne Prepared Statements gibt es diesen Cache nicht.
export const sql = postgres(config.databaseUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 20,
  prepare: false,
});
