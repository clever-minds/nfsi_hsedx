import nodemailer, { Transporter } from 'nodemailer';
import { env, isProd } from '../config/env';
import { logger } from '../logger/logger';
import { getSetting, getSettingBool, getSettingInt } from '../settings/settings';

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Baca konfigurasi SMTP dari settings (diatur super admin), fallback ke env. */
async function resolveSmtp(): Promise<SmtpConfig> {
  const host = await getSetting('smtp.host', env.SMTP_HOST ?? '');
  const port = await getSettingInt('smtp.port', env.SMTP_PORT);
  const secure = await getSettingBool('smtp.secure', port === 465);
  const user = await getSetting('smtp.user', env.SMTP_USER ?? '');
  const pass = await getSetting('smtp.pass', env.SMTP_PASS ?? '');
  const from = await getSetting('smtp.from', env.EMAIL_FROM);
  return { host, port, secure, user, pass, from };
}

export async function isMailConfigured(): Promise<boolean> {
  const { host } = await resolveSmtp();
  return !!host;
}

let cachedTransport: { key: string; t: Transporter } | null = null;
function transportFor(cfg: SmtpConfig): Transporter {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}`;
  if (cachedTransport?.key === key) return cachedTransport.t;
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  cachedTransport = { key, t };
  return t;
}

/**
 * Kirim email. Bila SMTP belum dikonfigurasi (dev), TIDAK gagal — cukup log isi email
 * agar alur (mis. verifikasi email) tetap dapat diuji tanpa server SMTP nyata.
 */
export async function sendMail(input: MailInput): Promise<{ sent: boolean }> {
  const cfg = await resolveSmtp();
  if (!cfg.host) {
    logger.warn({ to: input.to, subject: input.subject }, 'SMTP is not configured, so this email was not sent (development mode). Contents:');
    if (!isProd) logger.info({ html: input.html }, '📧 (dev) isi email');
    return { sent: false };
  }
  try {
    await transportFor(cfg).sendMail({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { sent: true };
  } catch (err) {
    logger.error({ err, to: input.to }, 'Failed to send email');
    return { sent: false };
  }
}

/** Email verifikasi akun berisi tautan ke halaman FE. */
export async function sendVerificationEmail(to: string, nama: string, token: string): Promise<{ sent: boolean }> {
  const link = `${env.PUBLIC_WEB_URL.replace(/\/$/, '')}/verifikasi-email?token=${encodeURIComponent(token)}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#164031">Verifikasi Email — LMS Hub</h2>
      <p>Halo ${nama},</p>
      <p>Terima kasih telah mendaftar. Klik tombol di bawah untuk memverifikasi email Anda:</p>
      <p><a href="${link}" style="background:#164031;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verifikasi Email</a></p>
      <p style="color:#6a7a70;font-size:13px">Atau buka tautan ini: <br>${link}</p>
      <p style="color:#9aa9a1;font-size:12px">Abaikan email ini bila Anda tidak mendaftar.</p>
    </div>`;
  return sendMail({ to, subject: 'Verifikasi Email — LMS Hub', html });
}
