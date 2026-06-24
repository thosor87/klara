import "dotenv/config";

export function parseAllowedDomains(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  allowedDomains: parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS),
  initialAdminEmail: (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase() || null,
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret",
  sessionMaxDays: Number(process.env.SESSION_MAX_DAYS ?? 30),
  tokenTtlMinutes: Number(process.env.LOGIN_TOKEN_TTL_MINUTES ?? 15),
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  // 'console' (Dev: Mail in die Konsole) oder 'ses' (echter Versand).
  // Default: in Produktion 'ses', sonst 'console'.
  mailTransport:
    (process.env.MAIL_TRANSPORT ?? "").toLowerCase() ||
    ((process.env.NODE_ENV ?? "development") === "production" ? "ses" : "console"),
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "eu-central-1",
  ses: {
    region: process.env.SES_REGION ?? "eu-central-1",
    fromAddress: process.env.SES_FROM_ADDRESS ?? "",
    // Leer lassen, wenn die AWS-Credential-Chain genutzt wird (z.B.
    // AWS_PROFILE=lilapixel lokal oder Vercel-Env in Produktion).
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
  cronSecret: process.env.CRON_SECRET ?? "",
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30),
  // Hard server-side cap on uploaded video size (default 150 MB). Enforced in confirmUpload.
  maxVideoBytes: Number(process.env.MAX_VIDEO_BYTES ?? 157_286_400),
  // Hard server-side cap on an album document (default 25 MB). Max 10 docs per album.
  maxDocumentBytes: Number(process.env.MAX_DOCUMENT_BYTES ?? 26_214_400),
};

export { required };
