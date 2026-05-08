import logger from '../../utils/logger';
import { Order, IOrder } from './order.model';
import { MenuItem } from '../menus/menu.model';
import { Customer } from '../customers/customer.model';
import { ITenant } from '../tenants/tenant.model';
import mongoose from 'mongoose';

interface OrderItemInput {
  name: string;
  quantity: number;
  modifiers?: string[];
}

interface CreateOrderInput {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  items: OrderItemInput[];
  type: 'delivery' | 'pickup';
  deliveryAddress?: string;
  notes?: string;
  deliveryFee: number;
}

// ─── CREATE ORDER ─────────────────────────────────────────
export const createOrder = async (input: CreateOrderInput): Promise<IOrder | null> => {
  try {
    const resolvedItems = [];
    let subtotal = 0;

    for (const item of input.items) {
      // Find menu item by name (case-insensitive)
      const menuItem = await MenuItem.findOne({
        tenantId: input.tenantId,
        name: { $regex: new RegExp(item.name, 'i') },
        isAvailable: true,
      });

      if (!menuItem) {
        logger.warn(`Menu item not found or unavailable: ${item.name}`);
        continue;
      }

      const itemSubtotal = menuItem.price * item.quantity;
      subtotal += itemSubtotal;

      resolvedItems.push({
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: item.quantity,
        modifiers: item.modifiers || [],
        subtotal: itemSubtotal,
      });
    }

    if (resolvedItems.length === 0) return null;

    const total = subtotal + (input.type === 'delivery' ? input.deliveryFee : 0);

    const order = await Order.create({
      tenantId: input.tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      items: resolvedItems,
      subtotal,
      deliveryFee: input.type === 'delivery' ? input.deliveryFee : 0,
      total,
      type: input.type,
      deliveryAddress: input.deliveryAddress,
      notes: input.notes,
      status: 'awaiting_payment',
      paymentStatus: 'unpaid',
    });

    // Update customer stats
    await Customer.findByIdAndUpdate(input.customerId, {
      $inc: { totalOrders: 1 },
      lastOrderAt: new Date(),
    });

    logger.info(`✅ Order created: ${order.orderNumber} | Total: ₦${total.toLocaleString()}`);
    return order;

  } catch (error) {
    logger.error('❌ Failed to create order:', error);
    return null;
  }
};

// ─── GET ORDER BY ID ──────────────────────────────────────
export const getOrderById = async (orderId: string): Promise<IOrder | null> => {
  return Order.findById(orderId).lean() as Promise<IOrder | null>;
};

// ─── UPDATE ORDER STATUS ──────────────────────────────────
export const updateOrderStatus = async (
  orderId: string,
  status: IOrder['status']
): Promise<IOrder | null> => {
  const order = await Order.findByIdAndUpdate(
    orderId,
    { status },
    { new: true }
  );
  if (order) logger.info(`📦 Order ${order.orderNumber} status → ${status}`);
  return order;
};

// ─── GET TENANT ORDERS ────────────────────────────────────
export const getTenantOrders = async (
  tenantId: string,
  status?: string,
  limit = 50
) => {
  const query: Record<string, unknown> = { tenantId };
  if (status) query.status = status;

  return Order.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('customerId', 'name phone')
    .lean();
};

// ─── FORMAT ORDER SUMMARY (for WhatsApp message) ──────────
export const formatOrderSummary = (order: IOrder): string => {
  const lines = order.items.map((item) => {
    const modStr = item.modifiers.length > 0 ? ` (${item.modifiers.join(', ')})` : '';
    return `• ${item.quantity}x ${item.name}${modStr} — ₦${item.subtotal.toLocaleString()}`;
  });

  let summary = `🧾 *Order ${order.orderNumber}*\n\n`;
  summary += lines.join('\n');
  summary += `\n\n─────────────\n`;
  summary += `Subtotal: ₦${order.subtotal.toLocaleString()}\n`;

  if (order.type === 'delivery' && order.deliveryFee > 0) {
    summary += `Delivery fee: ₦${order.deliveryFee.toLocaleString()}\n`;
  }

  summary += `*Total: ₦${order.total.toLocaleString()}*\n`;
  summary += `\nType: ${order.type === 'delivery' ? '🛵 Delivery' : '🏃 Pickup'}`;

  if (order.deliveryAddress) {
    summary += `\nAddress: ${order.deliveryAddress}`;
  }

  return summary;
};
