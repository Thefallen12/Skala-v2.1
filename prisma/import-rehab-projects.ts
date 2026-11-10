import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma } from "../src/generated/prisma/client";
import { ProjectPriority, ProjectStatus } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/prisma";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "../src/lib/scaled-decimal";
import { z } from "zod";

const recordSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(180),
  kelompokTani: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(240),
  pagu: z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/),
  landArea: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  startDate: z.iso.date(),
  location: z.string().trim().max(240),
  clientName: z.string().trim().max(160),
});

const manifestSchema = z.object({
  Records: z.array(recordSchema).min(1),
  TotalPagu: z.string().regex(/^\d+$/),
});

async function main(): Promise<void> {
  const manifestPath = join(
    process.cwd(),
    "prisma",
    "data",
    "rehab-projects-2026.json",
  );
  const content = await readFile(manifestPath, "utf8");
  const parsed = manifestSchema.safeParse(JSON.parse(content.replace(/^\uFEFF/, "")));
  if (!parsed.success) {
    throw new Error(
      `Project import manifest is invalid: ${parsed.error.issues[0]?.message ?? "unknown validation error"}`,
    );
  }

  const records = parsed.data.Records;
  const uniqueCodes = new Set(records.map((record) => record.code));
  if (uniqueCodes.size !== records.length) {
    throw new Error("Project import manifest contains duplicate SPK numbers.");
  }

  const computedTotal = records.reduce(
    (total, record) => total.plus(new Prisma.Decimal(record.pagu)),
    new Prisma.Decimal(0),
  );
  if (!computedTotal.equals(new Prisma.Decimal(parsed.data.TotalPagu))) {
    throw new Error("Project import manifest budget total does not match its rows.");
  }

  const existingProjects = await prisma.project.findMany({
    where: { code: { in: records.map((record) => record.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existingProjects.map((project: { code: string }) => project.code));
  const recordsToCreate = records.filter(
    (record) => !existingCodes.has(record.code),
  );
  const recordsToUpdateLandArea = records.filter((record) =>
    existingCodes.has(record.code),
  );

  const result = recordsToCreate.length
    ? await prisma.project.createMany({
        data: recordsToCreate.map((record) => ({
          code: record.code,
          name: record.title,
          title: record.title,
          kelompokTani: record.kelompokTani,
          address: record.address,
          pagu: scaledIntegerFromDecimal(record.pagu),
          landArea: scaledIntegerFromDecimal(record.landArea),
          progress: 0,
          priority: ProjectPriority.MEDIUM,
          status: ProjectStatus.PENDING,
          clientName: record.clientName,
          location: record.location,
          startDate: new Date(`${record.startDate}T00:00:00.000Z`),
        })),
      })
    : { count: 0 };
  if (recordsToUpdateLandArea.length) {
    await prisma.$transaction(
      recordsToUpdateLandArea.map((record) =>
        prisma.project.update({
          where: { code: record.code },
          data: { landArea: scaledIntegerFromDecimal(record.landArea) },
        }),
      ),
    );
  }

  const importedProjects = await prisma.project.findMany({
    where: { code: { in: records.map((record) => record.code) } },
    select: { code: true, pagu: true },
  });
  const importedBudget = importedProjects.reduce(
    (total: Prisma.Decimal, project: { code: string; pagu: bigint }) =>
      total.plus(decimalFromScaledInteger(project.pagu)),
    new Prisma.Decimal(0),
  );
  if (
    importedProjects.length !== records.length ||
    !importedBudget.equals(computedTotal)
  ) {
    throw new Error("Imported project rows or budget total failed verification.");
  }

  console.log(
    JSON.stringify(
      {
        sourceRecords: records.length,
        insertedRecords: result.count,
        preExistingRecords: existingCodes.size,
        landAreaUpdatedRecords: recordsToUpdateLandArea.length,
        verifiedRecords: importedProjects.length,
        totalPagu: importedBudget.toFixed(0),
        excludedExcelRows: [40, 44],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error("Rehab project import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
