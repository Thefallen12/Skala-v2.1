import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ProjectPriority,
  ProjectStatus,
} from "../src/generated/prisma/enums";
import { scaledIntegerFromDecimal } from "../src/lib/scaled-decimal";

const connectionString = process.env.MONGODB_URI;
if (!connectionString) {
  throw new Error("MONGODB_URL is required to seed sample projects.");
}

const prisma = new PrismaClient();

const reportDates = [
  new Date("2026-10-01T00:00:00.000Z"),
  new Date("2026-10-08T00:00:00.000Z"),
  new Date("2026-10-15T00:00:00.000Z"),
];

const projectSamples = [
  {
    code: "DUMMY-PROJ-001",
    title: "Peningkatan Jalan Usaha Tani Sumber Makmur",
    kelompokTani: "Kelompok Tani Sumber Makmur",
    address: "Desa Sukamaju, Kec. Cibatu, Kab. Garut",
    pagu: "485000000",
    progress: 62,
    status: ProjectStatus.ON_PROGRESS,
    vendor: "CV Karya Infrastruktur",
    priority: ProjectPriority.HIGH,
    progressHistory: [24, 43, 62],
  },
  {
    code: "DUMMY-PROJ-002",
    title: "Rehabilitasi Saluran Irigasi Cikahuripan",
    kelompokTani: "Kelompok Tani Mekar Tani",
    address: "Desa Cikahuripan, Kec. Lembang, Kab. Bandung Barat",
    pagu: "320000000",
    progress: 38,
    status: ProjectStatus.ON_PROGRESS,
    vendor: "PT Tirta Konstruksi Nusantara",
    priority: ProjectPriority.URGENT,
    progressHistory: [12, 26, 38],
  },
  {
    code: "DUMMY-PROJ-003",
    title: "Pembangunan Jalan Produksi Blok Cibenda",
    kelompokTani: "Kelompok Tani Tunas Harapan",
    address: "Desa Cibenda, Kec. Parigi, Kab. Pangandaran",
    pagu: "275000000",
    progress: 17,
    status: ProjectStatus.TERHAMBAT,
    vendor: "CV Bina Sarana Desa",
    priority: ProjectPriority.MEDIUM,
    progressHistory: [10, 17, 17],
  },
  {
    code: "DUMMY-PROJ-004",
    title: "Perbaikan Jembatan Penghubung Area Persawahan",
    kelompokTani: "Kelompok Tani Karya Bersama",
    address: "Desa Cibuluh, Kec. Tanjungsiang, Kab. Subang",
    pagu: "195000000",
    progress: 100,
    status: ProjectStatus.DONE,
    vendor: "PT Jembatan Mandiri",
    priority: ProjectPriority.LOW,
    progressHistory: [35, 78, 100],
  },
  {
    code: "DUMMY-PROJ-005",
    title: "Pembangunan Jalan Lingkungan Pertanian",
    kelompokTani: "Kelompok Tani Harapan Jaya",
    address: "Desa Cipeundeuy, Kec. Bantarujeg, Kab. Majalengka",
    pagu: "410000000",
    progress: 0,
    status: ProjectStatus.PENDING,
    vendor: "CV Mandala Konstruksi",
    priority: ProjectPriority.HIGH,
    progressHistory: [0, 0, 0],
  },
];

async function main(): Promise<void> {
  try {
  for (const sample of projectSamples) {
    const project = await prisma.project.upsert({
      where: { code: sample.code },
      create: {
        code: sample.code,
        name: sample.title,
        title: sample.title,
        kelompokTani: sample.kelompokTani,
        address: sample.address,
        pagu: scaledIntegerFromDecimal(sample.pagu),
        progress: sample.progress,
        status: sample.status,
        vendor: sample.vendor,
        priority: sample.priority,
        clientName: sample.kelompokTani,
        location: sample.address,
        budget: scaledIntegerFromDecimal(sample.pagu),
        startDate: reportDates[0],
      },
      update: {
        name: sample.title,
        title: sample.title,
        kelompokTani: sample.kelompokTani,
        address: sample.address,
        pagu: scaledIntegerFromDecimal(sample.pagu),
        progress: sample.progress,
        status: sample.status,
        vendor: sample.vendor,
        priority: sample.priority,
        clientName: sample.kelompokTani,
        location: sample.address,
        budget: scaledIntegerFromDecimal(sample.pagu),
      },
      select: { id: true },
    });

    for (const [index, progress] of sample.progressHistory.entries()) {
      const reportDate = reportDates[index];
      await prisma.dailyReport.upsert({
        where: {
          projectId_reportDate: {
            projectId: project.id,
            reportDate,
          },
        },
        create: {
          projectId: project.id,
          reportDate,
          weather: index === 1 ? "Cerah berawan" : "Cerah",
          workersCount: progress === 0 ? 0 : 8 + index * 2,
          progress,
          workSummary:
            progress === 0
              ? "Menunggu persetujuan dan persiapan pekerjaan."
              : `Pekerjaan berjalan; progres kumulatif ${progress}%.`,
        },
        update: {
          progress,
          workersCount: progress === 0 ? 0 : 8 + index * 2,
          workSummary:
            progress === 0
              ? "Menunggu persetujuan dan persiapan pekerjaan."
              : `Pekerjaan berjalan; progres kumulatif ${progress}%.`,
        },
      });
    }
  }

    console.info(
      `Seeded ${projectSamples.length} sample projects and ${projectSamples.length * reportDates.length} progress reports.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error("Project sample-data seed failed:", error);
  process.exitCode = 1;
});
