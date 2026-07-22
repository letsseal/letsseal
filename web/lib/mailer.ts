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
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

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

const FONT = "system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

// The Let's Seal lockup for the footer: the real scalloped seal mark (the same
// one in the site nav) as a PNG, next to the wordmark. A PNG, not inline SVG,
// because Gmail strips SVG; served over HTTPS so it proxies cleanly.
function markHtml(size = 20): string {
  const site = process.env.APP_URL ?? "https://letsseal.org";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;vertical-align:middle"><tr>
      <td style="vertical-align:middle"><img src="${site}/brand/mark.png" width="${size}" height="${size}" alt="LetsSeal" style="display:block;width:${size}px;height:${size}px" /></td>
      <td style="padding-left:6px;font:700 ${Math.round(size * 0.85)}px ${FONT};letter-spacing:-0.5px;color:#172033;vertical-align:middle">LetsSeal</td>
    </tr></table>`;
}

// Who sent this, and is their identity proven? Recipients decide whether to trust
// a signing request from the inbox, before they click anything, so the issuer's
// verified status has to be visible right there rather than one link away.
// Verified means the brand proved DNS control of the domain (Tenant.verifiedDomain).
type Issuer = { name: string; verifiedDomain?: string | null; logoUrl?: string | null };

function issuerHtml(issuer: Issuer): string {
  const badge = issuer.verifiedDomain
    ? `<span style="background:#2563eb;color:#ffffff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap">&#10003; Verified</span>
       <span style="color:#5b6472;font-size:12px">${esc(issuer.verifiedDomain)}</span>`
    : `<span style="background:#eef0f4;color:#5b6472;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap">Unverified sender</span>`;
  // The org's own uploaded logo, when it has one. Served over HTTPS (see
  // /api/orgs/[slug]/logo) because inline data: URIs do not render in Gmail.
  // A table cell, not a flex div, so it aligns in Outlook too.
  // The three text rows use explicit line-heights so the stack is a known height
  // (about 58px) in every client, not just whatever a given renderer's default
  // line-height produces. The logo is sized to that and its cell is bottom-aligned,
  // so the logo's base lands on the verified pill's baseline even if a client packs
  // the text a pixel tighter than expected.
  const logoCell = issuer.logoUrl
    ? `<td style="width:70px;vertical-align:bottom;padding-right:12px">
         <img src="${esc(issuer.logoUrl)}" width="58" height="58" alt="${esc(issuer.name)}"
              style="width:58px;height:58px;border-radius:10px;border:1px solid #e4e7ec;background:#ffffff;display:block" />
       </td>`
    : "";
  return `<div style="border:1px solid #e4e7ec;border-radius:10px;padding:12px 14px;margin:0 0 22px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${logoCell}
        <td style="vertical-align:bottom">
          <div style="font-size:11px;line-height:13px;text-transform:uppercase;letter-spacing:0.6px;color:#8a92a0;margin:0 0 6px">Sent by</div>
          <div style="font-size:15px;line-height:18px;font-weight:600;color:#172033;margin:0 0 8px">${esc(issuer.name)}</div>
          <div style="line-height:19px">${badge}</div>
        </td>
      </tr></table>
    </div>`;
}

// Wrap a message body in the standard frame: issuer identity at the top (so the
// verified status is above the fold) and the Let's Seal mark in the footer.
function shell(body: string, issuer?: Issuer): string {
  const site = process.env.APP_URL ?? "https://letsseal.org";
  return `<div style="font-family:${FONT};max-width:520px;margin:0 auto;color:#172033">
      ${issuer ? issuerHtml(issuer) : ""}
      ${body}
      <div style="border-top:1px solid #e4e7ec;margin-top:32px;padding-top:16px">
        <a href="${esc(site)}" style="text-decoration:none">${markHtml()}</a>
        <p style="font-size:12px;color:#8a92a0;margin:10px 0 0">Cryptographically sealed and independently timestamped.
          Anyone can verify a Let's Seal document for free, no account needed.</p>
      </div>
    </div>`;
}

// The same identity line for the plain-text alternative.
function issuerText(name: string, verifiedDomain?: string | null): string {
  return verifiedDomain
    ? `Sent by ${name} (VERIFIED: ${verifiedDomain})\n\n`
    : `Sent by ${name} (unverified sender)\n\n`;
}

const FOOTER_TEXT = "\n--\nLetsSeal. Cryptographically sealed and independently timestamped.\nAnyone can verify a Let's Seal document for free, no account needed.\n";

// Send a signing invite. Returns true if actually sent.
export async function sendSigningInvite(opts: {
  to: string;
  signerName: string;
  envelopeTitle: string;
  orgName: string;
  verifiedDomain?: string | null;
  logoUrl?: string | null;
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
  const html = shell(`
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
      <p style="font-size:13px;color:#5b6472">This link is unique to you, please don't forward it.
        Signing it records a tamper-evident, independently timestamped proof that you signed.</p>
      <p style="font-size:12px;color:#8a92a0">If you weren't expecting this, you can ignore the email.</p>`,
    { name: opts.orgName, verifiedDomain: opts.verifiedDomain, logoUrl: opts.logoUrl });
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `${opts.orgName}: please sign "${opts.envelopeTitle}"`,
    html,
    text: `${issuerText(opts.orgName, opts.verifiedDomain)}${opts.orgName} has asked you to sign "${opts.envelopeTitle}".\n${opts.message ? `\n"${opts.message}"\n` : ""}\nReview & sign (unique to you, please don't forward):\n${opts.link}\n${FOOTER_TEXT}`,
  });
  return true;
}

export async function sendEnvelopeCompleted(opts: {
  to: string;
  signerName: string;
  envelopeTitle: string;
  orgName: string;
  verifiedDomain?: string | null;
  logoUrl?: string | null;
  brandColor?: string;
  replyTo?: string;
  downloadUrl: string;
  proofUrl: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : "#2563eb";
  const html = shell(`
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
        Anyone can confirm it's genuine and unaltered, <a href="${esc(opts.proofUrl)}" style="color:${brand}">view the proof</a>.</p>
      <p style="font-size:12px;color:#8a92a0">This link is unique to you, please don't forward it.</p>`,
    { name: opts.orgName, verifiedDomain: opts.verifiedDomain, logoUrl: opts.logoUrl });
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `Completed: "${opts.envelopeTitle}" — all parties have signed`,
    html,
    text: `${issuerText(opts.orgName, opts.verifiedDomain)}All parties have signed "${opts.envelopeTitle}". Your completed, sealed copy is ready.\n\nDownload (unique to you, please don't forward):\n${opts.downloadUrl}\n\nVerify it's genuine & unaltered (anyone can, free):\n${opts.proofUrl}\n${FOOTER_TEXT}`,
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
  const html = shell(`
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
        independently timestamped record that anyone can verify, free.</p>`);
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `Completed: "${opts.envelopeTitle}" — all parties have signed`,
    html,
    text: `All parties have signed "${opts.envelopeTitle}". It's now sealed, anchored, and complete.\n\nOpen the completed document:\n${opts.proofUrl}\n\nEvery signer has been sent their own copy.\n${FOOTER_TEXT}`,
  });
  return true;
}

export async function sendCredentialIssued(opts: {
  to: string;
  recipientName: string;
  credType: string;
  title: string;
  orgName: string;
  verifiedDomain?: string | null;
  logoUrl?: string | null;
  brandColor?: string;
  replyTo?: string;
  link: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : "#1a73e8";
  const html = shell(`
      <p style="font-size:15px">Hi ${esc(opts.recipientName || "there")},</p>
      <p style="font-size:15px"><b>${esc(opts.orgName)}</b> has issued you a ${esc(opts.credType.toLowerCase())}:
        <b>${esc(opts.title)}</b>.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          View &amp; verify your credential
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">Anyone can verify this credential from that link. It's a permanent,
        independently timestamped record that it was issued by ${esc(opts.orgName)} and hasn't been altered.</p>`,
    { name: opts.orgName, verifiedDomain: opts.verifiedDomain, logoUrl: opts.logoUrl });
  await send({
    from: fromHeader(opts.orgName),
    replyTo: opts.replyTo || undefined,
    to: opts.to,
    subject: `${opts.orgName} issued you: ${opts.title}`,
    html,
    text: `${issuerText(opts.orgName, opts.verifiedDomain)}${opts.orgName} has issued you a ${opts.credType.toLowerCase()}: "${opts.title}".\n\nView & verify (anyone can verify from this link):\n${opts.link}\n${FOOTER_TEXT}`,
  });
  return true;
}

// Platform account email (from Let's Seal itself, not an org): confirm a new
// signup owns the address before they can send on anyone's behalf.
export async function sendVerificationEmail(opts: { to: string; name?: string; link: string }): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = "#2563eb";
  const html = shell(`
      <p style="font-size:15px">Hi ${esc(opts.name || "there")},</p>
      <p style="font-size:15px">Confirm your email to finish setting up your <b>Let's Seal</b> account.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Verify my email
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
`);
  await send({
    from: fromHeader(), // "Let's Seal <no-reply@…>" — platform sender, no org
    to: opts.to,
    subject: "Verify your email · Let's Seal",
    html,
    text: `Confirm your email to finish setting up your Let's Seal account:\n${opts.link}\n\nThis link expires in 24 hours.`,
  });
  return true;
}

export async function sendDomainVerification(opts: {
  to: string; domain: string; orgName: string; link: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = "#2563eb";
  const html = shell(`
      <p style="font-size:15px">Someone is verifying that <b>${esc(opts.orgName)}</b> controls
        <b>${esc(opts.domain)}</b> on <b>Let's Seal</b>, so that documents it seals can carry a
        verified issuer identity.</p>
      <p style="font-size:15px">If that's you, confirm control of <b>${esc(opts.domain)}</b>:</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Verify ${esc(opts.domain)}
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">This link expires in 24 hours. If you weren't expecting this, ignore this email — nothing changes and no one gains access to your domain.</p>
`);
  await send({
    from: fromHeader(), // platform sender — this is a Let's Seal system email, not org-sending
    to: opts.to,
    subject: `Verify ${opts.domain} · Let's Seal`,
    html,
    text: `Confirm that ${opts.orgName} controls ${opts.domain} on Let's Seal:\n${opts.link}\n\nThis link expires in 24 hours. If you weren't expecting this, ignore this email.`,
  });
  return true;
}

// Invite a coworker to a Let's Seal account (or a specific entity within it).
export async function sendAccountInvitation(opts: {
  to: string; accountName: string; inviterName: string; roleLabel: string; link: string;
}): Promise<boolean> {
  if (!isMailConfigured()) return false;
  const brand = "#2563eb";
  const html = shell(`
      <p style="font-size:15px"><b>${esc(opts.inviterName)}</b> invited you to join
        <b>${esc(opts.accountName)}</b> on <b>Let's Seal</b> as <b>${esc(opts.roleLabel)}</b>.</p>
      <p style="margin:28px 0">
        <a href="${esc(opts.link)}"
           style="background:${brand};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600">
          Accept invitation
        </a>
      </p>
      <p style="font-size:13px;color:#5b6472">You'll be asked to sign in or create a free account first. This link expires in 14 days. If you weren't expecting this, you can ignore it.</p>
`);
  await send({
    from: fromHeader(), // platform sender
    to: opts.to,
    subject: `Join ${opts.accountName} on Let's Seal`,
    html,
    text: `${opts.inviterName} invited you to join ${opts.accountName} on Let's Seal as ${opts.roleLabel}.\nAccept: ${opts.link}\n\nThis link expires in 14 days.`,
  });
  return true;
}
