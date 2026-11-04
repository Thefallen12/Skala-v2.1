import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.MONGODB_URL;

if (!connectionString) {
  throw new Error("MONGODB_URL is not set");
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient();

globalForPrisma.prisma = prisma;
