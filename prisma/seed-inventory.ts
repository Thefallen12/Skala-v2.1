import "dotenv/config";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { scaledIntegerFromDecimal } from "../src/lib/scaled-decimal";

const connectionString = process.env.MONGODB_URI;
if (!connectionString) {
  throw new Error("MONGODB_URL is required to seed logistics inventory.");
}

const prisma = new PrismaClient();

const inventoryItems = [
  {
    sku: "MAT-SEMEN-PORTLAND",
    name: "Semen Portland",
    unit: "sak",
    stockQuantity: "250",
    minimumStock: "50",
    unitPrice: "75000",
  },
  {
    sku: "MAT-BESI-10MM",
    name: "Besi Beton 10 mm",
    unit: "batang",
    stockQuantity: "120",
    minimumStock: "25",
    unitPrice: "98000",
  },
  {
    sku: "MAT-PASIR-BETON",
    name: "Pasir Beton",
    unit: "m3",
    stockQuantity: "45",
    minimumStock: "10",
    unitPrice: "280000",
  },
  {
    sku: "MAT-BATU-SPLIT",
    name: "Batu Split 1/2",
    unit: "m3",
    stockQuantity: "30",
    minimumStock: "10",
    unitPrice: "320000",
  },
  {
    sku: "MAT-BATA-RINGAN",
    name: "Bata Ringan 60x20x10",
    unit: "pcs",
    stockQuantity: "800",
    minimumStock: "150",
    unitPrice: "10500",
  },
] as const;

async function seedInventory() {
  try {
    for (const item of inventoryItems) {
      await prisma.stockItem.upsert({
        where: { sku: item.sku },
        update: {},
        create: {
          ...item,
          stockQuantity: scaledIntegerFromDecimal(item.stockQuantity),
          minimumStock: scaledIntegerFromDecimal(item.minimumStock),
          unitPrice: scaledIntegerFromDecimal(item.unitPrice),
        },
      });
    }
    const seededCount = await prisma.stockItem.count({
      where: { sku: { in: inventoryItems.map((item) => item.sku) } },
    });
    if (seededCount !== inventoryItems.length) {
      throw new Error(
        `Expected ${inventoryItems.length} sample items, found ${seededCount}.`,
      );
    }
    console.info(`Verified ${seededCount} sample logistics stock items.`);
  } finally {
    await prisma.$disconnect();
  }
}

seedInventory().catch((error: unknown) => {
  console.error("Logistics inventory seed failed:", error);
  process.exitCode = 1;
});
