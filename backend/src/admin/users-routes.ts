import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuthRepo } from "../auth/repo.js";
import type { ItemsRepo } from "../items/repo.js";
import type { UserRole, UserStatus } from "../types.js";

export interface AdminUserRoutesDeps {
  authRepo: AuthRepo;
  itemsRepo: ItemsRepo;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerAdminUserRoutes(app: FastifyInstance, deps: AdminUserRoutesDeps): void {
  const { authRepo, itemsRepo, requireAdmin } = deps;

  // GET /api/admin/users — list all users (admin only)
  app.get(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      const [users, uploadCounts] = await Promise.all([
        authRepo.listUsers(),
        itemsRepo.uploadCountsByUser(),
      ]);
      const result = users.map((u) => ({
        ...u,
        uploadCount: uploadCounts[u.id] ?? 0,
      }));
      return reply.send(result);
    },
  );

  // POST /api/admin/users — create or activate a user (admin only)
  app.post<{ Body: { email?: string; role?: UserRole; classId?: string | null } }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { email, role, classId } = req.body ?? {};

      if (!email) {
        return reply.code(400).send({ error: "email is required" });
      }

      const user = await authRepo.upsertActiveUser(email, role ?? "member");
      // Allow assigning the class directly when activating (e.g. a pending user).
      if (classId !== undefined) {
        const withClass = await authRepo.updateUser(user.id, { classId });
        return reply.code(201).send(withClass ?? user);
      }
      return reply.code(201).send(user);
    },
  );

  // PATCH /api/admin/users/:id — update a user (admin only)
  app.patch<{
    Params: { id: string };
    Body: { status?: UserStatus; role?: UserRole; classId?: string | null };
  }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { status, role, classId } = req.body ?? {};

      // Reject empty patch bodies — nothing to update
      if (status === undefined && role === undefined && classId === undefined) {
        return reply.code(400).send({ error: "nothing to update" });
      }

      // cannot_modify_self guard: block disabling self or demoting self admin→member
      if (req.user!.id === id) {
        if (status === "disabled" || role === "member") {
          return reply.code(400).send({ error: "cannot_modify_self" });
        }
      }

      const updated = await authRepo.updateUser(id, { status, role, classId });

      if (!updated) {
        return reply.code(404).send({ error: "not found" });
      }

      return reply.send(updated);
    },
  );
}
