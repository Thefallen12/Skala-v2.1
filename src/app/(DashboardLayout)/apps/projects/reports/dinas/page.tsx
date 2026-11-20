import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../../auth";
import { parseAssetCode } from "@/lib/asset-codes";
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
          workPointId: true,
          workSummary: true,
          weather: true,
          workersCount: true,
          notes: true,
          k3SafetyLog: true,
          progressPhotos: {
            orderBy: { createdAt: "asc" },
            select: {
              url: true,
              fileUrl: true,
              publicId: true,
              assetCode: true,
              projectId: true,
            },
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
          progressReports: {
            orderBy: [{ reportDate: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              reportDate: true,
              progress: true,
              workSummary: true,
              photos: {
                orderBy: { createdAt: "asc" },
                select: {
                  url: true,
                  fileUrl: true,
                  publicId: true,
                  assetCode: true,
                  projectId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const serializedProjects = projects.map((project) => ({
    ...project,
    dailyReports: project.dailyReports.map((report) => ({
      ...report,
      progressPhotos: report.progressPhotos.map((photo) => ({
        ...photo,
        assetCode:
          photo.assetCode ??
          parseAssetCode(photo.publicId)?.assetCode ??
          parseAssetCode(photo.fileUrl)?.assetCode ??
          parseAssetCode(photo.url)?.assetCode ??
          null,
      })),
    })),
    workPoints: project.workPoints.map((wp) => ({
      ...wp,
      progressReports: wp.progressReports.map((pr) => ({
        ...pr,
        photos: pr.photos.map((photo) => ({
          ...photo,
          assetCode:
            photo.assetCode ??
            parseAssetCode(photo.publicId)?.assetCode ??
            parseAssetCode(photo.fileUrl)?.assetCode ??
            parseAssetCode(photo.url)?.assetCode ??
            null,
        })),
      })),
    })),
  }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <DinasProjectReportPage projects={serializedProjects} />
    </div>
  );
}
