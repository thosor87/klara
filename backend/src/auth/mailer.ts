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
      const text =
        `Hallo!\n\nDein Anmelde-Code für KlaRa lautet: ${code}\n\n` +
        `Oder klick einfach diesen Link auf demselben Gerät:\n${link}\n\n` +
        `Der Code gilt ${config.tokenTtlMinutes} Minuten. ` +
        `Wenn du das nicht warst, ignorier diese Mail einfach.\n`;
      const html =
        `<p>Hallo!</p><p>Dein Anmelde-Code für <b>KlaRa</b> lautet:</p>` +
        `<p style="font-size:28px;letter-spacing:4px;"><b>${code}</b></p>` +
        `<p>Oder <a href="${link}">hier klicken</a> (gleiches Gerät).</p>` +
        `<p style="color:#888">Gilt ${config.tokenTtlMinutes} Minuten.</p>`;
      await client.send(new SendEmailCommand({
        FromEmailAddress: config.ses.fromAddress,
        Destination: { ToAddresses: [to] },
        Content: { Simple: {
          Subject: { Data: "Dein KlaRa-Anmelde-Code" },
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
      const html =
        `<p>Hallo!</p>` +
        `<p>Es gibt etwas zu tun in <b>KlaRa</b>:</p>` +
        `<ul>${pendingCount > 0 ? `<li>${pendingCount} Foto${pendingCount === 1 ? "" : "s"} warte${pendingCount === 1 ? "t" : "n"} auf Freigabe</li>` : ""}` +
        `${openReports > 0 ? `<li>${openReports} Meldung${openReports === 1 ? "" : "en"} offen</li>` : ""}</ul>` +
        `<p><a href="${appUrl}">Direkt zur App →</a></p>` +
        `<p style="color:#888;font-size:12px">Diese Mail wurde automatisch verschickt – du bekommst sie nur, wenn etwas offen ist.</p>`;
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
