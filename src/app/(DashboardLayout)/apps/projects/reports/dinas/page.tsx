import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../../auth";
import { prisma } from "@/lib/prisma";
import { DinasProjectReportPage } from "@/app/components/apps/projects/DinasProjectReportPage";

export const metadata: Metadata = {
  title: "Laporan Dinas Terkait | Master Proyek",
  description:
    "Rekapitulasi Realisasi Fisik Pelaksanaan Kegiatan Konstruksi & Olah Lahan Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026",
};

export default async function DinasReportRoute() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const projects = await prisma.project.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      code: true,
      name: true,
      title: true,
      kelompokTani: true,
      jenisPekerjaan: true,
      status: true,
      progress: true,
      pagu: true,
      startDate: true,
      endDate: true,
      fieldPic: {
        select: { name: true },
      },
      location: true,
      address: true,
      clientName: true,
      vendor: true,
      dailyReports: {
        orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          reportDate: true,
          progress: true,
          workSummary: true,
          weather: true,
          workersCount: true,
          notes: true,
          progressPhotos: {
            select: { url: true, fileUrl: true },
          },
        },
      },
      progressSubmissions: {
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          periodType: true,
          periodLabel: true,
          actualProgress: true,
          plannedProgress: true,
          deviation: true,
          submittedAt: true,
        },
      },
      workPoints: {
        select: {
          id: true,
          title: true,
          proposedVolume: true,
          completedVolume: true,
          proposedUnit: true,
          proposedUnitPrice: true,
          progress: true,
        },
      },
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <DinasProjectReportPage projects={projects} />
    </div>
  );
}
