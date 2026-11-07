"use client";

import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type SingleFileProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  multiple?: false;
  disabled?: boolean;
};

type MultipleFileProps = {
  value: File[];
  onChange: (files: File[]) => void;
  multiple: true;
  disabled?: boolean;
};

export default function FinancePaymentProofUpload(
  props: SingleFileProps,
): ReactElement;
export default function FinancePaymentProofUpload(
  props: MultipleFileProps,
): ReactElement;
export default function FinancePaymentProofUpload(
  props: SingleFileProps | MultipleFileProps,
): ReactElement {
  const { disabled = false } = props;
  const multiple = props.multiple === true;
  const selectedFiles = Array.isArray(props.value)
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const onChange = (files: File[]) => {
    if (multiple) props.onChange(files);
    else props.onChange(files[0] ?? null);
  };
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();

  const removeFile = (fileToRemove: File) => {
    onChange(selectedFiles.filter((file) => file !== fileToRemove));
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple={multiple}
        disabled={disabled}
        required={!multiple && selectedFiles.length === 0}
        aria-describedby={helpId}
        onChange={(event) => {
          const newFiles = Array.from(event.target.files ?? []);
          if (multiple) event.target.value = "";
          if (newFiles.length === 0) return;

          let invalidType = false;
          const validFiles = newFiles.filter((file) => {
            if (ACCEPTED_TYPES.has(file.type)) return true;
            invalidType = true;
            return false;
          });
          const invalidSize = validFiles.some(
            (file) => file.size < 1 || file.size > MAX_FILE_SIZE,
          );
          const sizeValidFiles = validFiles.filter(
            (file) => file.size >= 1 && file.size <= MAX_FILE_SIZE,
          );
          if (!multiple && sizeValidFiles.length === 0) {
            event.target.value = "";
          }
          const availableSlots = multiple
            ? Math.max(0, MAX_FILES - selectedFiles.length)
            : 1;
          const acceptedFiles = sizeValidFiles.slice(0, availableSlots);
          const exceedsLimit =
            multiple && sizeValidFiles.length > availableSlots;
          onChange(
            multiple
              ? [...selectedFiles, ...acceptedFiles]
              : acceptedFiles,
          );
          setError(
            invalidType
              ? "Format file harus PDF, JPG, PNG, atau WEBP."
              : invalidSize
                ? "Ukuran setiap file harus lebih dari 0 dan maksimal 5 MB."
                : exceedsLimit
                  ? `Maksimal ${MAX_FILES} file bukti pembayaran.`
                  : "",
          );
        }}
      />
      {selectedFiles.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="File bukti pembayaran">
          {selectedFiles.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-muted-foreground" role="status">
                {file.name}
              </span>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto p-0 text-destructive"
                onClick={() => removeFile(file)}
                disabled={disabled}
              >
                Hapus
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p id={helpId} className="text-xs text-muted-foreground">
        {multiple
          ? `Pilih hingga ${MAX_FILES} file PDF, JPG, PNG, atau WEBP; maksimal 5 MB per file.`
          : "PDF, JPG, PNG, atau WEBP; maksimal 5 MB."}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
