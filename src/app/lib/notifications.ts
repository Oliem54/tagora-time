type AccountRequestNotificationPayload = {
  fullName: string;
  email: string;
  requestedRole: string;
  portalSource: string;
};

export async function notifyDirectionOfAccountRequest(
  payload: AccountRequestNotificationPayload
) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const rawRecipients = process.env.DIRECTION_ALERT_EMAILS;

  if (!apiKey || !fromEmail || !rawRecipients) {
    return;
  }

  const recipients = rawRecipients
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: recipients,
      subject: "Nouvelle demande de creation de compte TAGORA Time",
      html: `
        <h2>Nouvelle demande de compte</h2>
        <p><strong>Nom :</strong> ${payload.fullName}</p>
        <p><strong>Courriel :</strong> ${payload.email}</p>
        <p><strong>Role demande :</strong> ${payload.requestedRole}</p>
        <p><strong>Portail source :</strong> ${payload.portalSource}</p>
      `,
    }),
  });
}
