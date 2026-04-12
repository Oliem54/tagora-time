type AccountRequestNotificationPayload = {
  fullName: string;
  email: string;
  requestedRole: string;
  portalSource: string;
};

type DeliveryTrackingSmsPayload = {
  clientName: string | null;
  phone: string;
  trackingUrl: string;
  statusLabel: string;
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

export async function sendDeliveryTrackingSms(
  payload: DeliveryTrackingSmsPayload
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return {
      sent: false,
      skipped: true,
      reason: "sms_not_configured",
    } as const;
  }

  const body = new URLSearchParams({
    To: payload.phone,
    From: fromNumber,
    Body: `Bonjour ${payload.clientName || ""}, votre livraison est ${payload.statusLabel.toLowerCase()}. Suivi en direct : ${payload.trackingUrl}`.trim(),
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio SMS failed: ${errorText}`);
  }

  return {
    sent: true,
    skipped: false,
    reason: null,
  } as const;
}
