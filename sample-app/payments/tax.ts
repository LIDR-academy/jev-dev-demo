/** Impuestos. Se toca para T03 (desglose del reembolso) y T11 (cupón aplicado dos veces). */

export function calculateTax(subtotal: number): number {
  if (subtotal <= 0) return 0;
  const tax = subtotal * 0.16;
  return Math.round(tax * 100) / 100;
}

export function addTax(subtotal: number): number {
  return subtotal + calculateTax(subtotal);
}

export function removeTax(total: number): number {
  const subtotal = total / 1.16;
  return Number(subtotal.toFixed(2));
}

/** Tasa para productos de la canasta básica (tasa cero). */
export function isZeroRated(sku: string): boolean {
  return sku.startsWith("ALM-") || sku.startsWith("MED-");
}
