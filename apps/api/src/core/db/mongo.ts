import { MongoClient, type Db } from 'mongodb';
import type { AppConfig } from '../../config/env';
import { AppError } from '../errors/app-error';
import { ensureIndexes } from './indexes';

export function createMemoizedInitializer(
  initialize: () => Promise<void>,
): () => Promise<void> {
  let initialization: Promise<void> | undefined;
  return () => {
    if (!initialization) {
      initialization = initialize().catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
    }
    return initialization;
  };
}

export function createMongo(
  config: Pick<AppConfig, 'mongodbUri' | 'mongodbDb'>,
): {
  getDb(): Promise<Db>;
  close(): Promise<void>;
} {
  let db: Db | undefined;
  let client: MongoClient | undefined;

  const init = createMemoizedInitializer(async () => {
    const c = new MongoClient(config.mongodbUri, {
      appName: 'StudyPlannerAPI',
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
    try {
      await c.connect();
      const database = c.db(config.mongodbDb);
      await ensureIndexes(database);
      client = c;
      db = database;
    } catch (e) {
      await c.close().catch(() => undefined);
      throw e;
    }
  });

  return {
    async getDb() {
      try {
        await init();
      } catch {
        throw new AppError('SERVICE_UNAVAILABLE');
      }
      return db as Db;
    },
    async close() {
      await client?.close();
    },
  };
}
