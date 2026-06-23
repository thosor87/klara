import type { ReportsRepo, ReportWithDetails } from "./repo.js";
import type { ItemsRepo } from "../items/repo.js";
import type { Storage } from "../storage/s3.js";
import { AppError } from "../items/service.js";

export { AppError };

export interface ReportsServiceDeps {
  reportsRepo: ReportsRepo;
  itemsRepo: ItemsRepo;
  storage: Storage;
}

export interface ReportAdminItem {
  id: string;
  itemId: string;
  reason: string;
  status: string;
  response: string;
  createdAt: string;
  folderName: string;
  reportedByEmail: string | null;
  thumbUrl: string;
  webUrl: string;
}

export interface ReportsService {
  report(itemId: string, reason: string, userId: string | null): Promise<{ ok: true }>;
  listForAdmin(): Promise<ReportAdminItem[]>;
  ignore(reportId: string): Promise<{ ok: true }>;
  answer(reportId: string, response: string): Promise<{ ok: true }>;
  delete(reportId: string): Promise<{ ok: true }>;
}

export function createReportsService(deps: ReportsServiceDeps): ReportsService {
  const { reportsRepo, itemsRepo, storage } = deps;

  return {
    async report(itemId, reason, userId) {
      const item = await itemsRepo.findById(itemId);
      if (!item || item.status !== "approved") {
        throw new AppError("item_not_found", "Item not found or not approved");
      }
      await reportsRepo.create({ itemId, reason, reportedBy: userId });
      return { ok: true };
    },

    async listForAdmin() {
      const reports = await reportsRepo.listForAdmin();
      return Promise.all(
        reports.map(async (r: ReportWithDetails) => {
          const [thumbUrl, webUrl] = await Promise.all([
            storage.presignGet(r.itemThumbKey),
            storage.presignGet(r.itemS3Key),
          ]);
          return {
            id: r.id,
            itemId: r.itemId,
            reason: r.reason,
            status: r.status,
            response: r.response,
            createdAt: r.createdAt,
            folderName: r.folderName,
            reportedByEmail: r.reportedByEmail,
            thumbUrl,
            webUrl,
          };
        }),
      );
    },

    async ignore(reportId) {
      const report = await reportsRepo.findById(reportId);
      if (!report) throw new AppError("report_not_found", "Report not found");
      await reportsRepo.setIgnored(reportId);
      return { ok: true };
    },

    async answer(reportId, response) {
      const report = await reportsRepo.findById(reportId);
      if (!report) throw new AppError("report_not_found", "Report not found");
      await reportsRepo.setAnswered(reportId, response);
      return { ok: true };
    },

    async delete(reportId) {
      const report = await reportsRepo.findById(reportId);
      if (!report) throw new AppError("report_not_found", "Report not found");
      // Trash both the report and its item (so the photo lands in the Papierkorb)
      await Promise.all([
        reportsRepo.setTrashed(reportId),
        itemsRepo.trashItemById(report.itemId),
      ]);
      return { ok: true };
    },
  };
}
