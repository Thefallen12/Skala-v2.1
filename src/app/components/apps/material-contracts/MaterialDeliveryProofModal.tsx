"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";

export default function MaterialDeliveryProofModal({
  preview,
  onClose,
}: {
  preview: { title: string; url: string } | null;
  onClose: () => void;
}) {
  const isPdf = preview?.url.toLowerCase().includes(".pdf") ?? false;

  return (
    <GlobalModal
      isOpen={Boolean(preview)}
      onClose={onClose}
      title={preview?.title ?? "Bukti Surat Jalan"}
      description="Verifikasi lampiran fisik dari lapangan / vendor."
      className="sm:max-w-2xl"
    >
      {preview && (
        <div className="space-y-4">
          {isPdf ? (
            <div className="space-y-3">
              <iframe
                src={preview.url}
                title={preview.title}
                className="h-[60vh] w-full rounded-lg border border-border"
              />
            </div>
          ) : (
            <div className="flex max-h-[65vh] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
              <Image
                src={preview.url}
                alt={preview.title}
                width={1200}
                height={900}
                unoptimized
                className="max-h-[62vh] w-auto rounded object-contain"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <a href={preview.url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 size-4" />
                Buka di Tab Baru
              </a>
            </Button>
            <Button type="button" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      )}
    </GlobalModal>
  );
}
