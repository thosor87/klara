import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import { sql } from "./db.js";
import { createAuthService } from "./auth/service.js";
import { createPostgresAuthRepo } from "./auth/repo.js";
import { createSesMailer, createConsoleMailer } from "./auth/mailer.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { makeGuards } from "./auth/guard.js";
import { createS3Storage } from "./storage/s3.js";
import { createPostgresFoldersRepo } from "./folders/repo.js";
import { registerFolderRoutes } from "./folders/routes.js";
import { createPostgresItemsRepo } from "./items/repo.js";
import { createItemsService } from "./items/service.js";
import { registerItemRoutes } from "./items/routes.js";
import { registerAdminUserRoutes } from "./admin/users-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveFrontendDist(): string {
  if (process.env.FRONTEND_DIST) return path.resolve(process.env.FRONTEND_DIST);
  return path.resolve(__dirname, "../../frontend/dist");
}

export interface BuildOptions {
  /** Test-Hooks: in Tests echte Adapter durch Fakes ersetzen. */
  registerRoutes?: (app: FastifyInstance) => Promise<void> | void;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const frontendDist = resolveFrontendDist();
  const app = Fastify({
    logger: { level: config.nodeEnv === "production" ? "info" : "debug" },
    bodyLimit: 64 * 1024,
  });

  await app.register(fastifyCookie, { secret: config.sessionSecret });

  app.get("/healthz", async () => ({ ok: true }));

  if (opts.registerRoutes) await opts.registerRoutes(app);

  if (existsSync(frontendDist)) {
    await app.register(fastifyStatic, { root: frontendDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      reply.type("text/html").sendFile("index.html");
    });
  }

  return app;
}

/** Baut die echten Adapter und liefert BuildOptions für buildApp(). */
export async function defaultRuntime(): Promise<BuildOptions> {
  const authRepo = createPostgresAuthRepo(sql);
  const mailer = config.mailTransport === "ses" ? createSesMailer() : createConsoleMailer();
  const service = createAuthService({
    repo: authRepo, mailer, allowedDomains: config.allowedDomains,
    tokenTtlMinutes: config.tokenTtlMinutes, appBaseUrl: config.appBaseUrl,
  });

  const storage = createS3Storage();
  const foldersRepo = createPostgresFoldersRepo(sql);
  const itemsRepo = createPostgresItemsRepo(sql);
  const itemsService = createItemsService({ itemsRepo, foldersRepo, storage });
  const { requireUser, requireAdmin } = makeGuards((id) => authRepo.findUserById(id));

  return {
    registerRoutes(app) {
      registerAuthRoutes(app, {
        service, findUserById: (id) => authRepo.findUserById(id),
        sessionMaxDays: config.sessionMaxDays,
        isProd: config.nodeEnv === "production",
      });
      registerFolderRoutes(app, { foldersRepo, requireUser, requireAdmin });
      registerItemRoutes(app, { itemsService, requireUser, requireAdmin });
      registerAdminUserRoutes(app, { authRepo, requireAdmin });
    },
  };
}

// Lokaler Start (npm start / tsx). Auf Vercel wird stattdessen api/index.ts genutzt.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  const port = Number(process.env.PORT ?? 3000);
  defaultRuntime()
    .then((rt) => buildApp(rt))
    .then((app) => app.listen({ port, host: "0.0.0.0" }))
    .then(() => console.log(`KlaRa backend on :${port}`))
    .catch((err) => { console.error(err); process.exit(1); });
}
