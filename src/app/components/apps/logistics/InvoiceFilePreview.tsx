"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Eye } from "lucide-react";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { GlobalModal } from "@/components/ui/global-modal";

type LocalPreview = {
  file: File;
  url: string;
};

export default function InvoiceFilePreview({
  file,
  title = "Pratinjau Invoice / Bon",
  label = "Pratinjau invoice atau bon",
  tooltip = "Pratinjau invoice / bon",
}: {
  file: File | null;
  title?: string;
  label?: string;
  tooltip?: string;
}) {
  const [preview, setPreview] = useState<LocalPreview | null>(null);
  const previewRef = useRef<LocalPreview | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current?.file === file) {
        URL.revokeObjectURL(previewRef.current.url);
        previewRef.current = null;
      }
    };
  }, [file]);

  if (!file) return null;

  const isCurrentPreview = preview?.file === file;
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage =
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp)$/i.test(file.name);

  const closePreview = () => {
    if (previewRef.current?.file === file) {
      URL.revokeObjectURL(previewRef.current.url);
      previewRef.current = null;
    }
    setPreview(null);
  };

  return (
    <>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <ActionIconButton
          label={label}
          tooltip={tooltip}
          icon={Eye}
          onClick={() => {
            if (previewRef.current) {
              URL.revokeObjectURL(previewRef.current.url);
            }
            const nextPreview = {
              file,
              url: URL.createObjectURL(file),
            };
            previewRef.current = nextPreview;
            setPreview(nextPreview);
          }}
        />
        <span className="text-center text-[10px] leading-3 text-muted-foreground">
          Preview
        </span>
      </div>
      <GlobalModal
        isOpen={isCurrentPreview}
        onClose={closePreview}
        title={title}
        description={file.name}
        className="sm:max-w-5xl"
        bodyClassName="flex min-h-[50vh] items-center justify-center"
        footer={null}
        footerNote=""
      >
        {isCurrentPreview && preview ? (
          isPdf ? (
            <iframe
              key={preview.url}
              title={`Pratinjau ${file.name}`}
              src={preview.url}
              className="h-[70vh] w-full rounded-lg border bg-background"
            />
          ) : isImage ? (
            <Image
              key={preview.url}
              src={preview.url}
              alt={`Pratinjau ${file.name}`}
              width={1600}
              height={1200}
              unoptimized
              className="h-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
            />
          ) : (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Buka file di tab baru
            </a>
          )
        ) : null}
      </GlobalModal>
    </>
  );
}
