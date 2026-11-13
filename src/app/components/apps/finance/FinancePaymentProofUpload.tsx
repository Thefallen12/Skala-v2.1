"use client";

import { useId, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FINANCE_PROOF_ACCEPT_ALL,
  prepareFinanceProofFiles,
} from "@/lib/finance-proof-client";

const MAX_FILES = 5;

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
  const [isPreparing, setIsPreparing] = useState(false);
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
        accept={FINANCE_PROOF_ACCEPT_ALL}
        multiple={multiple}
        disabled={disabled || isPreparing}
        aria-describedby={helpId}
        onChange={async (event) => {
          const input = event.currentTarget;
          const newFiles = Array.from(input.files ?? []);
          if (newFiles.length === 0) return;

          setIsPreparing(true);
          setError("");
          try {
            const { prepared, error: prepError } = await prepareFinanceProofFiles(
              newFiles,
            );
            const availableSlots = multiple
              ? Math.max(0, MAX_FILES - selectedFiles.length)
              : 1;
            const acceptedFiles = prepared.slice(0, availableSlots);
            const exceedsLimit = multiple && prepared.length > availableSlots;

            if (multiple || acceptedFiles.length > 0) {
              onChange(
                multiple
                  ? [...selectedFiles, ...acceptedFiles]
                  : acceptedFiles,
              );
            } else {
              onChange([]);
            }

            setError(
              prepError
                ? prepError
                : exceedsLimit
                  ? `Maksimal ${MAX_FILES} file bukti pembayaran.`
                  : "",
            );
          } finally {
            setIsPreparing(false);
            if (multiple || inputRef.current?.files?.length) {
              input.value = "";
            }
          }
        }}
      />
      {isPreparing && (
        <p className="text-xs text-muted-foreground" role="status">
          Memproses file bukti agar kompatibel dan berukuran aman...
        </p>
      )}
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
          ? `Pilih hingga ${MAX_FILES} file PDF, JPG, PNG, WEBP, atau foto iPhone (HEIC); maksimal 5 MB per file (foto besar dikompres otomatis).`
          : "PDF, JPG, PNG, WEBP, atau foto iPhone (HEIC); maksimal 5 MB."}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
