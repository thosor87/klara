import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
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
import { createPostgresReportsRepo } from "./reports/repo.js";
import { createReportsService } from "./reports/service.js";
import { registerReportRoutes } from "./reports/routes.js";
import { registerTrashRoutes } from "./admin/trash-routes.js";
import { registerCronRoutes } from "./cron/routes.js";
import { createPostgresDomainsRepo, createPostgresClassOptionsRepo } from "./settings/repo.js";
import { registerSettingsRoutes } from "./settings/routes.js";
import { createPostgresGraduationRepo } from "./classes/repo.js";

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
    // Read the SPA entry once and serve it ourselves (below) so we fully control
    // its Cache-Control — @fastify/static's `send` otherwise stamps max-age=0 and
    // ignores our override, which on a CDN leaves stale index.html pointing at
    // deleted hashed assets (→ "MIME type text/html" module errors).
    const indexHtml = readFileSync(path.join(frontendDist, "index.html"), "utf8");
    await app.register(fastifyStatic, {
      root: frontendDist,
      index: false, // we serve index.html via the not-found handler with our own headers
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Vite content-hashes these filenames, so the name IS the cache-buster.
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "not_found" });
        return;
      }
      // SPA entry (incl. "/") — never cache, so new deploys' hashed asset names load.
      reply
        .header("Cache-Control", "no-cache, must-revalidate")
        .type("text/html")
        .send(indexHtml);
    });
  }

  return app;
}

/** Baut die echten Adapter und liefert BuildOptions für buildApp(). */
export async function defaultRuntime(): Promise<BuildOptions> {
  const authRepo = createPostgresAuthRepo(sql);
  const mailer = config.mailTransport === "ses" ? createSesMailer() : createConsoleMailer();
  const domainsRepo = createPostgresDomainsRepo(sql);
  const classOptionsRepo = createPostgresClassOptionsRepo(sql);
  // Allowed login domains are the single source of truth in the DB (admin-managed,
  // initially seeded from the old env var in migration 004), fetched at request time.
  const service = createAuthService({
    repo: authRepo, mailer,
    getAllowedDomains: async () => domainsRepo.list(),
    tokenTtlMinutes: config.tokenTtlMinutes, appBaseUrl: config.appBaseUrl,
  });

  const storage = createS3Storage();
  const foldersRepo = createPostgresFoldersRepo(sql);
  const itemsRepo = createPostgresItemsRepo(sql);
  const itemsService = createItemsService({ itemsRepo, foldersRepo, storage, maxVideoBytes: config.maxVideoBytes });
  const reportsRepo = createPostgresReportsRepo(sql);
  const reportsService = createReportsService({ reportsRepo, itemsRepo, storage });
  const graduationRepo = createPostgresGraduationRepo(sql);
  const { requireUser, requireAdmin } = makeGuards((id) => authRepo.findUserById(id));

  return {
    registerRoutes(app) {
      registerAuthRoutes(app, {
        service, findUserById: (id) => authRepo.findUserById(id),
        sessionMaxDays: config.sessionMaxDays,
        isProd: config.nodeEnv === "production",
      });
      registerFolderRoutes(app, { foldersRepo, itemsRepo, storage, requireUser, requireAdmin });
      registerItemRoutes(app, { itemsService, requireUser, requireAdmin });
      registerAdminUserRoutes(app, { authRepo, itemsRepo, requireAdmin });
      registerReportRoutes(app, { reportsService, requireUser, requireAdmin });
      registerTrashRoutes(app, {
        itemsRepo, storage, trashRetentionDays: config.trashRetentionDays, requireAdmin,
      });
      registerCronRoutes(app, {
        itemsRepo, reportsRepo, storage, mailer, authRepo,
        classOptionsRepo, graduationRepo,
        cronSecret: config.cronSecret, trashRetentionDays: config.trashRetentionDays,
      });
      registerSettingsRoutes(app, { domainsRepo, classOptionsRepo, requireUser, requireAdmin });
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
