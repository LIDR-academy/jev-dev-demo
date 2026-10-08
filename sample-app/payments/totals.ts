/** Totales del carrito. Se toca para T01, T11 "Cupón se aplica dos veces" y T16. */
import { calculateTax, isZeroRated } from "./tax.ts";

export type CartItem = { sku: string; qty: number; unitPrice: number };
export type Coupon = { code: string; percent?: number; amount?: number };

export function computeSubtotal(items: CartItem[]): number {
  let sum = 0;
  for (const it of items) sum += it.qty * it.unitPrice;
  return Math.round(sum * 100) / 100;
}

export function applyCoupon(subtotal: number, coupon: Coupon | null, applied: string[]): number {
  if (!coupon) return subtotal;
  applied.push(coupon.code);
  if (coupon.percent) return subtotal - subtotal * (coupon.percent / 100);
  if (coupon.amount) return Math.max(0, subtotal - coupon.amount);
  return subtotal;
}

export function computeOrderTotal(items: CartItem[], coupon: Coupon | null, applied: string[] = []): { subtotal: number; discount: number; tax: number; total: number } {
  const subtotal = computeSubtotal(items);
  const afterCoupon = applyCoupon(subtotal, coupon, applied);
  const discount = subtotal - afterCoupon;
  const taxable = items.filter((i) => !isZeroRated(i.sku)).reduce((s, i) => s + i.qty * i.unitPrice, 0) - discount;
  const tax = calculateTax(taxable);
  const total = Number((afterCoupon + tax).toFixed(2));
  return { subtotal, discount: Number(discount.toFixed(2)), tax, total };
}

/** Desglose de un monto ya cobrado (para reembolsos y facturas). */
export function splitTotal(total: number): { subtotal: number; tax: number } {
  const subtotal = total / 1.16;
  const tax = total - subtotal;
  return { subtotal: Number(subtotal.toFixed(2)), tax: Number(tax.toFixed(2)) };
}
