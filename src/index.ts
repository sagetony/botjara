import dotenv from "dotenv";
dotenv.config();

import express, { Request } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import connectDB from "./config/database";
import { getRedisClient } from "./config/redis";
import logger from "./utils/logger";

import webhookRoutes from "./modules/webhook/webhook.routes";
import paymentRoutes from "./modules/payments/payment.routes";
import orderRoutes from "./modules/orders/order.routes";
import menuRoutes from "./modules/menus/menu.routes";

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    credentials: true,
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => req.path.includes("/webhook"),
});
app.use(limiter);

// ─── BODY PARSING WITH RAW BODY CAPTURE ──────────────────
// Raw body is needed for WhatsApp webhook signature verification
app.use(
  express.json({
    limit: "10mb",
    verify: (req: Request & { rawBody?: string }, res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
    skip: (req) => req.path === "/health",
  }),
);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "botjara Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

app.use("/webhook", webhookRoutes);
app.use("/webhook", paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/menus", menuRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

const start = async () => {
  try {
    await connectDB();
    try {
      await getRedisClient().connect();
    } catch {
      logger.warn("Redis not available — continuing without cache");
    }
    app.listen(PORT, () => {
      logger.info(`🚀 botjara Backend running on port ${PORT}`);
      logger.info(`📡 WhatsApp Webhook: POST /webhook/whatsapp`);
      logger.info(`💳 Paystack Webhook: POST /webhook/paystack`);
      logger.info(`📦 Orders API:       /api/orders`);
      logger.info(`🍽️  Menu API:         /api/menus`);
      logger.info(`❤️  Health:           GET /health`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Promise Rejection:", reason);
});

start();

export default app;
