import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ItemsRepo } from "../items/repo.js";
import type { ReportsRepo } from "../reports/repo.js";
import type { Storage } from "../storage/s3.js";
import type { Mailer } from "../auth/mailer.js";
import type { AuthRepo } from "../auth/repo.js";

export interface CronRoutesDeps {
  itemsRepo: ItemsRepo;
  reportsRepo: ReportsRepo;
  storage: Storage;
  mailer: Mailer;
  authRepo: AuthRepo;
  cronSecret: string;
  trashRetentionDays: number;
}

/** Bearer-check for cron endpoints. Returns true if valid, sends 401 and returns false if not. */
async function requireCron(
  cronSecret: string,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const auth = req.headers["authorization"] ?? "";
  const expected = `Bearer ${cronSecret}`;
  // Constant-time comparison is fine here — cronSecret is not user input to exploit timing
  if (!cronSecret || auth !== expected) {
    await reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

export function registerCronRoutes(app: FastifyInstance, deps: CronRoutesDeps): void {
  const { itemsRepo, reportsRepo, storage, mailer, authRepo, cronSecret, trashRetentionDays } = deps;

  // GET /api/cron/purge — delete all trashed items + reports older than retention window
  app.get(
    "/api/cron/purge",
    async (req, reply) => {
      if (!await requireCron(cronSecret, req, reply)) return;

      const before = new Date(Date.now() - trashRetentionDays * 86_400_000);

      // Fetch S3 keys BEFORE deleting items from DB
      const trashedItems = await itemsRepo.purgeTrashed(before);
      const keys = trashedItems.flatMap((i) => [i.s3Key, i.thumbKey]).filter(Boolean);
      if (keys.length > 0) {
        await storage.deleteObjects(keys);
      }

      const purgedReports = await reportsRepo.purgeTrashed(before);

      return reply.send({
        purgedItems: trashedItems.length,
        purgedReports,
      });
    },
  );

  // GET /api/cron/digest — count pending + open; send digest mail to all active admins if >0
  app.get(
    "/api/cron/digest",
    async (req, reply) => {
      if (!await requireCron(cronSecret, req, reply)) return;

      const [pendingCount, openReports] = await Promise.all([
        itemsRepo.countPending(),
        reportsRepo.countOpen(),
      ]);

      let sent = 0;
      if (pendingCount > 0 || openReports > 0) {
        const adminEmails = await authRepo.listAdminEmails();
        await Promise.all(
          adminEmails.map((email) => mailer.sendDigest(email, { pendingCount, openReports })),
        );
        sent = adminEmails.length;
      }

      return reply.send({ sent, pendingCount, openReports });
    },
  );
}
