"use client";
import { FormLabel } from "@/components/ui/label"

import { useState, useTransition, type FormEvent } from "react";
import { processMoverDelivery } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { compressFieldImageFile } from "@/lib/image-compression-client";

export default function MoverActionModal({
  open,
  ticketId,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  ticketId: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setMessage("");
    startTransition(async () => {
      try {
        const preparedFile = await compressFieldImageFile(file, {
          allowPdfPassthrough: true,
        });
        const result = await processMoverDelivery(ticketId, preparedFile);
        setMessage(result.message);
        if (result.success) {
          setFile(null);
          onOpenChange(false);
          onSuccess();
        }
      } catch (error) {
        console.error("Mover ticket action failed:", error);
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "Konfirmasi pengiriman gagal. Silakan coba kembali.",
        );
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        setFile(null);
        setMessage("");
        onOpenChange(false);
      }}
      title="Konfirmasi Barang Tiba di Lokasi"
      description="Unggah bukti foto serah terima barang di lapangan. File PDF, JPG, PNG, atau WEBP maksimal 5 MB."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setFile(null);
              setMessage("");
              onOpenChange(false);
            }}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="mover-action-form"
            disabled={!file || isPending}
          >
            {isPending ? "Menyimpan..." : "Konfirmasi & Selesaikan Tiket"}
          </Button>
        </div>
      }
    >
      <form id="mover-action-form" key={ticketId} className="space-y-4" onSubmit={submit}>
        <FormLabel className="block space-y-2 text-sm font-medium">
          Unggah Foto Barang Tiba / Bukti DO
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
              disabled={isPending}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <InvoiceFilePreview
              file={file}
              title="Pratinjau Foto Serah Terima"
              label="Pratinjau foto serah terima"
              tooltip="Pratinjau foto serah terima"
            />
          </div>
        </FormLabel>
        {message && (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </form>
    </GlobalModal>
  );
}
