"use client";
import { FormLabel } from "@/components/ui/label"

import { useState, useTransition, type FormEvent } from "react";
import { receiveExpeditionDeliveryOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { compressFieldImageFile } from "@/lib/image-compression-client";

export default function ExpeditionArrivalModal({
  open,
  publicCode,
  ticketNumber,
  doNumber,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  publicCode: string;
  ticketNumber: string;
  doNumber: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!photo) {
      setMessage("Unggah foto material tiba sebelum menyelesaikan tiket.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const preparedPhoto = await compressFieldImageFile(photo);
        const result = await receiveExpeditionDeliveryOrder(
          publicCode,
          preparedPhoto,
        );
        setMessage(result.message);
        if (result.success) {
          setPhoto(null);
          onOpenChange(false);
          onSuccess();
        }
      } catch (error) {
        console.error("Expedition arrival confirmation failed:", error);
        setMessage(
          error instanceof Error && error.message
            ? error.message
            : "Penerimaan material gagal. Silakan coba kembali.",
        );
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        setPhoto(null);
        setMessage("");
        onOpenChange(false);
      }}
      title="Terima Material & Selesaikan Tiket"
      description={`Tiket ${ticketNumber} · DO ${doNumber}. Unggah foto saat material tiba di gudang/lokasi. Status DO dan tiket akan diselesaikan bersama.`}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setPhoto(null);
              setMessage("");
              onOpenChange(false);
            }}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="expedition-arrival-form"
            disabled={!photo || isPending}
          >
            {isPending ? "Menyelesaikan..." : "Terima & Selesaikan Tiket"}
          </Button>
        </div>
      }
    >
      <form id="expedition-arrival-form" key={publicCode} className="space-y-4" onSubmit={submit}>
        <FormLabel className="block space-y-2 text-sm font-medium">
          Foto Bukti Material Tiba
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="image/*,.heic,.heif"
              required
              disabled={isPending}
              onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
            />
            <InvoiceFilePreview
              file={photo}
              title="Pratinjau Foto Material Tiba"
              label="Pratinjau foto material tiba"
              tooltip="Pratinjau foto material tiba"
            />
          </div>
        </FormLabel>
        <p className="text-xs text-muted-foreground">
          Format JPG, PNG, atau WEBP; maksimal 5 MB.
        </p>
        {message && (
          <p className="text-sm text-destructive" role="alert">
            {message}
          </p>
        )}
      </form>
    </GlobalModal>
  );
}
