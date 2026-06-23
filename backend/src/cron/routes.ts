import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ItemsRepo } from "../items/repo.js";
import type { ReportsRepo } from "../reports/repo.js";
import type { Storage } from "../storage/s3.js";
import type { Mailer } from "../auth/mailer.js";
import type { AuthRepo } from "../auth/repo.js";
import type { ClassOptionsRepo } from "../settings/repo.js";
import type { GraduationRepo } from "../classes/repo.js";
import { cohortInfo } from "../classes/cohort.js";

export interface CronRoutesDeps {
  itemsRepo: ItemsRepo;
  reportsRepo: ReportsRepo;
  storage: Storage;
  mailer: Mailer;
  authRepo: AuthRepo;
  classOptionsRepo: ClassOptionsRepo;
  graduationRepo: GraduationRepo;
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
  // Fail closed: an unset/empty CRON_SECRET can never match (the endpoints are
  // unreachable until the secret is configured in the environment). Plain
  // comparison — timing is not a concern for a fixed shared secret.
  if (!cronSecret || auth !== expected) {
    await reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

export function registerCronRoutes(app: FastifyInstance, deps: CronRoutesDeps): void {
  const {
    itemsRepo, reportsRepo, storage, mailer, authRepo,
    classOptionsRepo, graduationRepo, cronSecret, trashRetentionDays,
  } = deps;

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

  // GET /api/cron/graduation — purge cohorts that are >180 days past their
  // graduation (status "expired"): unlink from albums, delete orphaned albums
  // (incl. items + S3 objects), unassign members, delete the class.
  app.get(
    "/api/cron/graduation",
    async (req, reply) => {
      if (!await requireCron(cronSecret, req, reply)) return;

      const now = new Date();
      const classes = await classOptionsRepo.list();
      // Only cohorts (start_year set) can expire; legacy classes never do.
      const expired = classes.filter(
        (c) => c.startYear !== null && cohortInfo(c.track, c.startYear, now).status === "expired",
      );

      let deletedClasses = 0;
      let deletedFolders = 0;
      let deletedItems = 0;

      for (const cls of expired) {
        // Folders this class was linked to, before we cut the links.
        const linked = await graduationRepo.foldersForClass(cls.id);
        await graduationRepo.unlinkClass(cls.id);

        // Of those, the ones now orphaned (no remaining class) get purged.
        // Shared folders still linked to a living class are kept.
        const orphans = await graduationRepo.orphanFolders(linked);
        if (orphans.length > 0) {
          const keys = (await graduationRepo.itemKeysForFolders(orphans))
            .flatMap((k) => [k.s3Key, k.thumbKey])
            .filter(Boolean);
          if (keys.length > 0) {
            await storage.deleteObjects(keys);
          }
          const { folders, items } = await graduationRepo.deleteFoldersAndItems(orphans);
          deletedFolders += folders;
          deletedItems += items;
        }

        await graduationRepo.unassignUsers(cls.id);
        await graduationRepo.deleteClass(cls.id);
        deletedClasses += 1;
      }

      return reply.send({ deletedClasses, deletedFolders, deletedItems });
    },
  );
}
