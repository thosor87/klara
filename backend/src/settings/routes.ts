import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { DomainsRepo, ClassOptionsRepo, ClassOption } from "./repo.js";
import { cohortInfo } from "../classes/cohort.js";

export interface SettingsRoutesDeps {
  domainsRepo: DomainsRepo;
  classOptionsRepo: ClassOptionsRepo;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/** Public shape of a class option: stored fields + computed label/status/schoolYear. */
function toView(opt: ClassOption, now: Date) {
  const info = cohortInfo(opt.track, opt.startYear, now, opt.label);
  return {
    id: opt.id,
    track: opt.track,
    startYear: opt.startYear,
    label: info.label,
    status: info.status,
    schoolYear: info.schoolYear,
  };
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
    const now = new Date();
    const options = await classOptionsRepo.list();
    return reply.send(options.map((o) => toView(o, now)));
  });

  // POST /api/admin/class-options
  app.post<{ Body: { label?: string; track?: string; startYear?: number | null } }>(
    "/api/admin/class-options",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { label, track, startYear } = req.body ?? {};
      // A class needs either a (legacy) label or a cohort start year.
      const hasLabel = typeof label === "string" && label.trim().length > 0;
      const hasStartYear = typeof startYear === "number";
      if (!hasLabel && !hasStartYear) {
        return reply.code(400).send({ error: "label or startYear is required" });
      }
      const option = await classOptionsRepo.add({
        label: hasLabel ? label!.trim() : "",
        track: track ?? "",
        startYear: hasStartYear ? startYear! : null,
      });
      return reply.code(201).send(toView(option, new Date()));
    },
  );

  // PATCH /api/admin/class-options/:id
  app.patch<{
    Params: { id: string };
    Body: { label?: string; track?: string; startYear?: number | null };
  }>(
    "/api/admin/class-options/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { label, track, startYear } = req.body ?? {};
      const updated = await classOptionsRepo.update(req.params.id, { label, track, startYear });
      if (!updated) {
        return reply.code(404).send({ error: "not found" });
      }
      return reply.send(toView(updated, new Date()));
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
    const now = new Date();
    const options = await classOptionsRepo.list();
    return reply.send(options.map((o) => toView(o, now)));
  });
}
