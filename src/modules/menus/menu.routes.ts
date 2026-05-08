import { Router, Request, Response } from 'express';
import {
  getMenuByTenant,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleMenuItemAvailability,
  bulkSetAvailability,
} from './menu.service';

const router = Router();

// GET /menus?tenantId=xxx — get full menu grouped by category
router.get('/', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const menu = await getMenuByTenant(tenantId as string);
    res.json({ success: true, data: menu });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST /menus — create menu item
router.post('/', async (req: Request, res: Response) => {
  try {
    const { tenantId, ...data } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const item = await createMenuItem(tenantId, data);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// PATCH /menus/:id — update menu item
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId, ...data } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const item = await updateMenuItem(req.params.id, tenantId, data);
    if (!item) return res.status(404).json({ error: 'Menu item not found' });

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// PATCH /menus/:id/toggle — toggle availability
router.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const item = await toggleMenuItemAvailability(req.params.id, tenantId);
    if (!item) return res.status(404).json({ error: 'Menu item not found' });

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle menu item' });
  }
});

// DELETE /menus/:id — delete menu item
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const deleted = await deleteMenuItem(req.params.id, tenantId as string);
    if (!deleted) return res.status(404).json({ error: 'Menu item not found' });

    res.json({ success: true, message: 'Menu item deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// POST /menus/bulk-availability — bulk toggle
router.post('/bulk-availability', async (req: Request, res: Response) => {
  try {
    const { tenantId, itemIds, isAvailable } = req.body;
    if (!tenantId || !itemIds) return res.status(400).json({ error: 'tenantId and itemIds are required' });

    const count = await bulkSetAvailability(tenantId, itemIds, isAvailable);
    res.json({ success: true, message: `${count} items updated` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to bulk update availability' });
  }
});

export default router;
