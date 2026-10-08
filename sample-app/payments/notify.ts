/** Notificaciones por correo. Limpio a propósito: es el control. */
const MAIL_URL = process.env.MAIL_URL ?? "https://correo.example.com/send";

export async function sendRefundEmail(to: string, subject: string, body: string): Promise<void> {
  const res = await fetch(MAIL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MAIL_KEY}` },
    body: JSON.stringify({ to, subject, text: body }),
  });
  if (!res.ok) throw new Error(`Correo no enviado: ${res.status}`);
}

export async function sendOrderShippedEmail(to: string, orderId: string, trackingUrl: string): Promise<void> {
  await sendRefundEmail(to, `Tu pedido ${orderId} va en camino`, `Rastrea tu envío aquí: ${trackingUrl}`);
}
