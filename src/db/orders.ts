import { db, isPostgresConfigured } from './index.ts';
import { orders } from './schema.ts';
import { eq, desc } from 'drizzle-orm';
import type { Order, OrderStatus } from '../types.ts';

type DbOrderRow = typeof orders.$inferSelect;

const memoryOrders: DbOrderRow[] = [];
let memoryOrderIdCounter = 1;

export async function getAllOrders() {
  if (!isPostgresConfigured) {
    return [...memoryOrders].sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }
  try {
    const records = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return records;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getOrderByNumber(orderNumber: string) {
  if (!isPostgresConfigured) {
    return memoryOrders.find((o) => o.orderNumber === orderNumber) || null;
  }
  try {
    const records = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    return records[0] || null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createOrderInDb(order: Order) {
  if (!isPostgresConfigured) {
    const now = new Date();
    const row: DbOrderRow = {
      id: memoryOrderIdCounter++,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email || null,
      city: order.city,
      address: order.address,
      notes: order.notes || null,
      items: order.items,
      subtotal: order.subtotal,
      discountAmount: order.discount_amount || 0,
      deliveryFee: order.delivery_fee || 0,
      totalAmount: order.total_amount,
      status: order.status || 'pending',
      paymentMethod: order.payment_method || null,
      deliverySpeed: order.delivery_speed || null,
      whatsappSent: order.whatsapp_sent || false,
      driverName: order.driver_name || null,
      driverPhone: order.driver_phone || null,
      driverId: order.driver_id || null,
      codCollected: order.cod_collected || false,
      codCollectedAmount: order.cod_collected_amount ?? null,
      driverNotes: order.driver_notes || null,
      deliveredAt: order.delivered_at ? new Date(order.delivered_at) : null,
      createdAt: order.created_at ? new Date(order.created_at) : now,
      updatedAt: now,
    };
    memoryOrders.unshift(row);
    return row;
  }

  try {
    const result = await db
      .insert(orders)
      .values({
        orderNumber: order.order_number,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerEmail: order.customer_email || null,
        city: order.city,
        address: order.address,
        notes: order.notes || null,
        items: order.items,
        subtotal: order.subtotal,
        discountAmount: order.discount_amount || 0,
        deliveryFee: order.delivery_fee || 0,
        totalAmount: order.total_amount,
        status: order.status || 'pending',
        paymentMethod: order.payment_method || null,
        deliverySpeed: order.delivery_speed || null,
        whatsappSent: order.whatsapp_sent || false,
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to create order:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function updateOrderStatusInDb(orderNumber: string, status: OrderStatus) {
  if (!isPostgresConfigured) {
    const existing = memoryOrders.find((o) => o.orderNumber === orderNumber);
    if (!existing) return undefined;
    existing.status = status;
    existing.updatedAt = new Date();
    return existing;
  }
  try {
    const result = await db
      .update(orders)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(orders.orderNumber, orderNumber))
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to update order status:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function assignDriverInDb(
  orderNumber: string,
  driverInfo: { driverName: string; driverPhone: string; driverId?: string }
) {
  if (!isPostgresConfigured) {
    const existing = memoryOrders.find((o) => o.orderNumber === orderNumber);
    if (!existing) return undefined;
    existing.driverName = driverInfo.driverName;
    existing.driverPhone = driverInfo.driverPhone;
    existing.driverId = driverInfo.driverId || null;
    existing.status = 'shipped';
    existing.updatedAt = new Date();
    return existing;
  }
  try {
    const result = await db
      .update(orders)
      .set({
        driverName: driverInfo.driverName,
        driverPhone: driverInfo.driverPhone,
        driverId: driverInfo.driverId || null,
        status: 'shipped', // Automatically mark as shipped/assigned
        updatedAt: new Date(),
      })
      .where(eq(orders.orderNumber, orderNumber))
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to assign driver in DB:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function updateDeliveryStatusInDb(
  orderNumber: string,
  data: {
    status: OrderStatus;
    codCollected?: boolean;
    codCollectedAmount?: number;
    driverNotes?: string;
  }
) {
  if (!isPostgresConfigured) {
    const existing = memoryOrders.find((o) => o.orderNumber === orderNumber);
    if (!existing) return undefined;
    existing.status = data.status;
    existing.updatedAt = new Date();
    if (data.codCollected !== undefined) existing.codCollected = data.codCollected;
    if (data.codCollectedAmount !== undefined) existing.codCollectedAmount = data.codCollectedAmount;
    if (data.driverNotes !== undefined) existing.driverNotes = data.driverNotes;
    if (data.status === 'delivered') existing.deliveredAt = new Date();
    return existing;
  }
  try {
    const updatePayload: Record<string, any> = {
      status: data.status,
      updatedAt: new Date(),
    };

    if (data.codCollected !== undefined) {
      updatePayload.codCollected = data.codCollected;
    }
    if (data.codCollectedAmount !== undefined) {
      updatePayload.codCollectedAmount = data.codCollectedAmount;
    }
    if (data.driverNotes !== undefined) {
      updatePayload.driverNotes = data.driverNotes;
    }
    if (data.status === 'delivered') {
      updatePayload.deliveredAt = new Date();
    }

    const result = await db
      .update(orders)
      .set(updatePayload)
      .where(eq(orders.orderNumber, orderNumber))
      .returning();

    return result[0];
  } catch (error) {
    console.error('Failed to update delivery status in DB:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}
