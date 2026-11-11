import { prisma } from "../lib/prisma";
import { EquipmentStatus } from "@prisma/client";
import { STANDARD_EQUIPMENT_CATALOG } from "../lib/equipment-catalog";

async function main() {
  console.log("Seeding equipment & vehicle catalog...");

  let equipmentCount = 0;
  let vehicleCount = 0;

  for (const group of STANDARD_EQUIPMENT_CATALOG) {
    for (const item of group.items) {
      if (item.type === "EQUIPMENT") {
        const code = `ALT-${item.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`;
        const existing = await prisma.equipmentMaster.findFirst({
          where: {
            OR: [{ code }, { name: item.name }],
          },
        });

        if (!existing) {
          await prisma.equipmentMaster.create({
            data: {
              code,
              name: item.name,
              brand: item.brand || null,
              status: EquipmentStatus.READY,
              hourlyRate: BigInt(0),
              currentHM: BigInt(0),
            },
          });
          equipmentCount++;
        }
      } else if (item.type === "VEHICLE") {
        const dummyPlate = `ARM-${item.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}`;
        const existing = await prisma.vehicle.findFirst({
          where: {
            OR: [{ plateNumber: dummyPlate }, { modelName: item.name }],
          },
        });

        if (!existing) {
          await prisma.vehicle.create({
            data: {
              plateNumber: dummyPlate,
              vehicleType: item.category,
              brand: item.brand || "Umum",
              modelName: item.name,
              currentKilometer: BigInt(0),
              odometerInitialized: true,
              status: "AVAILABLE",
            },
          });
          vehicleCount++;
        }
      }
    }
  }

  console.log(`Seeded ${equipmentCount} equipment masters and ${vehicleCount} vehicles.`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
