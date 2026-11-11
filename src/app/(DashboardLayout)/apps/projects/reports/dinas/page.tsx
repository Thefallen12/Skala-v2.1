import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "../../../../../../../auth";
import { DinasProjectReportPage } from "@/app/components/apps/projects/DinasProjectReportPage";

export const metadata: Metadata = {
  title: "Laporan Dinas Terkait | Master Proyek",
  description:
    "Rekapitulasi Realisasi Fisik Pelaksanaan Kegiatan Konstruksi & Olah Lahan Rehabilitasi Lahan Sawah Kabupaten Aceh Tengah T.A. 2026",
};

export default async function DinasReportRoute() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  return (
    <div className="p-4 md:p-6 space-y-6">
      <DinasProjectReportPage />
    </div>
  );
}
