export interface DigestData {
  pendingCount: number;
  openReports: number;
}

export interface Mailer {
  sendLoginEmail(to: string, code: string, link: string): Promise<void>;
  sendDigest(to: string, data: DigestData): Promise<void>;
}

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { config } from "../config.js";

/** Wrap email content in a branded KlaRa container (email-safe inline styles). */
function emailLayout(inner: string): string {
  return (
    `<!doctype html><html><body style="margin:0;background:#f3f0fb;padding:24px;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2a2440">` +
    `<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e6e0f2">` +
    `<div style="background:linear-gradient(135deg,#5b3fb0,#432d8a);padding:22px 28px">` +
    `<span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px">KlaRa</span></div>` +
    `<div style="padding:28px">${inner}</div>` +
    `<div style="padding:16px 28px;border-top:1px solid #f0ecf9;color:#a99fc4;font-size:12px">` +
    `KlaRa — der private Klassenraum. Diese Mail wurde automatisch verschickt.</div>` +
    `</div></body></html>`
  );
}

export function createSesMailer(): Mailer {
  // Statische Keys nur nutzen, wenn beide gesetzt sind; sonst die
  // AWS-Credential-Chain (AWS_PROFILE=lilapixel lokal, Vercel-Env in Prod).
  const hasStaticCreds = Boolean(config.ses.accessKeyId && config.ses.secretAccessKey);
  const client = new SESv2Client({
    region: config.ses.region,
    ...(hasStaticCreds
      ? { credentials: { accessKeyId: config.ses.accessKeyId, secretAccessKey: config.ses.secretAccessKey } }
      : {}),
  });
  return {
    async sendLoginEmail(to, code, link) {
      const mins = config.tokenTtlMinutes;
      const text =
        `Hallo!\n\n` +
        `Schön, dass du bei KlaRa vorbeischaust. Dein Anmelde-Code lautet:\n\n` +
        `   ${code}\n\n` +
        `Gib ihn in der App ein — oder öffne auf demselben Gerät einfach diesen Link:\n${link}\n\n` +
        `Der Code gilt ${mins} Minuten. Wenn du dich nicht anmelden wolltest, ignorier diese Mail einfach.\n\n` +
        `Liebe Grüße\nKlaRa`;
      const html = emailLayout(`
        <p style="margin:0 0 14px">Hallo!</p>
        <p style="margin:0 0 22px;color:#4a4560">Schön, dass du vorbeischaust. Dein Anmelde-Code lautet:</p>
        <div style="margin:0 0 24px;text-align:center">
          <div style="display:inline-block;background:#f4f1fb;border:1px solid #e6e0f2;border-radius:14px;padding:16px 28px;font-size:34px;font-weight:700;letter-spacing:8px;color:#432d8a;font-family:'SF Mono',Menlo,Consolas,monospace">${code}</div>
        </div>
        <div style="margin:0 0 24px;text-align:center">
          <a href="${link}" style="display:inline-block;background:#5b3fb0;color:#ffffff;text-decoration:none;font-weight:600;border-radius:12px;padding:13px 26px">Auf diesem Gerät anmelden</a>
        </div>
        <p style="margin:0;color:#8a82a3;font-size:13px">Der Code gilt ${mins} Minuten. Wenn du dich nicht anmelden wolltest, ignorier diese Mail einfach.</p>
      `);
      await client.send(new SendEmailCommand({
        FromEmailAddress: config.ses.fromAddress,
        Destination: { ToAddresses: [to] },
        Content: { Simple: {
          Subject: { Data: `KlaRa-Anmelde-Code: ${code}` },
          Body: { Text: { Data: text }, Html: { Data: html } },
        } },
      }));
    },

    async sendDigest(to, data) {
      const { pendingCount, openReports } = data;
      const appUrl = config.appBaseUrl;
      const parts: string[] = [];
      if (pendingCount > 0) parts.push(`${pendingCount} Foto${pendingCount === 1 ? "" : "s"} warte${pendingCount === 1 ? "t" : "n"} auf Freigabe`);
      if (openReports > 0) parts.push(`${openReports} Meldung${openReports === 1 ? "" : "en"} offen`);
      const summary = parts.join(", ");
      const text =
        `Hallo!\n\nEs gibt etwas zu tun in KlaRa: ${summary}.\n\n` +
        `Direkt zur App: ${appUrl}\n\n` +
        `Diese Mail wurde automatisch verschickt – du bekommst sie nur, wenn etwas offen ist.\n`;
      const html = emailLayout(
        `<p style="margin:0 0 14px">Hallo!</p>` +
        `<p style="margin:0 0 16px;color:#4a4560">Es gibt etwas zu tun in KlaRa:</p>` +
        `<ul style="margin:0 0 22px;padding-left:20px;color:#2a2440">${pendingCount > 0 ? `<li style="margin:0 0 6px">${pendingCount} Foto${pendingCount === 1 ? "" : "s"} warte${pendingCount === 1 ? "t" : "n"} auf Freigabe</li>` : ""}` +
        `${openReports > 0 ? `<li>${openReports} Meldung${openReports === 1 ? "" : "en"} offen</li>` : ""}</ul>` +
        `<div style="text-align:center"><a href="${appUrl}" style="display:inline-block;background:#5b3fb0;color:#ffffff;text-decoration:none;font-weight:600;border-radius:12px;padding:13px 26px">Zur Freigabe →</a></div>`,
      );
      await client.send(new SendEmailCommand({
        FromEmailAddress: config.ses.fromAddress,
        Destination: { ToAddresses: [to] },
        Content: { Simple: {
          Subject: { Data: "KlaRa: Es gibt etwas zu tun" },
          Body: { Text: { Data: text }, Html: { Data: html } },
        } },
      }));
    },
  };
}

/** Dev-Fallback: schreibt die Mail in die Konsole statt sie zu versenden. */
export function createConsoleMailer(): Mailer {
  return {
    async sendLoginEmail(to, code, link) {
      console.log(`[MAIL→${to}] Code ${code}  Link ${link}`);
    },
    async sendDigest(to, data) {
      console.log(`[DIGEST→${to}] pending=${data.pendingCount} openReports=${data.openReports}`);
    },
  };
}
