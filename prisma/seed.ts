import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole } from "../src/generated/prisma/enums";

const requiredEnv = ["MONGODB_URL", "ADMIN_EMAIL", "ADMIN_NAME", "ADMIN_PASSWORD"] as const;
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(", ")}`);
}

const password = process.env.ADMIN_PASSWORD!;
if (password.length < 12) {
  throw new Error("ADMIN_PASSWORD must be at least 12 characters long");
}

const email = process.env.ADMIN_EMAIL!.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("ADMIN_EMAIL must be a valid email address");
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.info("Bootstrap admin already exists; no account changes were made.");
  } else {
    await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name: process.env.ADMIN_NAME!.trim(),
        email,
        passwordHash: await hash(password, 12),
        role: UserRole.ADMINISTRATIONS,
        updatedAt: new Date(),
      },
    });
    console.info("Bootstrap administrator created.");
  }
} finally {
  await prisma.$disconnect();
}
