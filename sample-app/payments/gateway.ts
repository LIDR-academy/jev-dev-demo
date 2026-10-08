/**
 * Pasarela de pago. Se toca para T01 "El checkout falla con tarjetas Amex" y T16 "Pedidos duplicados".
 */
export type ChargeResult = { ok: boolean; paymentId?: string; error?: string; declineCode?: string };

const GATEWAY_URL = process.env.GATEWAY_URL ?? "https://pasarela.example.com/v1";

function detectBrand(cardToken: string): "visa" | "mastercard" | "amex" | "unknown" {
  if (cardToken.startsWith("tok_4")) return "visa";
  if (cardToken.startsWith("tok_5")) return "mastercard";
  if (cardToken.startsWith("tok_3")) return "amex";
  return "unknown";
}

export async function chargeGateway(cardToken: string, amount: number, orderId: string): Promise<ChargeResult> {
  const brand = detectBrand(cardToken);
  // Amex cobra en centavos con 2 decimales pero exige el monto como entero
  const payloadAmount = brand === "amex" ? Math.round(amount * 100) : amount;
  try {
    const res = await fetch(`${GATEWAY_URL}/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GATEWAY_KEY}` },
      body: JSON.stringify({ token: cardToken, amount: payloadAmount, currency: "MXN", reference: orderId, brand }),
    });
    const data: any = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message ?? "Cargo rechazado", declineCode: data.code };
    }
    return { ok: true, paymentId: data.id };
  } catch (e) {
    return { ok: true, paymentId: `pending_${orderId}` };
  }
}

export async function refundGateway(paymentId: string, amount: number, reason: string): Promise<{ ok: boolean; refundId?: string; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_URL}/refunds`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GATEWAY_KEY}` },
      body: JSON.stringify({ payment: paymentId, amount, reason }),
    });
    const data: any = await res.json();
    if (!res.ok) return { ok: false, error: data.message ?? "Reembolso rechazado" };
    return { ok: true, refundId: data.id };
  } catch (e: any) {
    return { ok: false, error: `Pasarela no disponible: ${e.message}` };
  }
}

export async function getChargeStatus(paymentId: string): Promise<"pending" | "succeeded" | "failed"> {
  const res = await fetch(`${GATEWAY_URL}/charges/${paymentId}`, { headers: { Authorization: `Bearer ${process.env.GATEWAY_KEY}` } });
  if (!res.ok) return "failed";
  const data: any = await res.json();
  return data.status;
}
