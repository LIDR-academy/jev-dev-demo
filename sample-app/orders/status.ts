/** Estado de pedidos. Limpio a propósito: es el control. */
const db = new Map<string, string>();

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  db.set(orderId, status);
}

export async function getOrderStatus(orderId: string): Promise<string | undefined> {
  return db.get(orderId);
}
