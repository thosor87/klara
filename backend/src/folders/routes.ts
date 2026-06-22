import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { FoldersRepo } from "./repo.js";

export interface FolderRoutesDeps {
  foldersRepo: FoldersRepo;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerFolderRoutes(app: FastifyInstance, deps: FolderRoutesDeps): void {
  const { foldersRepo, requireUser, requireAdmin } = deps;

  // GET /api/folders — members see only enabled, admins see all
  app.get(
    "/api/folders",
    { preHandler: requireUser },
    async (req, reply) => {
      const folders =
        req.user!.role === "admin"
          ? await foldersRepo.listAll()
          : await foldersRepo.listEnabled();

      const counts = await foldersRepo.itemCounts();

      const result = folders.map((f) => ({
        id: f.id,
        name: f.name,
        schoolYear: f.schoolYear,
        classLabel: f.classLabel,
        enabled: f.enabled,
        itemCount: counts.get(f.id) ?? 0,
      }));

      return reply.send(result);
    },
  );

  // POST /api/admin/folders — create a folder (admin only)
  app.post<{ Body: { name?: string; schoolYear?: string; classLabel?: string } }>(
    "/api/admin/folders",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { name, schoolYear, classLabel } = req.body ?? {};

      if (!name) {
        return reply.code(400).send({ error: "name is required" });
      }

      const folder = await foldersRepo.create({
        name,
        schoolYear: schoolYear ?? "",
        classLabel: classLabel ?? "",
        createdBy: req.user!.id,
      });

      return reply.code(201).send(folder);
    },
  );

  // PATCH /api/admin/folders/:id — update a folder (admin only)
  app.patch<{
    Params: { id: string };
    Body: { name?: string; schoolYear?: string; classLabel?: string; enabled?: boolean };
  }>(
    "/api/admin/folders/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { name, schoolYear, classLabel, enabled } = req.body ?? {};

      const updated = await foldersRepo.update(id, { name, schoolYear, classLabel, enabled });

      if (!updated) {
        return reply.code(404).send({ error: "not found" });
      }

      return reply.send(updated);
    },
  );
}
