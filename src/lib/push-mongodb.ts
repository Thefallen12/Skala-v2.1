import "server-only";

import { MongoClient, type Db } from "mongodb";

type MongoGlobal = typeof globalThis & {
  pushMongoClientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as MongoGlobal;

export async function getPushDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is required to manage push subscriptions.");
  }

  if (!globalForMongo.pushMongoClientPromise) {
    const client = new MongoClient(uri);
    globalForMongo.pushMongoClientPromise = client.connect().catch((error: unknown) => {
      globalForMongo.pushMongoClientPromise = undefined;
      throw error;
    });
  }

  const client = await globalForMongo.pushMongoClientPromise;
  return client.db();
}

export type PushUserDocument = {
  _id: string;
  isActive: boolean;
  pushSubscriptions?: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }[];
  fcmTokens?: {
    token: string;
    platform: "android" | "ios" | "web";
    updatedAt: string;
  }[];
};
