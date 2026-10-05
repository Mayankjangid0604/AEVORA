import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) {
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      process.env[k] = v;
    }
  }
}
loadEnv(path.resolve(__dirname, '../../../.env'));
loadEnv(path.resolve(__dirname, '../.env'));

async function probeSmtp() {
  console.log('Testing SMTP connection...');
  console.log('Host:', process.env.SMTP_HOST);
  console.log('Port:', process.env.SMTP_PORT);
  console.log('User present:', !!process.env.SMTP_USER);
  console.log('Pass present:', !!process.env.SMTP_PASS, 'length:', process.env.SMTP_PASS?.length);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''),
    },
  });

  try {
    await transporter.verify();
    console.log('SMTP VERIFICATION SUCCESS: Transporter is ready to deliver messages.');
  } catch (err: any) {
    console.error('SMTP VERIFICATION FAILED:', err.message);
  }
}

probeSmtp().catch(console.error);
