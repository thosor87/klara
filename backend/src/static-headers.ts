import path from "node:path";
import type { FastifyReply } from "fastify";

/**
 * Cache-Header für die statisch ausgelieferten Frontend-Dateien.
 *
 * Vite content-hasht die Dateinamen unter `assets/`, der Name IST also der
 * Cache-Buster — solche Dateien dürfen unbegrenzt gecacht werden. Alles andere
 * (index.html, favicon, …) bleibt unangetastet und behält die Default-Header.
 *
 * Wird als `setHeaders` an @fastify/static übergeben; ab v10 ist das erste
 * Argument ein FastifyReply, nicht mehr die rohe ServerResponse.
 */
export function setStaticHeaders(reply: FastifyReply, filePath: string): void {
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
  }
}
