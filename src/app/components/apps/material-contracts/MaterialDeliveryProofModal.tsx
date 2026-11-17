"use client";

import Image from "next/image";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { photoDownloadHref, withLocalPhotoPreview } from "@/lib/photo-urls";

export default function MaterialDeliveryProofModal({
  preview,
  onClose,
}: {
  preview: { title: string; url: string } | null;
  onClose: () => void;
}) {
  const [imageErrorUrl, setImageErrorUrl] = useState<string | null>(null);
  const previewUrl = preview?.url ?? "";
  const isPdf = previewUrl
    ? previewUrl.split(/[?#]/, 1)[0].toLowerCase().endsWith(".pdf")
    : false;
  const hasImageError = Boolean(previewUrl) && imageErrorUrl === previewUrl;

  return (
    <GlobalModal
      isOpen={Boolean(preview)}
      onClose={onClose}
      title={preview?.title ?? "Bukti Surat Jalan"}
      description="Verifikasi lampiran fisik dari lapangan / vendor."
      className="sm:max-w-2xl"
      footer={
        preview ? (
          <>
            <Button type="button" variant="outline" asChild>
              <a
                href={photoDownloadHref(preview.url)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Buka Tab Baru
              </a>
            </Button>
            <Button type="button" onClick={onClose}>
              Tutup
            </Button>
          </>
        ) : undefined
      }
    >
      {preview ? (
        isPdf ? (
          <iframe
            src={withLocalPhotoPreview(preview.url)}
            title={preview.title}
            className="h-[60vh] w-full rounded-lg border border-border"
          />
        ) : hasImageError ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
            <p className="type-p2 text-muted-foreground">
              Pratinjau foto tidak dapat dimuat. Gunakan tombol Buka Tab Baru untuk melihat berkas asli.
            </p>
          </div>
        ) : (
          <div className="flex max-h-[65vh] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 p-2">
            <Image
              src={withLocalPhotoPreview(preview.url)}
              alt={preview.title}
              width={1200}
              height={900}
              unoptimized
              onError={() => setImageErrorUrl(preview.url)}
              className="max-h-[62vh] w-auto rounded object-contain"
            />
          </div>
        )
      ) : null}
    </GlobalModal>
  );
}
