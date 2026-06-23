import { randomUUID } from "crypto";
import type { Storage } from "../storage/s3.js";
import type { ItemsRepo, Item, ItemWithFolderName, ItemStatus } from "./repo.js";
import type { FoldersRepo } from "../folders/repo.js";

export class AppError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export interface ItemsServiceDeps {
  itemsRepo: ItemsRepo;
  foldersRepo: FoldersRepo;
  storage: Storage;
  /** Hard cap on uploaded video size in bytes. Defaults to 150 MB. */
  maxVideoBytes?: number;
}

export type UploadKind = "photo" | "video";

/** Who is acting, for class-based visibility gating (Plan 6). */
export interface ActingUser {
  isAdmin: boolean;
  classId: string | null;
}

export interface ItemsService {
  presignUpload(
    folderId: string,
    contentType: string,
    user: ActingUser,
    kind?: UploadKind,
  ): Promise<{ itemId: string; webUploadUrl: string; thumbUploadUrl: string }>;
  confirmUpload(
    folderId: string,
    itemId: string,
    caption: string,
    userId: string,
    user: ActingUser,
    kind?: UploadKind,
  ): Promise<Item>;
  listFolderItems(
    folderId: string,
    opts: { isAdmin: boolean; userId?: string; classId?: string | null },
  ): Promise<Array<Item & { thumbUrl: string; webUrl: string; mine: boolean }>>;
  listPending(): Promise<Array<ItemWithFolderName & { thumbUrl: string; webUrl: string }>>;
  approve(ids: string[], adminId: string): Promise<{ approved: number }>;
  reject(ids: string[]): Promise<{ rejected: number }>;
  /** Set approved items back to pending. Returns count affected. */
  unapprove(ids: string[]): Promise<{ unapproved: number }>;
  /** Delete own pending item; throws not_allowed if not found, not owned, or not pending. */
  deleteOwnPending(itemId: string, userId: string): Promise<{ deleted: boolean }>;
}

export function createItemsService(deps: ItemsServiceDeps): ItemsService {
  const { itemsRepo, foldersRepo, storage } = deps;
  const maxVideoBytes = deps.maxVideoBytes ?? 157_286_400; // 150 MB fallback

  // The "web" object key depends on the kind: photos are the final web.jpg, videos
  // keep their original upload at /source (Phase B's transcoder will produce web.mp4
  // and repoint items.s3_key). thumb.jpg is the same for both.
  const webKeyFor = (itemId: string, kind: UploadKind) =>
    kind === "video" ? `items/${itemId}/source` : `items/${itemId}/web.jpg`;

  // Non-admins must have class visibility on the folder; otherwise we 404 to
  // avoid leaking the folder's existence. Admins bypass entirely.
  async function assertVisible(folderId: string, user: ActingUser): Promise<void> {
    if (user.isAdmin) return;
    const visible = await foldersRepo.isVisibleToClass(folderId, user.classId);
    if (!visible) {
      throw new AppError("folder_not_found", "Folder not found or not visible");
    }
  }

  return {
    async presignUpload(folderId, contentType, user, kind = "photo") {
      const folder = await foldersRepo.findById(folderId);
      if (!folder || !folder.enabled) {
        throw new AppError("folder_not_found", "Folder not found or not enabled");
      }
      await assertVisible(folderId, user);

      const itemId = randomUUID();
      const webKey = webKeyFor(itemId, kind);
      const thumbKey = `items/${itemId}/thumb.jpg`;

      // Video web object keeps its own content type; the thumbnail is always a jpeg.
      const webUploadUrl = await storage.presignPut(webKey, contentType);
      const thumbUploadUrl = await storage.presignPut(thumbKey, "image/jpeg");

      return { itemId, webUploadUrl, thumbUploadUrl };
    },

    async confirmUpload(folderId, itemId, caption, userId, user, kind = "photo") {
      // Verify folder exists and is enabled
      const folder = await foldersRepo.findById(folderId);
      if (!folder || !folder.enabled) {
        throw new AppError("folder_not_found", "Folder not found or not enabled");
      }
      await assertVisible(folderId, user);

      const webKey = webKeyFor(itemId, kind);
      const thumbKey = `items/${itemId}/thumb.jpg`;

      const [webExists, thumbExists] = await Promise.all([
        storage.headExists(webKey),
        storage.headExists(thumbKey),
      ]);

      if (!webExists || !thumbExists) {
        throw new AppError("upload_incomplete", "Both objects must be uploaded to S3 first");
      }

      // Server-side hard size limit for videos. A presigned PUT can't enforce size,
      // so we check the uploaded object and reject (deleting it) if it's too large.
      if (kind === "video") {
        const info = await storage.head(webKey);
        if (info && info.size > maxVideoBytes) {
          await storage.deleteObjects([webKey, thumbKey]);
          throw new AppError("video_too_large", "Video exceeds the maximum allowed size");
        }
      }

      const item = await itemsRepo.insertPending({
        id: itemId,
        folderId,
        s3Key: webKey,
        thumbKey,
        caption: caption ?? "",
        uploadedBy: userId,
        type: kind,
      });

      if (!item) {
        throw new AppError("already_confirmed", "Item has already been confirmed");
      }

      return item;
    },

    async listFolderItems(folderId, { isAdmin, userId, classId }) {
      if (!isAdmin) {
        const folder = await foldersRepo.findById(folderId);
        if (!folder || !folder.enabled) {
          throw new AppError("folder_not_found", "Folder not found or not enabled");
        }
        await assertVisible(folderId, { isAdmin, classId: classId ?? null });
      }

      const items = isAdmin
        ? await itemsRepo.listByFolder(folderId, ["pending", "approved", "trashed"])
        : await itemsRepo.listForMember(folderId, userId ?? "");

      return Promise.all(
        items.map(async (item) => {
          const [thumbUrl, webUrl] = await Promise.all([
            storage.presignGet(item.thumbKey),
            storage.presignGet(item.s3Key),
          ]);
          const mine = item.uploadedBy === (userId ?? null);
          return { ...item, thumbUrl, webUrl, mine };
        }),
      );
    },

    async listPending() {
      const items = await itemsRepo.listPending();

      return Promise.all(
        items.map(async (item) => {
          const [thumbUrl, webUrl] = await Promise.all([
            storage.presignGet(item.thumbKey),
            storage.presignGet(item.s3Key),
          ]);
          return { ...item, thumbUrl, webUrl };
        }),
      );
    },

    async approve(ids, adminId) {
      const approved = await itemsRepo.setStatusApproved(ids, adminId);
      return { approved };
    },

    async reject(ids) {
      const rejected = await itemsRepo.setStatusTrashed(ids);
      return { rejected };
    },

    async unapprove(ids) {
      const unapproved = await itemsRepo.setStatusPending(ids);
      return { unapproved };
    },

    async deleteOwnPending(itemId, userId) {
      const item = await itemsRepo.findById(itemId);
      if (!item || item.uploadedBy !== userId || item.status !== "pending") {
        throw new AppError("not_allowed", "Item not found, not owned by user, or not pending");
      }
      await storage.deleteObjects([item.s3Key, item.thumbKey]);
      await itemsRepo.deleteById(itemId);
      return { deleted: true };
    },
  };
}
