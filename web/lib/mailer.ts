import nodemailer from "nodemailer";

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

let cached: nodemailer.Transporter | null = null;
function transport(): nodemailer.Transporter {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return cached;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function send(msg: nodemailer.SendMailOptions) {
  const cs = process.env.SES_CONFIGURATION_SET;
  if (!cs) return transport().sendMail(msg);
  return transport().sendMail({
    ...msg,
    headers: { ...(msg.headers as Record<string, string> | undefined), "X-SES-CONFIGURATION-SET": cs },
  });
}

function fromHeader(orgName?: string): string {
  const base = process.env.SMTP_FROM ?? "Let's Seal <no-reply@example.com>";
  if (!orgName) return base;
  const addr = base.match(/<([^>]+)>/)?.[1] ?? base;
  return `"${orgName.replace(/["\r\n]/g, "")} via Let's Seal" <${addr}>`;
}

// Send a signing invite. Returns true if actually sent.
export async function sendSigningInvite(opts: {
  to: string;
  signerName: string;
  envelopeTitle: string;
  orgName: string;
  brandColor?: string;
  replyTo?: string;
  link: string;
  message?: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : "#1a73e8";
  // Personal note from the sender, rendered as a quoted block (escaped, line breaks kept).
  const note = opts.message
    ? `<blockquote style="margin:18px 0;padding:10px 16px;border-left:3px solid ${brand};background:#f6f8fc;font-size:14px;color:#3a4353;white-space:pre-wrap">${esc(opts.message)}</blockquote>`
    : "";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#172033">
      <p style="font-size:15px">Hi ${esc(opts.signerName || "there")},</p>
      <p style="font-size:15px"><b>${esc(opts.orgName)}</b> has asked you to review and sign
        <b>${esc(opts.envelopeTitle)}</b>.</p>
      ${note}
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Review &amp; sign
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">This link is unique to you — please don't forward it.
        Signing it records a tamper-evident, independently timestamped proof that you signed.</p>
      <p style="font-size:12px;color:#8a92a0">If you weren't expecting this, you can ignore the email.</p>
    </div>`;
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `${opts.orgName}: please sign "${opts.envelopeTitle}"`,
    html,
    text: `${opts.orgName} has asked you to sign "${opts.envelopeTitle}".\n${opts.message ? `\n"${opts.message}"\n` : ""}\nReview & sign (unique to you — please don't forward):\n${opts.link}\n`,
  });
  return true;
}

export async function sendEnvelopeCompleted(opts: {
  to: string;
  signerName: string;
  envelopeTitle: string;
  orgName: string;
  brandColor?: string;
  replyTo?: string;
  downloadUrl: string;
  proofUrl: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : "#2563eb";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#172033">
      <p style="font-size:15px">Hi ${esc(opts.signerName || "there")},</p>
      <p style="font-size:15px">All parties have signed <b>${esc(opts.envelopeTitle)}</b>. Your completed,
        sealed copy is ready.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.downloadUrl)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Download completed document
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">This copy is cryptographically sealed and independently timestamped.
        Anyone can confirm it's genuine and unaltered — <a href="${esc(opts.proofUrl)}" style="color:${brand}">view the proof</a>.</p>
      <p style="font-size:12px;color:#8a92a0">This link is unique to you — please don't forward it.</p>
    </div>`;
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `Completed: "${opts.envelopeTitle}" — all parties have signed`,
    html,
    text: `All parties have signed "${opts.envelopeTitle}". Your completed, sealed copy is ready.\n\nDownload (unique to you — please don't forward):\n${opts.downloadUrl}\n\nVerify it's genuine & unaltered (anyone can, no account):\n${opts.proofUrl}\n`,
  });
  return true;
}

// Notify the sender (org owner/admin) that everyone has signed — DocuSign also
// pings the sender on completion. Links to the proof page, where the issuer can
// review the full record and download the sealed document from the app.
export async function sendEnvelopeCompletedSender(opts: {
  to: string;
  name: string;
  envelopeTitle: string;
  orgName: string;
  brandColor?: string;
  replyTo?: string;
  proofUrl: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : "#2563eb";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#172033">
      <p style="font-size:15px">Hi ${esc(opts.name || "there")},</p>
      <p style="font-size:15px">All parties have signed <b>${esc(opts.envelopeTitle)}</b>. It's now sealed,
        anchored, and complete.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.proofUrl)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Open completed document
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">Every signer has been sent their own copy. This is a permanent,
        independently timestamped record that anyone can verify — no account needed.</p>
    </div>`;
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `Completed: "${opts.envelopeTitle}" — all parties have signed`,
    html,
    text: `All parties have signed "${opts.envelopeTitle}". It's now sealed, anchored, and complete.\n\nOpen the completed document:\n${opts.proofUrl}\n\nEvery signer has been sent their own copy.\n`,
  });
  return true;
}

export async function sendCredentialIssued(opts: {
  to: string;
  recipientName: string;
  credType: string;
  title: string;
  orgName: string;
  brandColor?: string;
  replyTo?: string;
  link: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : "#1a73e8";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#172033">
      <p style="font-size:15px">Hi ${esc(opts.recipientName || "there")},</p>
      <p style="font-size:15px"><b>${esc(opts.orgName)}</b> has issued you a ${esc(opts.credType.toLowerCase())}:
        <b>${esc(opts.title)}</b>.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          View &amp; verify your credential
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">Anyone can verify this credential from that link — it's a permanent,
        independently timestamped record that it was issued by ${esc(opts.orgName)} and hasn't been altered.</p>
    </div>`;
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `${opts.orgName} issued you: ${opts.title}`,
    html,
    text: `${opts.orgName} has issued you a ${opts.credType.toLowerCase()}: "${opts.title}".\n\nView & verify (anyone can verify from this link):\n${opts.link}\n`,
  });
  return true;
}

// Platform account email (from Let's Seal itself, not an org): confirm a new
// signup owns the address before they can send on anyone's behalf.
export async function sendVerificationEmail(opts: { to: string; name?: string; link: string }): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = "#2563eb";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#172033">
      <p style="font-size:15px">Hi ${esc(opts.name || "there")},</p>
      <p style="font-size:15px">Confirm your email to finish setting up your <b>Let's Seal</b> account.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Verify my email
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
    </div>`;
  await send({
    from: fromHeader(), // "Let's Seal <no-reply@…>" — platform sender, no org
    to: opts.to,
    subject: "Verify your email · Let's Seal",
    html,
    text: `Confirm your email to finish setting up your Let's Seal account:\n${opts.link}\n\nThis link expires in 24 hours.`,
  });
  return true;
}
