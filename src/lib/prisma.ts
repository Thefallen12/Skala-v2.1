import { PrismaClient } from "@prisma/client";

const connectionString = process.env.MONGODB_URI?.trim();
const isProductionBuild =
  process.env.NEXT_PHASE === "phase-production-build";

if (!isProductionBuild && !connectionString) {
  throw new Error(
    "MONGODB_URI is required. Configure the MongoDB Atlas connection string in the Hostinger environment.",
  );
}

if (
  !isProductionBuild &&
  connectionString &&
  !connectionString.startsWith("mongodb://") &&
  !connectionString.startsWith("mongodb+srv://")
) {
  throw new Error(
    "MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string.",
  );
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForPrisma.prisma = prisma;
