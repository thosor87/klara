export interface Mailer {
  sendLoginEmail(to: string, code: string, link: string): Promise<void>;
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
  };
}

/** Dev-Fallback: schreibt die Mail in die Konsole statt sie zu versenden. */
export function createConsoleMailer(): Mailer {
  return {
    async sendLoginEmail(to, code, link) {
      console.log(`[MAIL→${to}] Code ${code}  Link ${link}`);
    },
  };
}
