"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { replaceFinancePaymentProof } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  FINANCE_PROOF_ACCEPT_ALL,
  FINANCE_PROOF_ACCEPT_IMAGES,
  prepareFinanceProofFile,
} from "@/lib/finance-proof-client";

export type ReplacingProofTarget = {
  paymentTransactionId: string;
  existingProofUrl: string;
  proofIndex: number;
  label: string;
  buttonLabel?: string;
};

export default function FinancePaymentProofReplacement({
  paymentTransactionId,
  existingProofUrl,
  proofIndex,
  label,
  onSaved,
  buttonLabel = "Edit",
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  paymentTransactionId: string;
  existingProofUrl?: string;
  proofIndex?: number;
  label: string;
  onSaved: () => void;
  buttonLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpenState = (nextOpen: boolean) => {
    if (!nextOpen) {
      setProofFile(null);
      setMessage("");
    }
    if (!isControlled) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const submitReplacement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!proofFile) {
      setMessage("Pilih foto asli yang akan menggantikan bukti ini.");
      return;
    }
    if (!existingProofUrl || proofIndex === undefined) {
      setMessage("Bukti ini tidak dapat diedit dari tampilan ini.");
      return;
    }

    const selectedFile = proofFile;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await replaceFinancePaymentProof(
          paymentTransactionId,
          existingProofUrl,
          proofIndex,
          selectedFile,
        );
        if (!result.success) {
          setMessage(result.message);
          toast.error(result.message);
          return;
        }

        toast.success(result.message || "Bukti transfer berhasil diperbarui.");
        setOpenState(false);
        onSaved();
      } catch (error) {
        console.error("Finance payment proof replacement failed:", error);
        const errMsg = "Bukti transfer gagal diperbarui. Silakan coba kembali.";
        setMessage(errMsg);
        toast.error(errMsg);
      }
    });
  };

  const isImageMode = buttonLabel === "Edit";

  return (
    <>
      {showTrigger && !isControlled && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={(event) => {
            event.stopPropagation();
            setMessage("");
            setOpenState(true);
          }}
        >
          {buttonLabel}
        </Button>
      )}
      <GlobalModal
        isOpen={isOpen}
        onClose={() => {
          if (isPending) return;
          setOpenState(false);
        }}
        title={isImageMode ? "Ganti Foto Bukti" : "Unggah Ulang Bukti"}
        description={
          isImageMode
            ? `Pilih foto asli untuk menggantikan ${label}. Foto pengganti akan disimpan sebagai bukti baru.`
            : `Pilih berkas pengganti untuk ${label}. PDF disimpan sebagai aset privat.`
        }
        className="sm:max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenState(false)}
              disabled={isPending}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="finance-proof-replacement-form"
              disabled={isPending || isPreparing || !proofFile}
            >
              {isPending
                ? "Menyimpan..."
                : isPreparing
                  ? "Memproses..."
                  : "Simpan Bukti"}
            </Button>
          </>
        }
      >
        <form
          id="finance-proof-replacement-form"
          className="space-y-4"
          onSubmit={submitReplacement}
        >
          <FileDropzone
            accept={
              isImageMode
                ? FINANCE_PROOF_ACCEPT_IMAGES
                : FINANCE_PROOF_ACCEPT_ALL
            }
            capture="environment"
            maxFiles={1}
            maxSizeMb={5}
            files={proofFile ? [proofFile] : []}
            label={isImageMode ? "Pilih Foto Pengganti" : "Pilih Berkas Pengganti"}
            hint={
              isImageMode
                ? "JPG, PNG, WEBP, atau HEIC; maksimal 5 MB."
                : "PDF, JPG, PNG, WEBP, atau HEIC; maksimal 5 MB."
            }
            disabled={isPending || isPreparing}
            onError={(err) => setMessage(err)}
            onFilesChange={async (files) => {
              const rawFile = files[0] ?? null;
              if (!rawFile) {
                setProofFile(null);
                return;
              }
              setIsPreparing(true);
              setMessage("");
              try {
                const prepared = await prepareFinanceProofFile(rawFile, {
                  allowPdf: !isImageMode,
                });
                setProofFile(prepared);
              } catch (err) {
                setProofFile(null);
                setMessage(
                  err instanceof Error
                    ? err.message
                    : "Berkas bukti tidak valid.",
                );
              } finally {
                setIsPreparing(false);
              }
            }}
          />
          {message && (
            <p className="type-p2 text-destructive" role="alert">
              {message}
            </p>
          )}
        </form>
      </GlobalModal>
    </>
  );
}
