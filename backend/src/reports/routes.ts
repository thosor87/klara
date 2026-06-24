import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ReportsService } from "./service.js";
import { AppError } from "./service.js";
import { type Audit, noopAudit } from "../audit/recorder.js";

export interface ReportRoutesDeps {
  reportsService: ReportsService;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  audit?: Audit;
}

export function registerReportRoutes(app: FastifyInstance, deps: ReportRoutesDeps): void {
  const { reportsService, requireUser, requireAdmin } = deps;
  const audit = deps.audit ?? noopAudit;

  // POST /api/items/:itemId/reports — member reports a photo
  app.post<{ Params: { itemId: string }; Body: { reason?: string } }>(
    "/api/items/:itemId/reports",
    { preHandler: requireUser },
    async (req, reply) => {
      const { reason } = req.body ?? {};
      if (!reason) {
        return reply.code(400).send({ error: "reason is required" });
      }
      try {
        const result = await reportsService.report(req.params.itemId, reason, req.user!.id);
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof AppError && err.code === "item_not_found") {
          return reply.code(404).send({ error: err.code });
        }
        throw err;
      }
    },
  );

  // GET /api/admin/reports — list open + answered reports (admin only)
  app.get(
    "/api/admin/reports",
    { preHandler: requireAdmin },
    async (_req, reply) => {
      const reports = await reportsService.listForAdmin();
      return reply.send(reports);
    },
  );

  // PATCH /api/admin/reports/:id — ignore / answer / delete a report (admin only)
  app.patch<{
    Params: { id: string };
    Body: { action?: "ignore" | "answer" | "delete"; response?: string };
  }>(
    "/api/admin/reports/:id",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { action, response } = req.body ?? {};
      if (!action) {
        return reply.code(400).send({ error: "action is required" });
      }
      try {
        if (action === "ignore") {
          const result = await reportsService.ignore(req.params.id);
          audit.record(req, "report.ignore", "Meldung ignoriert");
          return reply.send(result);
        }
        if (action === "answer") {
          if (!response) {
            return reply.code(400).send({ error: "response is required for action=answer" });
          }
          const result = await reportsService.answer(req.params.id, response);
          return reply.send(result);
        }
        if (action === "delete") {
          const result = await reportsService.delete(req.params.id);
          audit.record(req, "report.delete", "Gemeldetes Foto entfernt (→ Papierkorb)");
          return reply.send(result);
        }
        return reply.code(400).send({ error: "unknown action" });
      } catch (err) {
        if (err instanceof AppError && err.code === "report_not_found") {
          return reply.code(404).send({ error: err.code });
        }
        throw err;
      }
    },
  );
}
