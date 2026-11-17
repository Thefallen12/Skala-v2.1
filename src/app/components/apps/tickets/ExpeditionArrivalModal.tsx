"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { receiveExpeditionDeliveryOrder } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Label } from "@/components/ui/label";
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

  const resetAndClose = () => {
    setPhoto(null);
    setMessage("");
    onOpenChange(false);
  };

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
        if (result.success) {
          toast.success(result.message);
          setPhoto(null);
          setMessage("");
          onOpenChange(false);
          onSuccess();
        } else {
          setMessage(result.message);
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Expedition arrival confirmation failed:", error);
        const errorMsg =
          error instanceof Error && error.message
            ? error.message
            : "Penerimaan material gagal. Silakan coba kembali.";
        setMessage(errorMsg);
        toast.error(errorMsg);
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={resetAndClose}
      title="Terima Barang Ekspedisi"
      description={`Tiket ${ticketNumber} · DO ${doNumber}. Unggah foto saat material tiba untuk menyelesaikan DO dan tiket.`}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={resetAndClose}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="expedition-arrival-form"
            disabled={!photo || isPending}
          >
            {isPending ? "Menyimpan..." : "Terima Barang"}
          </Button>
        </>
      }
    >
      <form
        id="expedition-arrival-form"
        key={publicCode}
        className="space-y-4"
        onSubmit={submit}
      >
        <div className="space-y-2">
          <Label className="type-p2 font-medium">
            Foto Material Tiba <span className="text-destructive">*</span>
          </Label>
          <FileDropzone
            accept="image/*,.heic,.heif"
            multiple={false}
            maxSizeMb={5}
            capture="environment"
            disabled={isPending}
            files={photo ? [photo] : []}
            onFilesChange={(files) => {
              setPhoto(files[0] ?? null);
              setMessage("");
            }}
            onError={setMessage}
            label="Unggah Foto Material Tiba"
            hint="Format JPG, PNG, WEBP, atau HEIC maksimal 5 MB."
          />
          {photo && (
            <div className="flex items-center gap-2">
              <InvoiceFilePreview
                file={photo}
                title="Pratinjau Foto Material Tiba"
                label="Pratinjau foto"
                tooltip="Pratinjau foto material tiba"
              />
            </div>
          )}
        </div>

        {message && (
          <p className="type-p2 text-destructive" role="alert">
            {message}
          </p>
        )}
      </form>
    </GlobalModal>
  );
}
