import "server-only";

import mongoose from "mongoose";

type MongooseGlobal = typeof globalThis & {
  mongooseConnection?: typeof mongoose | null;
  mongooseConnectionPromise?: Promise<typeof mongoose>;
};

const globalForMongoose = globalThis as MongooseGlobal;

export async function connectToMongoDB() {
  if (globalForMongoose.mongooseConnection) {
    return globalForMongoose.mongooseConnection;
  }

  if (!globalForMongoose.mongooseConnectionPromise) {
    const uri = process.env.MONGODB_URI?.trim();
    if (!uri) {
      throw new Error("MONGODB_URI is required to connect to MongoDB.");
    }

    globalForMongoose.mongooseConnectionPromise = mongoose
      .connect(uri, { bufferCommands: false })
      .then((connection) => connection)
      .catch((error: unknown) => {
        globalForMongoose.mongooseConnectionPromise = undefined;
        throw error;
      });
  }

  globalForMongoose.mongooseConnection =
    await globalForMongoose.mongooseConnectionPromise;
  return globalForMongoose.mongooseConnection;
}
