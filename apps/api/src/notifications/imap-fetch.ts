/** Read-only IMAP fetch shared by the lead inbox and Chairman Mail (Gmail: SNI + system CAs, app-password spaces stripped). */
export function imapCredentials() {
  const user = (process.env.IMAP_USER || process.env.SMTP_USER || '').trim();
  const password = (process.env.IMAP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  return user && password && !user.startsWith('your_') ? { user, password } : null;
}

function trustedCAs(): string[] | undefined {
  const tls = require('tls');
  if (typeof tls.getCACertificates !== 'function') return undefined;
  try { return [...new Set<string>([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]; } catch { return undefined; }
}

/** Parsed emails (mailparser) matching an IMAP search, newest `max`, INBOX opened read-only. */
export function fetchMail(criteria: any[], max = 30): Promise<any[]> {
  const creds = imapCredentials();
  if (!creds) return Promise.reject(new Error('IMAP credentials not set (SMTP_USER / SMTP_PASS)'));
  const Imap = require('imap');
  const { simpleParser } = require('mailparser');
  const host = process.env.IMAP_HOST || 'imap.gmail.com';
  const imap = new Imap({
    user: creds.user, password: creds.password, host, port: Number(process.env.IMAP_PORT ?? 993), tls: true,
    tlsOptions: { servername: host, ca: trustedCAs() }, connTimeout: 30_000, authTimeout: 15_000,
  });
  return new Promise((resolve, reject) => {
    const raws: Promise<any>[] = [];
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try { imap.end(); } catch { /* ignore */ }
      if (err) reject(err); else Promise.all(raws).then(resolve, reject);
    };
    imap.once('error', (err: Error) => done(err));
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err: Error) => {
        if (err) return done(err);
        imap.search(criteria, (err: Error, uids: number[]) => {
          if (err) return done(err);
          if (!uids?.length) return done();
          const f = imap.fetch(uids.slice(-max), { bodies: '' });
          f.on('message', (msg: any) => msg.on('body', (stream: any) => raws.push(simpleParser(stream))));
          f.once('error', (e: Error) => done(e));
          f.once('end', () => done());
        });
      });
    });
    imap.connect();
  });
}
