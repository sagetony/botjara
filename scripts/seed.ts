import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { Tenant } from "../src/modules/tenants/tenant.model";
import { MenuItem } from "../src/modules/menus/menu.model";
import logger from "../src/utils/logger";

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  logger.info("Connected to MongoDB for seeding...");

  // Clear existing data
  await Tenant.deleteMany({});
  await MenuItem.deleteMany({});

  // Create test restaurant
  const tenant = await Tenant.create({
    name: "Mama Tee Kitchen",
    whatsappNumber: "2349049107835",
    whatsappPhoneNumberId: "1122227900972438",
    whatsappAccessToken:
      "EAAopvGVSsa8BRsGqvula3kNLPNX2wScH8FFiY16rujGTFj5lUhtWQ6FZAxOeyIwpA0EUaMw5nspAyVbTOxC9p8GPNGufnXByHlEZAFrDf9BajfZBqwjnZCeMMFjv77TY4UEUFZC75xCGAASoEqbtILHyqKnP0Wii0qMFZC6QwdgT8Ck88AEZAxlxFUatb2YyfpZAmwZDZD",
    ownerPhone: "2348102983659",
    businessAddress: "12 Wuse Zone 5, Abuja",
    description: "The best homemade Nigerian food in Abuja. Fresh daily!",
    deliveryZones: [
      "Wuse",
      "Wuse 2",
      "Maitama",
      "Garki",
      "Central Business District",
    ],
    deliveryFee: 500,
    minimumOrder: 1500,
    estimatedDeliveryTime: "30-45 minutes",
    personality: "warm, funny, speaks Pidgin naturally, uses emojis",
    language: "mixed",
    subscriptionStatus: "trial",
  });

  logger.info(`✅ Created tenant: ${tenant.name}`);

  // Create menu items
  const menuItems = [
    // Mains
    {
      name: "Jollof Rice",
      category: "Mains",
      price: 1500,
      description: "Party style jollof, smoky and rich",
      isPopular: true,
    },
    {
      name: "Fried Rice",
      category: "Mains",
      price: 1500,
      description: "Nigerian fried rice with veggies and liver",
    },
    { name: "White Rice & Stew", category: "Mains", price: 1200 },
    {
      name: "Egusi Soup",
      category: "Soups",
      price: 1800,
      description: "Melon seed soup with spinach",
    },
    { name: "Ofe Onugbu (Bitter Leaf Soup)", category: "Soups", price: 1800 },
    { name: "Afang Soup", category: "Soups", price: 2000, isPopular: true },
    // Swallows
    { name: "Eba (Small)", category: "Swallows", price: 200 },
    { name: "Eba (Large)", category: "Swallows", price: 400 },
    { name: "Pounded Yam (Small)", category: "Swallows", price: 400 },
    { name: "Pounded Yam (Large)", category: "Swallows", price: 700 },
    { name: "Semo (Small)", category: "Swallows", price: 200 },
    { name: "Fufu (Small)", category: "Swallows", price: 200 },
    // Proteins
    {
      name: "Chicken (1 piece)",
      category: "Proteins",
      price: 1000,
      isPopular: true,
    },
    { name: "Chicken (2 pieces)", category: "Proteins", price: 1800 },
    { name: "Beef (Small)", category: "Proteins", price: 600 },
    { name: "Beef (Large)", category: "Proteins", price: 1000 },
    { name: "Fish (Tilapia)", category: "Proteins", price: 1500 },
    { name: "Ponmo", category: "Proteins", price: 400 },
    // Drinks
    { name: "Coca Cola (50cl)", category: "Drinks", price: 300 },
    { name: "Malt (33cl)", category: "Drinks", price: 300 },
    { name: "Water (75cl)", category: "Drinks", price: 200 },
    {
      name: "Zobo (500ml)",
      category: "Drinks",
      price: 400,
      description: "Homemade hibiscus drink",
    },
    { name: "Chapman", category: "Drinks", price: 600, isPopular: true },
  ];

  await MenuItem.insertMany(
    menuItems.map((item) => ({ ...item, tenantId: tenant._id })),
  );

  logger.info(`✅ Created ${menuItems.length} menu items`);
  logger.info("🌱 Seed complete!");

  await mongoose.disconnect();
};

seed().catch((err) => {
  logger.error("Seed failed:", err);
  process.exit(1);
});
