import type { FastifyRequest, FastifyReply } from "fastify";
import type { User } from "../types.js";

const COOKIE = "klara_session";

export async function getCurrentUser(
  req: FastifyRequest,
  findUserById: (id: string) => Promise<User | null>,
): Promise<User | null> {
  const raw = req.cookies[COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const user = await findUserById(unsigned.value);
  if (!user || user.status !== "active") return null;
  return user;
}

export function makeGuards(findUserById: (id: string) => Promise<User | null>) {
  async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await getCurrentUser(req, findUserById);
    if (!user) {
      await reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    req.user = user;
  }

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireUser(req, reply);
    if (reply.sent) return;
    const user = req.user!;
    if (user.role !== "admin") {
      await reply.code(403).send({ error: "forbidden" });
    }
  }

  return { requireUser, requireAdmin };
}
