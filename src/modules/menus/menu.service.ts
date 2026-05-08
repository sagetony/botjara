import { MenuItem, IMenuItem } from './menu.model';
import logger from '../../utils/logger';
import mongoose from 'mongoose';

// ─── GET ALL MENU ITEMS FOR TENANT ────────────────────────
export const getMenuByTenant = async (tenantId: string) => {
  const items = await MenuItem.find({ tenantId })
    .sort({ category: 1, sortOrder: 1 })
    .lean();

  // Group by category
  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return grouped;
};

// ─── GET AVAILABLE MENU ITEMS ─────────────────────────────
export const getAvailableMenu = async (tenantId: string) => {
  return MenuItem.find({ tenantId, isAvailable: true })
    .sort({ category: 1, sortOrder: 1 })
    .lean();
};

// ─── CREATE MENU ITEM ─────────────────────────────────────
export const createMenuItem = async (
  tenantId: string,
  data: Partial<IMenuItem>
): Promise<IMenuItem> => {
  const item = await MenuItem.create({ ...data, tenantId });
  logger.info(`✅ Menu item created: ${item.name} for tenant ${tenantId}`);
  return item;
};

// ─── UPDATE MENU ITEM ─────────────────────────────────────
export const updateMenuItem = async (
  itemId: string,
  tenantId: string,
  data: Partial<IMenuItem>
): Promise<IMenuItem | null> => {
  const item = await MenuItem.findOneAndUpdate(
    { _id: itemId, tenantId },
    { $set: data },
    { new: true }
  );
  if (item) logger.info(`✅ Menu item updated: ${item.name}`);
  return item;
};

// ─── DELETE MENU ITEM ─────────────────────────────────────
export const deleteMenuItem = async (
  itemId: string,
  tenantId: string
): Promise<boolean> => {
  const result = await MenuItem.findOneAndDelete({ _id: itemId, tenantId });
  if (result) logger.info(`🗑️ Menu item deleted: ${result.name}`);
  return !!result;
};

// ─── TOGGLE AVAILABILITY ──────────────────────────────────
export const toggleMenuItemAvailability = async (
  itemId: string,
  tenantId: string
): Promise<IMenuItem | null> => {
  const item = await MenuItem.findOne({ _id: itemId, tenantId });
  if (!item) return null;

  item.isAvailable = !item.isAvailable;
  await item.save();

  logger.info(`🔄 ${item.name} → ${item.isAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}`);
  return item;
};

// ─── BULK UPDATE AVAILABILITY ─────────────────────────────
export const bulkSetAvailability = async (
  tenantId: string,
  itemIds: string[],
  isAvailable: boolean
): Promise<number> => {
  const result = await MenuItem.updateMany(
    { tenantId, _id: { $in: itemIds } },
    { $set: { isAvailable } }
  );
  return result.modifiedCount;
};
