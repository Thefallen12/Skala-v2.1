"use client";

import * as React from "react";
import { Camera, FileText, Image as ImageIcon, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FileDropzoneProps {
  accept?: string;
  multiple?: boolean;
  /** Aktifkan input kamera HP (`capture="environment"` atau `"user"`). */
  capture?: boolean | "environment" | "user";
  maxFiles?: number;
  maxSizeMb?: number;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  onError?: (message: string) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function FilePreviewRow({
  file,
  index,
  disabled,
  onRemove,
}: {
  file: File;
  index: number;
  disabled: boolean;
  onRemove: (fileIndex: number) => void;
}) {
  const isImage = file.type.startsWith("image/");

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {isImage ? (
            <ImageIcon className="size-4" aria-hidden="true" />
          ) : (
            <FileText className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="type-p2 truncate font-medium text-foreground">
            {file.name}
          </p>
          <p className="type-p3 text-muted-foreground tabular-nums">
            {formatBytes(file.size)}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-compact="true"
        disabled={disabled}
        aria-label={`Hapus ${file.name}`}
        onClick={() => onRemove(index)}
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}

export function FileDropzone({
  accept = "image/*,.pdf",
  multiple = false,
  capture = false,
  maxFiles,
  maxSizeMb,
  files = [],
  onFilesChange,
  onError,
  label = "Unggah Berkas",
  hint,
  disabled = false,
  id,
  className,
}: FileDropzoneProps) {
  const inputId = React.useId();
  const resolvedId = id ?? inputId;
  const browseInputRef = React.useRef<HTMLInputElement | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const captureMode =
    capture === true ? "environment" : capture === false ? undefined : capture;
  const supportsImage = accept.includes("image") || accept === "*";

  const processIncomingFiles = React.useCallback(
    (incomingList: FileList | null) => {
      if (!incomingList || incomingList.length === 0 || disabled) return;

      const incoming = Array.from(incomingList);
      const valid: File[] = [];

      for (const file of incoming) {
        if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
          onError?.(`Ukuran "${file.name}" melebihi batas ${maxSizeMb} MB.`);
          continue;
        }
        valid.push(file);
      }

      if (valid.length === 0) return;

      if (!multiple) {
        onFilesChange?.([valid[0]]);
        return;
      }

      const combined = [...files, ...valid];
      if (maxFiles && combined.length > maxFiles) {
        onError?.(`Maksimal ${maxFiles} berkas yang dapat diunggah.`);
        onFilesChange?.(combined.slice(0, maxFiles));
        return;
      }
      onFilesChange?.(combined);
    },
    [disabled, files, maxFiles, maxSizeMb, multiple, onError, onFilesChange],
  );

  const handleRemoveFile = (index: number) => {
    onFilesChange?.(files.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    processIncomingFiles(event.dataTransfer.files);
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card/50 hover:border-primary/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          id={resolvedId}
          ref={browseInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            processIncomingFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {captureMode && supportsImage ? (
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture={captureMode}
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              processIncomingFiles(event.target.files);
              event.target.value = "";
            }}
          />
        ) : null}

        <span className="mb-2.5 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Upload className="size-5" aria-hidden="true" />
        </span>

        <p className="type-p2 font-semibold text-foreground">{label}</p>
        <p className="type-p3 mt-0.5 text-muted-foreground">
          {hint ??
            (maxSizeMb
              ? `Seret berkas ke sini atau pilih manual (maks. ${maxSizeMb} MB).`
              : "Seret berkas ke sini atau pilih dari perangkat.")}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => browseInputRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden="true" />
            Pilih Berkas
          </Button>
          {captureMode && supportsImage ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="size-3.5" aria-hidden="true" />
              Ambil Foto
            </Button>
          ) : null}
        </div>
      </div>

      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <FilePreviewRow
              key={`${file.name}-${file.size}-${index}`}
              file={file}
              index={index}
              disabled={disabled}
              onRemove={handleRemoveFile}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
