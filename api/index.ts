import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.FRONTEND_DIST = path.resolve(__dirname, "../frontend/dist");

let appPromise: Promise<unknown> | null = null;
async function getApp() {
  if (!appPromise) {
    appPromise = import("../backend/dist/server.js").then(async (mod: any) => {
      const app = await mod.buildApp(await mod.defaultRuntime());
      await app.ready();
      return app;
    });
  }
  return appPromise as Promise<{
    server: { emit: (e: string, req: IncomingMessage, res: ServerResponse) => void };
  }>;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}

export const config = { maxDuration: 30 };
