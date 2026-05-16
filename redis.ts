import Redis from 'ioredis';
import { logger } from '../utils/helpers/logger';

let redisClient: Redis;

export async function initializeRedis(): Promise<Redis> {
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redisClient.on('connect', () => {
    logger.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    logger.info('Redis connected and ready');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis connection error:', err);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  try {
    await redisClient.connect();
  } catch (error) {
    logger.warn('Redis connection failed, continuing without cache:', error);
  }

  return redisClient;
}

export function getRedis(): Redis {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redisClient;
}

// Cache helper functions
export const cacheUtils = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  },

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error(`Cache del error for key ${key}:`, error);
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      logger.error(`Cache delPattern error for ${pattern}:`, error);
    }
  },

  async incr(key: string): Promise<number> {
    return redisClient.incr(key);
  },

  async expire(key: string, ttl: number): Promise<void> {
    await redisClient.expire(key, ttl);
  },
};

export default { initializeRedis, getRedis, cacheUtils };
