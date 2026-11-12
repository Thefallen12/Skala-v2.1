"use client";

import { useState } from "react";
import { Download, Image as ImageIcon } from "lucide-react";
import type { ProjectDashboardRow } from "@/app/(DashboardLayout)/types/project";
import { Button } from "@/components/ui/button";
import {
  photoDownloadLabel,
  photoDownloadLinkProps,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";
import { GlobalModal } from "@/components/ui/global-modal";

export default function ProjectProgressHistoryModal({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectDashboardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  return (
    <>
      <GlobalModal
        isOpen={open}
        onClose={() => {
          setSelectedPhoto(null);
          onOpenChange(false);
        }}
        title="Riwayat Progres & Foto"
        description={`${project?.title ?? "Proyek"}. Foto dokumentasi laporan progres untuk pemeriksaan pekerjaan.`}
        className="sm:max-w-3xl"
      >

          {project?.progressReports.length ? (
            <div className="space-y-5">
              {project.progressReports.map((report) => (
                <section
                  key={report.id}
                  className="space-y-3 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-medium">
                        {new Date(`${report.reportDate}T00:00:00`).toLocaleDateString(
                          "id-ID",
                          {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          },
                        )}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Progres kumulatif: {report.progress ?? 0}%
                      </p>
                    </div>
                    {report.photoUrls.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {report.photoUrls.length} foto
                      </span>
                    )}
                  </div>
                  {report.workSummary && (
                    <p className="whitespace-pre-wrap text-sm">
                      {report.workSummary}
                    </p>
                  )}
                  {report.photoUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {report.photoUrls.map((photoUrl) => (
                        <div
                          key={photoUrl}
                          className="w-36 space-y-2"
                        >
                          <button
                            type="button"
                            className="block w-full overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            onClick={() => setSelectedPhoto(photoUrl)}
                            aria-label="Buka pratinjau foto progres"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={withLocalPhotoPreview(photoUrl)}
                              alt={`Foto progres ${report.reportDate}`}
                              className="h-28 w-full object-cover"
                            />
                          </button>
                          <Button asChild variant="outline" size="sm" className="w-full">
                            <a href={photoUrl} {...photoDownloadLinkProps(photoUrl)}>
                              <Download className="mr-2 size-4" aria-hidden="true" />
                              {photoDownloadLabel(photoUrl)}
                            </a>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="size-4" aria-hidden="true" />
                      Belum ada foto dokumentasi.
                    </p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada laporan progres untuk proyek ini.
            </p>
          )}
      </GlobalModal>
      <GlobalModal
        isOpen={selectedPhoto !== null}
        onClose={() => setSelectedPhoto(null)}
        title="Pratinjau foto progres"
        description={`Dokumentasi privat proyek ${project?.code ?? ""}.`}
        className="max-w-5xl"
      >
          {selectedPhoto && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={selectedPhoto}
                src={withLocalPhotoPreview(selectedPhoto)}
                alt={`Foto progres proyek ${project?.title}`}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <Button asChild variant="outline">
                <a
                  href={selectedPhoto}
                  {...photoDownloadLinkProps(selectedPhoto)}
                >
                  <Download className="mr-2 size-4" aria-hidden="true" />
                  {photoDownloadLabel(selectedPhoto)}
                </a>
              </Button>
            </div>
          )}
      </GlobalModal>
    </>
  );
}
