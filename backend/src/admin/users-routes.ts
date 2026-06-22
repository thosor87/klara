import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuthRepo } from "../auth/repo.js";
import type { UserRole, UserStatus } from "../types.js";

export interface AdminUserRoutesDeps {
  authRepo: AuthRepo;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerAdminUserRoutes(app: FastifyInstance, deps: AdminUserRoutesDeps): void {
  const { authRepo, requireAdmin } = deps;

  // GET /api/admin/users — list all users (admin only)
  app.get(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      const users = await authRepo.listUsers();
      return reply.send(users);
    },
  );

  // POST /api/admin/users — create or activate a user (admin only)
  app.post<{ Body: { email?: string; role?: UserRole } }>(
    "/api/admin/users",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { email, role } = req.body ?? {};

      if (!email) {
        return reply.code(400).send({ error: "email is required" });
      }

      const user = await authRepo.upsertActiveUser(email, role ?? "member");
      return reply.code(201).send(user);
    },
  );

  // PATCH /api/admin/users/:id — update a user (admin only)
  app.patch<{
    Params: { id: string };
    Body: { status?: UserStatus; role?: UserRole };
  }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;
      const { status, role } = req.body ?? {};

      // cannot_modify_self guard: block disabling self or demoting self admin→member
      if (req.user!.id === id) {
        if (status === "disabled" || role === "member") {
          return reply.code(400).send({ error: "cannot_modify_self" });
        }
      }

      const updated = await authRepo.updateUser(id, { status, role });

      if (!updated) {
        return reply.code(404).send({ error: "not found" });
      }

      return reply.send(updated);
    },
  );
}
