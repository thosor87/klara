import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ItemsRepo } from "../items/repo.js";
import type { Storage } from "../storage/s3.js";
import { type Audit, noopAudit } from "../audit/recorder.js";

export interface TrashRoutesDeps {
  itemsRepo: ItemsRepo;
  storage: Storage;
  trashRetentionDays: number;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  audit?: Audit;
}

export function registerTrashRoutes(app: FastifyInstance, deps: TrashRoutesDeps): void {
  const { itemsRepo, storage, trashRetentionDays, requireAdmin } = deps;
  const audit = deps.audit ?? noopAudit;

  // GET /api/admin/trash — list trashed items with daysLeft and presigned thumbUrl
  app.get(
    "/api/admin/trash",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      const items = await itemsRepo.listTrashed();
      const now = Date.now();

      const result = await Promise.all(
        items.map(async (item) => {
          const trashedAt = item.trashedAt ? new Date(item.trashedAt).getTime() : now;
          const ageMs = now - trashedAt;
          const ageDays = Math.floor(ageMs / 86_400_000);
          const daysLeft = Math.max(0, trashRetentionDays - ageDays);
          const thumbUrl = await storage.presignGet(item.thumbKey);
          return {
            id: item.id,
            folderName: item.folderName,
            caption: item.caption,
            trashedAt: item.trashedAt,
            daysLeft,
            thumbUrl,
          };
        }),
      );

      return reply.send(result);
    },
  );

  // POST /api/admin/trash/:itemId/restore — restore a trashed item back to pending
  app.post<{ Params: { itemId: string } }>(
    "/api/admin/trash/:itemId/restore",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const restored = await itemsRepo.restore(req.params.itemId);
      if (!restored) {
        return reply.code(404).send({ error: "item_not_found" });
      }
      return reply.send({ ok: true });
    },
  );

  // DELETE /api/admin/trash/:itemId — permanently delete a trashed item (row + files)
  app.delete<{ Params: { itemId: string } }>(
    "/api/admin/trash/:itemId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      // Only items that are actually in the trash may be hard-deleted here.
      const item = await itemsRepo.findById(req.params.itemId);
      if (!item || item.status !== "trashed") {
        return reply.code(404).send({ error: "item_not_found" });
      }
      const keys = await itemsRepo.deleteById(item.id);
      if (keys) {
        await storage.deleteObjects([keys.s3Key, keys.thumbKey]);
      }
      audit.record(req, "item.purge", "Foto/Video endgültig gelöscht");
      return reply.send({ ok: true });
    },
  );
}
