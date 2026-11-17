import "server-only";

import mongoose from "mongoose";

type MongooseGlobal = typeof globalThis & {
  mongooseConnection?: typeof mongoose | null;
  mongooseConnectionPromise?: Promise<typeof mongoose>;
  mongooseLastFailureTime?: number;
  mongooseFallbackLogged?: boolean;
};

const globalForMongoose = globalThis as MongooseGlobal;
const MONGOOSE_RETRY_COOLDOWN_MS = 30_000;

export function isMongoConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : "";
  return (
    name === "MongooseServerSelectionError" ||
    name === "MongoServerSelectionError" ||
    name === "MongoNetworkTimeoutError" ||
    name === "MongoNetworkError" ||
    /ServerSelectionError|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|whitelist|TLS|I\/O error|MONGODB_URI/i.test(
      `${name} ${message}`,
    )
  );
}

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
      .connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      })
      .then((connection) => {
        globalForMongoose.mongooseLastFailureTime = 0;
        globalForMongoose.mongooseFallbackLogged = false;
        return connection;
      })
      .catch((error: unknown) => {
        globalForMongoose.mongooseConnectionPromise = undefined;
        throw error;
      });
  }

  globalForMongoose.mongooseConnection =
    await globalForMongoose.mongooseConnectionPromise;
  return globalForMongoose.mongooseConnection;
}

/**
 * Varian read-only SSR: mengembalikan `null` bila MongoDB tidak terjangkau
 * (mis. IP belum di-whitelist di Atlas) agar halaman tetap dapat menampilkan
 * fallback read-only tanpa HTTP 500, sambil menjaga cooldown 30 detik.
 */
export async function connectToMongoDBOptional(): Promise<typeof mongoose | null> {
  if (globalForMongoose.mongooseConnection) {
    return globalForMongoose.mongooseConnection;
  }

  const lastFailure = globalForMongoose.mongooseLastFailureTime ?? 0;
  if (Date.now() - lastFailure < MONGOOSE_RETRY_COOLDOWN_MS) {
    return null;
  }

  try {
    return await connectToMongoDB();
  } catch (error) {
    if (isMongoConnectionError(error)) {
      globalForMongoose.mongooseLastFailureTime = Date.now();
      if (!globalForMongoose.mongooseFallbackLogged) {
        globalForMongoose.mongooseFallbackLogged = true;
        console.warn(
          "[Mongoose] MongoDB tidak terjangkau (periksa IP whitelist Atlas atau jaringan). Menggunakan fallback read-only.",
        );
      }
      return null;
    }
    throw error;
  }
}
