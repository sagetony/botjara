import { Router, Request, Response } from 'express';
import { getTenantOrders, updateOrderStatus, getOrderById } from './order.service';
import logger from '../../utils/logger';

const router = Router();

// GET /orders — get all orders for a tenant
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId, status, limit } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const orders = await getTenantOrders(
      tenantId as string,
      status as string,
      Number(limit) || 50
    );
    res.json({ success: true, data: orders });
  } catch (error) {
    logger.error('GET /orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /orders/:id — get single order
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PATCH /orders/:id/status — update order status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'awaiting_payment', 'paid', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await updateOrderStatus(req.params.id, status);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

export default router;
