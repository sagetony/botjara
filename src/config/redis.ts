import Redis from 'ioredis';
import logger from '../utils/logger';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('error', (err) => logger.error('Redis error:', err));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }
  return redisClient;
};

export const cacheGet = async (key: string): Promise<string | null> => {
  const client = getRedisClient();
  return client.get(key);
};

export const cacheSet = async (key: string, value: string, ttlSeconds = 3600): Promise<void> => {
  const client = getRedisClient();
  await client.setex(key, ttlSeconds, value);
};

export const cacheDel = async (key: string): Promise<void> => {
  const client = getRedisClient();
  await client.del(key);
};
