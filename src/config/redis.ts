import Redis from "ioredis";
import logger from "../utils/logger";

let redisClient: Redis | null = null;
let redisAvailable = false;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      retryStrategy: () => null, // Don't retry — fail fast
      enableOfflineQueue: false,
    });

    redisClient.on("connect", () => {
      redisAvailable = true;
      logger.info("✅ Redis connected");
    });

    redisClient.on("error", () => {
      // Suppress repeated error logs — just mark as unavailable
      redisAvailable = false;
    });

    redisClient.on("close", () => {
      redisAvailable = false;
    });
  }
  return redisClient;
};

export const isRedisAvailable = (): boolean => redisAvailable;

export const cacheGet = async (key: string): Promise<string | null> => {
  if (!redisAvailable) return null;
  try {
    return await getRedisClient().get(key);
  } catch {
    return null;
  }
};

export const cacheSet = async (
  key: string,
  value: string,
  ttlSeconds = 3600,
): Promise<void> => {
  if (!redisAvailable) return;
  try {
    await getRedisClient().setex(key, ttlSeconds, value);
  } catch {
    // Silently fail — cache is optional
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  if (!redisAvailable) return;
  try {
    await getRedisClient().del(key);
  } catch {
    // Silently fail
  }
};
