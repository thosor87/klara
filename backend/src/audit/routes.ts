import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AuditRepo } from "./repo.js";

export interface AuditRoutesDeps {
  auditRepo: AuditRepo;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerAuditRoutes(app: FastifyInstance, deps: AuditRoutesDeps): void {
  const { auditRepo, requireAdmin } = deps;

  // GET /api/admin/audit?limit=200 — newest first, capped at 500 in the repo.
  app.get<{ Querystring: { limit?: string } }>(
    "/api/admin/audit",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const limit = Number(req.query.limit) || 200;
      return reply.send(await auditRepo.list(limit));
    },
  );
}
