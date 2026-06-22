import type { FastifyInstance, FastifyReply } from "fastify";
import type { User } from "../types.js";
import type { AuthService } from "./service.js";
import { getCurrentUser } from "./guard.js";

const COOKIE = "klara_session";

export interface AuthRoutesDeps {
  service: AuthService;
  findUserById: (id: string) => Promise<User | null>;
  sessionMaxDays: number;
  isProd: boolean;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { service, findUserById, sessionMaxDays, isProd } = deps;

  function setSession(reply: FastifyReply, userId: string) {
    reply.setCookie(COOKIE, userId, {
      path: "/", httpOnly: true, sameSite: "lax", secure: isProd, signed: true,
      maxAge: sessionMaxDays * 24 * 60 * 60,
    });
  }

  app.post<{ Body: { email?: string } }>("/api/auth/request", async (req, reply) => {
    const email = req.body?.email;
    if (email) await service.requestLogin(email);
    return reply.send({ ok: true }); // immer generisch, kein Enumeration-Leak
  });

  app.post<{ Body: { email?: string; code?: string } }>("/api/auth/verify", async (req, reply) => {
    const { email, code } = req.body ?? {};
    if (!email || !code) return reply.code(400).send({ error: "missing" });
    const user = await service.verifyCode(email, code);
    if (!user) return reply.code(401).send({ error: "invalid" });
    setSession(reply, user.id);
    return reply.send({ user });
  });

  app.get<{ Querystring: { token?: string } }>("/api/auth/link", async (req, reply) => {
    const token = req.query.token;
    const user = token ? await service.verifyLink(token) : null;
    if (!user) return reply.redirect("/?login=fehlgeschlagen");
    setSession(reply, user.id);
    return reply.redirect("/");
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.send({ ok: true });
  });

  app.get("/api/me", async (req, reply) => {
    const user = await getCurrentUser(req, findUserById);
    if (!user) return reply.code(401).send({ error: "unauthenticated" });
    return reply.send({ user });
  });
}
