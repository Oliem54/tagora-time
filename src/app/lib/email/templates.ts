import "server-only";

export type EmailInfoRow = {
  label: string;
  value: string | null | undefined;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function resolvePublicAppUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
  if (!raw) {
    console.error("[email-template] public_url_missing");
    return null;
  }
  const cleaned = raw.replace(/\/$/, "");
  if (/localhost|127\.0\.0\.1|::1/i.test(cleaned)) {
    console.error("[email-template] public_url_invalid_localhost", { value: cleaned });
    return null;
  }
  return cleaned;
}

export function buildPublicUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const baseUrl = resolvePublicAppUrl();
  if (!baseUrl) return null;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${baseUrl}${normalizedPath}`;
}

export function getTagoraLogoUrl() {
  const baseUrl = resolvePublicAppUrl();
  return baseUrl ? `${baseUrl}/logo.png` : null;
}

export function renderInfoRows(rows: EmailInfoRow[]) {
  const safeRows = rows.map((row) => ({
    label: escapeHtml(row.label),
    value: escapeHtml(row.value && row.value.trim() ? row.value.trim() : "-"),
  }));
  return safeRows
    .map(
      (row) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155;font-weight:600;font-size:13px;width:180px;">${row.label}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;">${row.value}</td>
      </tr>`
    )
    .join("");
}

export function renderActionButton(label: string, href: string | null) {
  if (!href) {
    return `<span style="display:inline-block;background:#cbd5e1;color:#475569;font-size:14px;font-weight:700;padding:10px 16px;border-radius:10px;">Lien public non configure</span>`;
  }
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#0f2948;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:10px 16px;border-radius:10px;">${escapeHtml(label)}</a>`;
}

export function renderBaseEmailLayout(options: {
  title: string;
  intro: string;
  summaryRowsHtml: string;
  messageLabel?: string;
  messageBody: string;
  actionLabel?: string;
  actionUrl?: string | null;
  footer?: string;
}) {
  const logoUrl = getTagoraLogoUrl();
  const directUrl = options.actionUrl ?? null;
  const actionButton = renderActionButton(options.actionLabel ?? "Ouvrir dans TAGORA", directUrl);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;background:#f1f5f9;">
      <tr><td align="center">
        <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dbe4f0;border-radius:16px;overflow:hidden;box-shadow:0 8px 18px rgba(15,41,72,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f2948,#1d4f7c);padding:18px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="TAGORA" style="height:38px;display:block;" />` : `<div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.06em;">TAGORA</div>`}
                  </td>
                  <td style="text-align:right;vertical-align:middle;color:#dbeafe;font-size:12px;">Notification</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:22px 22px 10px;">
            <h1 style="margin:0 0 8px;font-size:22px;line-height:1.2;color:#0f172a;">${escapeHtml(options.title)}</h1>
            <p style="margin:0;color:#475569;font-size:14px;">${escapeHtml(options.intro)}</p>
          </td></tr>
          <tr><td style="padding:12px 22px;">
            <div style="border:1px solid #dbe4f0;border-radius:12px;background:#f8fafc;padding:10px 12px;">
              <div style="font-size:13px;color:#334155;font-weight:700;margin-bottom:8px;">Resume</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${options.summaryRowsHtml}</table>
            </div>
          </td></tr>
          <tr><td style="padding:8px 22px 12px;">
            <div style="border:1px solid #dbe4f0;border-radius:12px;background:#ffffff;padding:14px;">
              <div style="font-size:13px;color:#334155;font-weight:700;margin-bottom:8px;">${escapeHtml(options.messageLabel ?? "Message")}</div>
              <div style="white-space:pre-wrap;color:#0f172a;font-size:14px;line-height:1.5;">${escapeHtml(options.messageBody)}</div>
            </div>
          </td></tr>
          <tr><td style="padding:8px 22px 18px;">
            ${actionButton}
            <div style="margin-top:10px;font-size:12px;color:#64748b;">Lien direct :</div>
            <div style="font-size:12px;color:#1d4ed8;word-break:break-all;">${escapeHtml(directUrl ?? "Lien public non configure")}</div>
          </td></tr>
          <tr><td style="padding:14px 22px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
            ${escapeHtml(options.footer ?? "Merci,\nTAGORA").replace(/\n/g, "<br />")}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderPlainTextFallback(options: {
  greeting?: string;
  intro: string;
  rows: EmailInfoRow[];
  messageLabel?: string;
  messageBody: string;
  actionUrl?: string | null;
  footer?: string;
}) {
  const lines = [
    options.greeting ?? "Bonjour,",
    "",
    options.intro,
    "",
    "Resume :",
    ...options.rows.map((row) => `- ${row.label} : ${row.value && row.value.trim() ? row.value.trim() : "-"}`),
    "",
    `${options.messageLabel ?? "Message"} :`,
    options.messageBody,
    "",
    options.actionUrl ? `Ouvrir dans TAGORA : ${options.actionUrl}` : "Lien public non configure.",
    "",
    options.footer ?? "Merci,\nTAGORA",
  ];
  return lines.join("\n");
}
