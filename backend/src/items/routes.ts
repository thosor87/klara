import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ItemsService } from "./service.js";
import { AppError } from "./service.js";

export interface ItemRoutesDeps {
  itemsService: ItemsService;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerItemRoutes(app: FastifyInstance, deps: ItemRoutesDeps): void {
  const { itemsService, requireUser, requireAdmin } = deps;

  // POST /api/folders/:folderId/uploads/presign — generate presigned PUT URLs
  app.post<{ Params: { folderId: string }; Body: { contentType?: string } }>(
    "/api/folders/:folderId/uploads/presign",
    { preHandler: requireUser },
    async (req, reply) => {
      const { contentType } = req.body ?? {};

      if (!contentType) {
        return reply.code(400).send({ error: "contentType is required" });
      }

      try {
        const result = await itemsService.presignUpload(req.params.folderId, contentType, {
          isAdmin: req.user!.role === "admin",
          classId: req.user!.classId,
        });
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof AppError && err.code === "folder_not_found") {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // POST /api/folders/:folderId/items — confirm upload and create item record
  app.post<{ Params: { folderId: string }; Body: { itemId?: string; caption?: string } }>(
    "/api/folders/:folderId/items",
    { preHandler: requireUser },
    async (req, reply) => {
      const { itemId, caption } = req.body ?? {};

      if (!itemId) {
        return reply.code(400).send({ error: "itemId is required" });
      }

      try {
        const item = await itemsService.confirmUpload(
          req.params.folderId,
          itemId,
          caption ?? "",
          req.user!.id,
          { isAdmin: req.user!.role === "admin", classId: req.user!.classId },
        );
        return reply.code(201).send(item);
      } catch (err) {
        if (err instanceof AppError && err.code === "upload_incomplete") {
          return reply.code(400).send({ error: "upload_incomplete" });
        }
        if (err instanceof AppError && err.code === "already_confirmed") {
          return reply.code(409).send({ error: "already_confirmed" });
        }
        throw err;
      }
    },
  );

  // GET /api/folders/:folderId/items — list items in a folder
  app.get<{ Params: { folderId: string } }>(
    "/api/folders/:folderId/items",
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const items = await itemsService.listFolderItems(req.params.folderId, {
          isAdmin: req.user!.role === "admin",
          userId: req.user!.id,
          classId: req.user!.classId,
        });
        return reply.send(items);
      } catch (err) {
        if (err instanceof AppError && err.code === "folder_not_found") {
          return reply.code(404).send({ error: "folder_not_found" });
        }
        throw err;
      }
    },
  );

  // DELETE /api/items/:id — delete own pending item (requireUser)
  app.delete<{ Params: { id: string } }>(
    "/api/items/:id",
    { preHandler: requireUser },
    async (req, reply) => {
      try {
        const result = await itemsService.deleteOwnPending(req.params.id, req.user!.id);
        return reply.send(result);
      } catch (err) {
        if (err instanceof AppError && err.code === "not_allowed") {
          return reply.code(403).send({ error: "not_allowed" });
        }
        throw err;
      }
    },
  );

  // GET /api/admin/pending — list all pending items (admin only)
  app.get(
    "/api/admin/pending",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      const items = await itemsService.listPending();
      return reply.send(items);
    },
  );

  // POST /api/admin/items/approve — approve items by ids (admin only)
  app.post<{ Body: { ids?: string[] } }>(
    "/api/admin/items/approve",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { ids } = req.body ?? {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: "ids must be a non-empty array" });
      }

      const result = await itemsService.approve(ids, req.user!.id);
      return reply.send(result);
    },
  );

  // POST /api/admin/items/reject — reject (trash) items by ids (admin only)
  app.post<{ Body: { ids?: string[] } }>(
    "/api/admin/items/reject",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { ids } = req.body ?? {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: "ids must be a non-empty array" });
      }

      const result = await itemsService.reject(ids);
      return reply.send(result);
    },
  );

  // POST /api/admin/items/unapprove — set approved items back to pending (admin only)
  app.post<{ Body: { ids?: string[] } }>(
    "/api/admin/items/unapprove",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { ids } = req.body ?? {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.code(400).send({ error: "ids must be a non-empty array" });
      }

      const result = await itemsService.unapprove(ids);
      return reply.send(result);
    },
  );
}
