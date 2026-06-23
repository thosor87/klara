import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FoldersRepo } from "./repo.js";
import type { ItemsRepo } from "../items/repo.js";
import type { Storage } from "../storage/s3.js";

export interface FolderRoutesDeps {
  foldersRepo: FoldersRepo;
  itemsRepo: ItemsRepo;
  storage: Storage;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerFolderRoutes(app: FastifyInstance, deps: FolderRoutesDeps): void {
  const { foldersRepo, itemsRepo, storage, requireUser, requireAdmin } = deps;

  // GET /api/folders — members see only enabled, admins see all
  app.get(
    "/api/folders",
    { preHandler: requireUser },
    async (req, reply) => {
      const folders =
        req.user!.role === "admin"
          ? await foldersRepo.listAll()
          : await foldersRepo.listForClass(req.user!.classId);

      const counts = await foldersRepo.itemCounts();

      const result = await Promise.all(
        folders.map(async (f) => {
          let coverThumbUrl: string | null = null;
          if (f.coverItemId) {
            const coverItem = await itemsRepo.findById(f.coverItemId);
            if (coverItem) {
              coverThumbUrl = await storage.presignGet(coverItem.thumbKey);
            }
          }
          return {
            id: f.id,
            name: f.name,
            schoolYear: f.schoolYear,
            classLabel: f.classLabel,
            enabled: f.enabled,
            sortOrder: f.sortOrder,
            startDate: f.startDate,
            endDate: f.endDate,
            coverItemId: f.coverItemId,
            coverThumbUrl,
            itemCount: counts.get(f.id) ?? 0,
            classIds: f.classIds,
          };
        }),
      );

      return reply.send(result);
    },
  );

  // POST /api/admin/folders — create a folder (admin only)
  app.post<{
    Body: {
      name?: string;
      schoolYear?: string;
      classLabel?: string;
      coverItemId?: string;
      startDate?: string;
      endDate?: string;
      classIds?: string[];
    };
  }>(
    "/api/admin/folders",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { name, schoolYear, classLabel, coverItemId, startDate, endDate, classIds } =
        req.body ?? {};

      if (!name) {
        return reply.code(400).send({ error: "name is required" });
      }

      const folder = await foldersRepo.create({
        name,
        schoolYear: schoolYear ?? "",
        classLabel: classLabel ?? "",
        createdBy: req.user!.id,
        coverItemId: coverItemId ?? null,
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        classIds: Array.isArray(classIds) ? classIds : undefined,
      });

      return reply.code(201).send(folder);
    },
  );

  // PATCH /api/admin/folders/:id — update a folder (admin only)
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      schoolYear?: string;
      classLabel?: string;
      enabled?: boolean;
      coverItemId?: string | null;
      startDate?: string | null;
      endDate?: string | null;
      classIds?: string[];
    };
  }>(
    "/api/admin/folders/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { name, schoolYear, classLabel, enabled, coverItemId, startDate, endDate, classIds } =
        req.body ?? {};

      // Validate coverItemId: must be an approved item of THIS folder
      if (coverItemId !== undefined && coverItemId !== null) {
        const coverItem = await itemsRepo.findById(coverItemId);
        if (!coverItem || coverItem.folderId !== id || coverItem.status !== "approved") {
          return reply.code(400).send({ error: "invalid_cover" });
        }
      }

      const updated = await foldersRepo.update(id, {
        name,
        schoolYear,
        classLabel,
        enabled,
        coverItemId,
        startDate,
        endDate,
        classIds: Array.isArray(classIds) ? classIds : undefined,
      });

      if (!updated) {
        return reply.code(404).send({ error: "not found" });
      }

      return reply.send(updated);
    },
  );

  // POST /api/admin/folders/:id/move — move folder up or down in sort_order
  app.post<{
    Params: { id: string };
    Body: { direction?: "up" | "down" };
  }>(
    "/api/admin/folders/:id/move",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { direction } = req.body ?? {};

      if (direction !== "up" && direction !== "down") {
        return reply.code(400).send({ error: "direction must be 'up' or 'down'" });
      }

      const moved = await foldersRepo.move(id, direction);
      return reply.send({ moved });
    },
  );

  // DELETE /api/admin/folders/:id — delete a (disabled) album: its photos move to
  // the trash, then the album is hidden. Only allowed once the album is disabled.
  app.delete<{ Params: { id: string } }>(
    "/api/admin/folders/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const folder = await foldersRepo.findById(id);
      if (!folder) {
        return reply.code(404).send({ error: "not found" });
      }
      if (folder.enabled) {
        return reply.code(400).send({ error: "must_disable_first" });
      }
      // Move every still-live photo to the trash (recoverable for the retention
      // window), then soft-delete the album so it disappears from all lists.
      const items = await itemsRepo.listByFolder(id, ["pending", "approved"]);
      const ids = items.map((i) => i.id);
      if (ids.length > 0) {
        await itemsRepo.setStatusTrashed(ids);
      }
      await foldersRepo.softDelete(id);
      return reply.code(204).send();
    },
  );
}
