import type { FastifyRequest } from "fastify";
import type { AuditRepo } from "./repo.js";

export interface Audit {
  /** Fire-and-forget: records who (req.user) did `action` with a human `summary`. Never throws. */
  record(req: FastifyRequest, action: string, summary: string): void;
}

export function createAudit(repo: AuditRepo): Audit {
  return {
    record(req, action, summary) {
      const actorId = req.user?.id ?? null;
      const actorEmail = req.user?.email ?? "system";
      // Intentionally not awaited — auditing must never delay or break the action.
      repo.log({ actorId, actorEmail, action, summary }).catch((err) => {
        console.warn("audit log failed:", action, err);
      });
    },
  };
}

/** No-op audit for tests / contexts where logging isn't wired. */
export const noopAudit: Audit = { record() { /* no-op */ } };
