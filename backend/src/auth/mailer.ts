export interface Mailer {
  sendLoginEmail(to: string, code: string, link: string): Promise<void>;
}
