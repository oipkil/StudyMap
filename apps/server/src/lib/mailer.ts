import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'localhost';
const port = parseInt(process.env.SMTP_PORT || '1025', 10);
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';

export const mailer = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: user && pass ? { user, pass } : undefined,
});

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const from = process.env.EMAIL_FROM || '"SSG Sinh Viên" <no-reply@ssg.edu.vn>';
  try {
    const info = await mailer.sendMail({
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>?/gm, ''),
    });
    console.log(`📧 Đã gửi email tới ${to} (Message ID: ${info.messageId})`);
    return info;
  } catch (error) {
    console.error(`❌ Gửi email tới ${to} thất bại:`, error);
    throw error;
  }
}
