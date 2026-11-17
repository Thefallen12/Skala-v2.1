"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { DOStatus } from "@prisma/client";
import { processMoverDelivery } from "@/app/actions/tickets";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import { compressFieldImageFile } from "@/lib/image-compression-client";

export default function MoverActionModal({
  open,
  ticketId,
  deliveryOrders,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  ticketId: string;
  deliveryOrders?: TicketRow["deliveryOrders"];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const activeDeliveryOrders = (deliveryOrders ?? []).filter(
    (order) =>
      order.status === DOStatus.PENDING || order.status === DOStatus.IN_TRANSIT,
  );
  const [selectedDoCode, setSelectedDoCode] = useState("");
  const [kilometerEnd, setKilometerEnd] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const resolvedDoCode =
    activeDeliveryOrders.find((order) => order.publicCode === selectedDoCode)
      ?.publicCode ??
    activeDeliveryOrders.find((order) => order.status === DOStatus.IN_TRANSIT)
      ?.publicCode ??
    activeDeliveryOrders[0]?.publicCode ??
    "";

  const resetForm = () => {
    setFile(null);
    setMessage("");
    setSelectedDoCode("");
    setKilometerEnd("");
    setReceiverName("");
    setNotes("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setMessage("Unggah bukti serah terima barang terlebih dahulu.");
      return;
    }
    setMessage("");
    const parsedKmEnd =
      kilometerEnd.trim().length > 0 ? Number(kilometerEnd.trim()) : undefined;
    if (
      parsedKmEnd !== undefined &&
      (!Number.isFinite(parsedKmEnd) || parsedKmEnd < 0)
    ) {
      setMessage("Kilometer akhir harus berupa angka valid.");
      return;
    }
    startTransition(async () => {
      try {
        const preparedFile = await compressFieldImageFile(file, {
          allowPdfPassthrough: true,
        });
        const result = await processMoverDelivery(ticketId, preparedFile, {
          deliveryOrderPublicCode: resolvedDoCode || undefined,
          kilometerEnd: parsedKmEnd,
          receiverName: receiverName.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        if (result.success) {
          toast.success(result.message);
          resetForm();
          onOpenChange(false);
          onSuccess();
        } else {
          setMessage(result.message);
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Mover ticket action failed:", error);
        const errorMsg =
          error instanceof Error && error.message
            ? error.message
            : "Konfirmasi pengiriman gagal. Silakan coba kembali.";
        setMessage(errorMsg);
        toast.error(errorMsg);
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        resetForm();
        onOpenChange(false);
      }}
      title="Konfirmasi Barang Tiba"
      description="Unggah foto serah terima barang di lokasi. File PDF, JPG, PNG, atau WEBP maksimal 5 MB."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              resetForm();
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
            {isPending ? "Menyimpan..." : "Konfirmasi Tiba"}
          </Button>
        </>
      }
    >
      <form
        id="mover-action-form"
        key={ticketId}
        className="space-y-4"
        onSubmit={submit}
      >
        {activeDeliveryOrders.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="mover-do-select" className="type-p2 font-medium">
              Surat Jalan Aktif
            </Label>
            <Select
              value={resolvedDoCode}
              onValueChange={setSelectedDoCode}
              disabled={isPending || activeDeliveryOrders.length <= 1}
            >
              <SelectTrigger id="mover-do-select" className="h-10 w-full">
                <SelectValue placeholder="Pilih Surat Jalan" />
              </SelectTrigger>
              <SelectContent>
                {activeDeliveryOrders.map((order) => (
                  <SelectItem key={order.publicCode} value={order.publicCode}>
                    {order.doNumber} ·{" "}
                    {order.status === DOStatus.IN_TRANSIT
                      ? "Dalam Perjalanan"
                      : "Siap Kirim"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mover-receiver-name" className="type-p2 font-medium">
              Nama Penerima
            </Label>
            <Input
              id="mover-receiver-name"
              value={receiverName}
              maxLength={120}
              placeholder="Nama penerima di lokasi"
              disabled={isPending}
              onChange={(event) => setReceiverName(event.target.value)}
            />
          </div>
          {activeDeliveryOrders.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="mover-km-end" className="type-p2 font-medium">
                Kilometer Akhir
              </Label>
              <Input
                id="mover-km-end"
                type="number"
                min={0}
                step="0.1"
                value={kilometerEnd}
                placeholder="Isi KM kendaraan saat tiba"
                disabled={isPending}
                onChange={(event) => setKilometerEnd(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mover-delivery-notes" className="type-p2 font-medium">
            Catatan Pengiriman
          </Label>
          <Textarea
            id="mover-delivery-notes"
            value={notes}
            maxLength={500}
            rows={2}
            placeholder="Catatan serah terima atau kondisi barang"
            disabled={isPending}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="type-p2 font-medium">
            Bukti Serah Terima <span className="text-destructive">*</span>
          </Label>
          <FileDropzone
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple={false}
            maxSizeMb={5}
            capture="environment"
            disabled={isPending}
            files={file ? [file] : []}
            onFilesChange={(files) => {
              setFile(files[0] ?? null);
              setMessage("");
            }}
            onError={setMessage}
            label="Unggah Foto / Bukti DO"
            hint="Format JPG, PNG, WEBP, atau PDF maksimal 5 MB."
          />
          {file && (
            <div className="flex items-center gap-2">
              <InvoiceFilePreview
                file={file}
                title="Pratinjau Foto Serah Terima"
                label="Pratinjau foto"
                tooltip="Pratinjau foto serah terima"
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
