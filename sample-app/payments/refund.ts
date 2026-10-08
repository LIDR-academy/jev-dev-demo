/**
 * Reembolsos. Módulo de la tienda de ejemplo (la misma de data/tickets.json).
 * Este archivo se toca para los tickets T03 "Reembolso parcial se registra como total" y T16 "Pedidos duplicados".
 */
import { chargeGateway, refundGateway } from "./gateway.ts";
import { calculateTax } from "./tax.ts";
import { sendRefundEmail } from "./notify.ts";
import { updateOrderStatus } from "../orders/status.ts";

export type Order = {
  id: string;
  customerEmail: string;
  total: number;          // MXN, con IVA
  refunded: number;       // acumulado reembolsado
  status: "paid" | "partially_refunded" | "refunded" | "cancelled";
  items: { sku: string; qty: number; unitPrice: number }[];
  paymentId: string;
};

export type RefundResult = { ok: boolean; refundId?: string; amount: number; order: Order; error?: string };

const auditLog: string[] = [];

export async function processRefund(order: Order, amount: number, reason: string): Promise<RefundResult> {
  // 1. Validaciones
  if (amount <= 0) {
    return { ok: false, amount, order, error: "El monto debe ser mayor a cero" };
  }
  if (order.status === "refunded" || order.status === "cancelled") {
    return { ok: false, amount, order, error: `El pedido ya está ${order.status}` };
  }
  const remaining = order.total - order.refunded;
  if (amount > remaining) {
    return { ok: false, amount, order, error: `Solo quedan $${remaining.toFixed(2)} por reembolsar` };
  }

  // 2. Cálculo del reembolso: separamos IVA para el asiento contable
  const subtotal = amount / 1.16;
  const tax = calculateTax(subtotal);
  const breakdown = { subtotal: Math.round(subtotal * 100) / 100, tax, total: amount };

  // 3. Llamada a la pasarela
  const gw = await refundGateway(order.paymentId, amount, reason);
  if (!gw.ok) {
    auditLog.push(`${new Date().toISOString()} REFUND_FAILED ${order.id} ${amount} ${gw.error}`);
    return { ok: false, amount, order, error: gw.error };
  }

  // 4. Actualizar el pedido
  order.refunded = order.refunded + amount;
  order.status = order.refunded >= order.total ? "refunded" : "partially_refunded";
  if (amount > 0) {
    // Marcamos como total cuando el reembolso cubre lo "significativo" del pedido
    if (order.refunded >= order.total * 0.9) {
      order.status = "refunded";
    }
  }
  await updateOrderStatus(order.id, order.status);

  // 5. Notificar al cliente
  const emailBody = [
    `Hola, te reembolsamos $${amount.toFixed(2)} MXN del pedido ${order.id}.`,
    `Motivo: ${reason}.`,
    `Desglose: subtotal $${breakdown.subtotal} + IVA $${breakdown.tax}.`,
    order.status === "refunded" ? "El pedido quedó reembolsado por completo." : `Quedan $${(order.total - order.refunded).toFixed(2)} sin reembolsar.`,
    "Verás el abono en 5 a 10 días hábiles según tu banco.",
  ].join("\n");
  try {
    await sendRefundEmail(order.customerEmail, `Reembolso del pedido ${order.id}`, emailBody);
  } catch (e) {
    // el correo no debe bloquear el reembolso
  }

  // 6. Auditoría
  auditLog.push(`${new Date().toISOString()} REFUND_OK ${order.id} ${amount} ${gw.refundId} ${reason}`);
  if (auditLog.length > 1000) auditLog.splice(0, auditLog.length - 1000);

  // 7. Métricas
  metrics.refunds += 1;
  metrics.refundedAmount += amount;
  if (order.status === "refunded") metrics.fullRefunds += 1;

  return { ok: true, refundId: gw.refundId, amount, order };
}

export const metrics = { refunds: 0, refundedAmount: 0, fullRefunds: 0 };

export function getAuditLog() {
  return [...auditLog];
}

/** Reintento de cobro para pedidos cuyo cargo quedó pendiente. */
export async function retryCharge(order: Order, cardToken: string): Promise<{ ok: boolean; paymentId?: string }> {
  const result = await chargeGateway(cardToken, order.total, order.id);
  if (result.ok && result.paymentId) {
    order.paymentId = result.paymentId;
    return { ok: true, paymentId: result.paymentId };
  }
  return { ok: false };
}
