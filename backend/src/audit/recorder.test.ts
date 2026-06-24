import { describe, it, expect, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import type { AuditRepo } from "./repo.js";
import { createAudit } from "./recorder.js";

const reqWith = (user: unknown) => ({ user } as unknown as FastifyRequest);

describe("createAudit.record", () => {
  it("logs with actor id + email from req.user", () => {
    const log = vi.fn(async () => {});
    const audit = createAudit({ log, list: async () => [] } as AuditRepo);
    audit.record(reqWith({ id: "u1", email: "a@x.de" }), "folder.delete", "Album gelöscht");
    expect(log).toHaveBeenCalledWith({ actorId: "u1", actorEmail: "a@x.de", action: "folder.delete", summary: "Album gelöscht" });
  });

  it("falls back to system when no user", () => {
    const log = vi.fn(async () => {});
    const audit = createAudit({ log, list: async () => [] } as AuditRepo);
    audit.record(reqWith(undefined), "login", "x");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ actorId: null, actorEmail: "system" }));
  });

  it("never throws even if the repo rejects (fire-and-forget)", () => {
    const audit = createAudit({ log: async () => { throw new Error("db down"); }, list: async () => [] } as AuditRepo);
    expect(() => audit.record(reqWith({ id: "u1", email: "a@x.de" }), "x", "y")).not.toThrow();
  });
});
