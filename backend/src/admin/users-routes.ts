import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuthRepo } from "../auth/repo.js";
import type { ItemsRepo } from "../items/repo.js";
import type { Storage } from "../storage/s3.js";
import type { UserRole, UserStatus } from "../types.js";
import { type Audit, noopAudit } from "../audit/recorder.js";

export interface AdminUserRoutesDeps {
  authRepo: AuthRepo;
  itemsRepo: ItemsRepo;
  storage: Storage;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  audit?: Audit;
}

export function registerAdminUserRoutes(app: FastifyInstance, deps: AdminUserRoutesDeps): void {
  const { authRepo, itemsRepo, storage, requireAdmin } = deps;
  const audit = deps.audit ?? noopAudit;

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
      audit.record(req, "user.invite", `Konto „${email}" eingeladen / aktiviert`);
      // Allow assigning the class directly when activating (e.g. a pending user).
      if (classId !== undefined) {
        const withClass = await authRepo.updateUser(user.id, { classId });
        return reply.code(201).send(withClass ?? user);
      }
      return reply.code(201).send(user);
    },
  );

  // POST /api/admin/users/assign-class — bulk-assign a class to many users (admin only)
  app.post<{ Body: { userIds?: string[]; classId?: string | null } }>(
    "/api/admin/users/assign-class",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { userIds, classId } = req.body ?? {};
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return reply.code(400).send({ error: "userIds is required" });
      }
      const updated = await authRepo.assignClass(userIds, classId ?? null);
      audit.record(req, "user.assign-class", `Klasse ${classId ? "zugewiesen" : "entfernt"}: ${updated.length} Konto/Konten`);
      return reply.send(updated);
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

      const parts: string[] = [];
      if (status === "active") parts.push("aktiviert");
      if (status === "disabled") parts.push("deaktiviert");
      if (role === "admin") parts.push("zu Admin gemacht");
      if (role === "member") parts.push("zu Mitglied gemacht");
      if (classId !== undefined) parts.push(classId ? "Klasse geändert" : "Klasse entfernt");
      if (parts.length) audit.record(req, "user.update", `Konto „${updated.email}": ${parts.join(", ")}`);

      return reply.send(updated);
    },
  );

  // DELETE /api/admin/users/:id — permanently delete a user (admin only).
  // Safety gate: only deactivated accounts can be deleted (deactivate first).
  app.delete<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id } = req.params;

      if (req.user!.id === id) {
        return reply.code(400).send({ error: "cannot_modify_self" });
      }

      const user = await authRepo.findUserById(id);
      if (!user) {
        return reply.code(404).send({ error: "not found" });
      }
      if (user.status !== "disabled") {
        return reply.code(409).send({ error: "must_deactivate_first" });
      }

      // Remove the user's still-unapproved uploads (DB rows + S3 objects). Already
      // approved photos stay with the class; their uploader is set null via FK.
      const pendingKeys = await itemsRepo.deletePendingByUploader(id);
      if (pendingKeys.length > 0) {
        await storage.deleteObjects(
          pendingKeys.flatMap((k) => [k.s3Key, k.thumbKey]).filter(Boolean),
        );
      }
      await authRepo.deleteUser(id);

      audit.record(
        req,
        "user.delete",
        `Konto „${user.email}" endgültig gelöscht` +
          (pendingKeys.length > 0 ? ` (${pendingKeys.length} ungeprüfte Uploads entfernt)` : ""),
      );
      return reply.send({ ok: true, deletedPending: pendingKeys.length });
    },
  );
}
