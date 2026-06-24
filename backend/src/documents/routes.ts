import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import type { DocumentsRepo, DocumentRow } from "./repo.js";
import type { FoldersRepo } from "../folders/repo.js";
import type { Storage } from "../storage/s3.js";
import { type Audit, noopAudit } from "../audit/recorder.js";

export const DOCUMENT_LIMIT = 10;

export interface DocumentRoutesDeps {
  documentsRepo: DocumentsRepo;
  foldersRepo: FoldersRepo;
  storage: Storage;
  maxDocumentBytes: number;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  audit?: Audit;
}

const docKey = (id: string) => `documents/${id}`;

export function registerDocumentRoutes(app: FastifyInstance, deps: DocumentRoutesDeps): void {
  const { documentsRepo, foldersRepo, storage, maxDocumentBytes, requireUser, requireAdmin } = deps;
  const audit = deps.audit ?? noopAudit;

  async function toView(doc: DocumentRow) {
    return {
      id: doc.id,
      filename: doc.filename,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
      downloadUrl: await storage.presignGet(doc.s3Key, {
        downloadFilename: doc.filename,
        contentType: doc.contentType,
      }),
    };
  }

  // POST presign (admin) — get a PUT URL for documents/{docId}
  app.post<{ Params: { folderId: string }; Body: { contentType?: string } }>(
    "/api/admin/folders/:folderId/documents/presign",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { contentType } = req.body ?? {};
      if (!contentType) return reply.code(400).send({ error: "contentType is required" });
      const folder = await foldersRepo.findById(req.params.folderId);
      if (!folder) return reply.code(404).send({ error: "folder_not_found" });
      if ((await documentsRepo.countByFolder(req.params.folderId)) >= DOCUMENT_LIMIT) {
        return reply.code(409).send({ error: "document_limit_reached" });
      }
      const docId = randomUUID();
      const uploadUrl = await storage.presignPut(docKey(docId), contentType);
      return reply.code(200).send({ docId, uploadUrl });
    },
  );

  // POST confirm (admin) — verify upload, enforce size + limit, persist
  app.post<{ Params: { folderId: string }; Body: { docId?: string; filename?: string; contentType?: string } }>(
    "/api/admin/folders/:folderId/documents",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { docId, filename, contentType } = req.body ?? {};
      if (!docId || !filename || !contentType) {
        return reply.code(400).send({ error: "docId, filename and contentType are required" });
      }
      const folder = await foldersRepo.findById(req.params.folderId);
      if (!folder) return reply.code(404).send({ error: "folder_not_found" });

      const key = docKey(docId);
      if (!(await storage.headExists(key))) {
        return reply.code(400).send({ error: "upload_incomplete" });
      }
      const info = await storage.head(key);
      if (info && info.size > maxDocumentBytes) {
        await storage.deleteObjects([key]);
        return reply.code(413).send({ error: "document_too_large" });
      }
      // Re-check the limit at confirm time (presign + confirm aren't atomic).
      if ((await documentsRepo.countByFolder(req.params.folderId)) >= DOCUMENT_LIMIT) {
        await storage.deleteObjects([key]);
        return reply.code(409).send({ error: "document_limit_reached" });
      }
      const doc = await documentsRepo.insert({
        id: docId,
        folderId: req.params.folderId,
        filename,
        contentType,
        sizeBytes: info?.size ?? 0,
        s3Key: key,
        uploadedBy: req.user!.id,
      });
      audit.record(req, "document.add", `Dokument „${filename}" hochgeladen`);
      return reply.code(201).send(await toView(doc));
    },
  );

  // GET list (member, class-gated like photos) — with presigned download URLs
  app.get<{ Params: { folderId: string } }>(
    "/api/folders/:folderId/documents",
    { preHandler: requireUser },
    async (req, reply) => {
      const folderId = req.params.folderId;
      if (req.user!.role !== "admin") {
        const visible = await foldersRepo.isVisibleToClass(folderId, req.user!.classId);
        if (!visible) return reply.code(404).send({ error: "folder_not_found" });
      }
      const docs = await documentsRepo.listByFolder(folderId);
      return reply.send(await Promise.all(docs.map(toView)));
    },
  );

  // DELETE (admin) — remove row + S3 object
  app.delete<{ Params: { docId: string } }>(
    "/api/admin/documents/:docId",
    { preHandler: requireAdmin },
    async (req, reply) => {
      const removed = await documentsRepo.deleteById(req.params.docId);
      if (!removed) return reply.code(404).send({ error: "document_not_found" });
      await storage.deleteObjects([removed.s3Key]);
      audit.record(req, "document.delete", "Dokument gelöscht");
      return reply.code(204).send();
    },
  );
}
