import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { DomainsRepo, ClassOptionsRepo } from "./repo.js";

export interface SettingsRoutesDeps {
  domainsRepo: DomainsRepo;
  classOptionsRepo: ClassOptionsRepo;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function registerSettingsRoutes(app: FastifyInstance, deps: SettingsRoutesDeps): void {
  const { domainsRepo, classOptionsRepo, requireUser, requireAdmin } = deps;

  // ---- Domains (requireAdmin) ----

  // GET /api/admin/domains
  app.get("/api/admin/domains", { preHandler: requireAdmin }, async (_req, reply) => {
    const domains = await domainsRepo.list();
    return reply.send(domains);
  });

  // POST /api/admin/domains
  app.post<{ Body: { domain?: string } }>(
    "/api/admin/domains",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { domain } = req.body ?? {};
      if (!domain || !domain.trim()) {
        return reply.code(400).send({ error: "domain is required" });
      }
      await domainsRepo.add(domain);
      return reply.code(201).send({ domain: domain.trim().toLowerCase() });
    },
  );

  // DELETE /api/admin/domains/:domain
  app.delete<{ Params: { domain: string } }>(
    "/api/admin/domains/:domain",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await domainsRepo.remove(req.params.domain);
      return reply.code(204).send();
    },
  );

  // ---- Class Options (requireAdmin) ----

  // GET /api/admin/class-options
  app.get("/api/admin/class-options", { preHandler: requireAdmin }, async (_req, reply) => {
    const options = await classOptionsRepo.list();
    return reply.send(options);
  });

  // POST /api/admin/class-options
  app.post<{ Body: { label?: string } }>(
    "/api/admin/class-options",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { label } = req.body ?? {};
      if (!label || !label.trim()) {
        return reply.code(400).send({ error: "label is required" });
      }
      const option = await classOptionsRepo.add(label.trim());
      return reply.code(201).send(option);
    },
  );

  // DELETE /api/admin/class-options/:id
  app.delete<{ Params: { id: string } }>(
    "/api/admin/class-options/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      await classOptionsRepo.remove(req.params.id);
      return reply.code(204).send();
    },
  );

  // ---- Class Options public (requireUser, for folder form dropdown) ----

  // GET /api/class-options
  app.get("/api/class-options", { preHandler: requireUser }, async (_req, reply) => {
    const options = await classOptionsRepo.list();
    return reply.send(options);
  });
}
