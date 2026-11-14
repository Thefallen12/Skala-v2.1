"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2, Upload } from "lucide-react";
import { recordMaterialDelivery } from "@/app/actions/material-contracts";
import { compressFieldImageFile } from "@/lib/image-compression-client";
import {
  calculateContractDeliverySubtotal,
  type MaterialContractRow,
} from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export type DeliveryProjectOption = {
  id: string;
  title: string;
  kelompokTani: string;
};

function currency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getLocalTodayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function MaterialDeliveryModal({
  open,
  onOpenChange,
  contracts,
  projects,
  defaultContractId,
  lockedProjectId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contracts: MaterialContractRow[];
  projects: DeliveryProjectOption[];
  defaultContractId?: string;
  lockedProjectId?: string;
  onSaved?: () => void;
}) {
  const activeContracts = contracts.filter((contract) => contract.isActive);
  const modalKey = `${open ? "open" : "closed"}:${defaultContractId ?? ""}:${lockedProjectId ?? ""}`;

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onOpenChange={onOpenChange}
      title="Catat Surat Jalan Material Curah (DO)"
      description="Pencatatan penerimaan pasir/batu berdasarkan Kontrak Payung. Status awal otomatis UNBILLED untuk ditarik Keuangan saat vendor menagih."
      className="sm:max-w-xl"
    >
      <MaterialDeliveryFormBody
        key={modalKey}
        activeContracts={activeContracts}
        projects={projects}
        defaultContractId={defaultContractId}
        lockedProjectId={lockedProjectId}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    </GlobalModal>
  );
}

function MaterialDeliveryFormBody({
  activeContracts,
  projects,
  defaultContractId,
  lockedProjectId,
  onClose,
  onSaved,
}: {
  activeContracts: MaterialContractRow[];
  projects: DeliveryProjectOption[];
  defaultContractId?: string;
  lockedProjectId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [contractId, setContractId] = useState(() => {
    if (
      defaultContractId &&
      activeContracts.some((c) => c.id === defaultContractId)
    ) {
      return defaultContractId;
    }
    return activeContracts[0]?.id ?? "";
  });
  const [projectId, setProjectId] = useState(
    () => lockedProjectId || projects[0]?.id || "",
  );
  const [deliveryDate, setDeliveryDate] = useState(() => getLocalTodayIsoDate());
  const [doNumber, setDoNumber] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [quantityReceived, setQuantityReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const selectedContract =
    activeContracts.find((contract) => contract.id === contractId) ?? null;
  const parsedQty = Number(quantityReceived);
  const estimatedSubtotal =
    selectedContract && Number.isFinite(parsedQty) && parsedQty > 0
      ? calculateContractDeliverySubtotal(parsedQty, selectedContract.unitPrice)
      : 0;

  const handleFileChange = async (file: File | null) => {
    if (!file) {
      setProofFile(null);
      return;
    }
    setIsCompressing(true);
    setMessage("");
    setIsError(false);
    try {
      const prepared = await compressFieldImageFile(file, {
        allowPdfPassthrough: true,
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
      });
      setProofFile(prepared);
    } catch (error) {
      console.error("DO proof photo compression failed:", error);
      setProofFile(file);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || isCompressing) return;

    if (!contractId || !projectId || !doNumber.trim()) {
      setMessage("Kontrak, proyek tujuan, dan nomor Surat Jalan wajib diisi.");
      setIsError(true);
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setMessage("Volume / jumlah rit diterima harus lebih dari 0.");
      setIsError(true);
      return;
    }

    const formData = new FormData();
    formData.set("contractId", contractId);
    formData.set("projectId", projectId);
    formData.set("deliveryDate", deliveryDate);
    formData.set("doNumber", doNumber.trim());
    formData.set("vehiclePlate", vehiclePlate.trim());
    formData.set("driverName", driverName.trim());
    formData.set("quantityReceived", String(parsedQty));
    formData.set("notes", notes.trim());
    if (proofFile) {
      formData.set("proof", proofFile);
    }

    setMessage("");
    setIsError(false);

    startTransition(async () => {
      try {
        const result = await recordMaterialDelivery(formData);
        setMessage(result.message);
        setIsError(!result.success);
        if (result.success) {
          requestNotificationFeedRefresh();
          router.refresh();
          onSaved?.();
          onClose();
        }
      } catch (error) {
        console.error("Record material delivery failed:", error);
        setMessage("Gagal mencatat Surat Jalan material. Silakan coba lagi.");
        setIsError(true);
      }
    });
  };

  if (activeContracts.length === 0) {
    return (
      <div className="space-y-4 py-2 text-sm">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
          Belum ada Kontrak Payung material curah yang aktif. Logistik atau
          Administrasi perlu membuat Kontrak Payung terlebih dahulu pada menu
          <strong> Logistik &rarr; Kontrak Curah</strong>.
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="md-contract">
          Kontrak Payung Material <span className="text-destructive">*</span>
        </Label>
        <Select value={contractId} onValueChange={setContractId}>
          <SelectTrigger id="md-contract">
            <SelectValue placeholder="Pilih kontrak vendor..." />
          </SelectTrigger>
          <SelectContent>
            {activeContracts.map((contract) => (
              <SelectItem key={contract.id} value={contract.id}>
                {contract.vendorName} · {contract.materialType} (
                {contract.contractNumber}) — {currency(contract.unitPrice)}/
                {contract.unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedContract && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs">
            <Badge variant="outline">{selectedContract.materialType}</Badge>
            <span className="font-medium text-foreground">
              {selectedContract.vendorName}
            </span>
            <span className="text-muted-foreground">
              Harga Kontrak: {currency(selectedContract.unitPrice)} /{" "}
              {selectedContract.unit}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="md-project">
            Lokasi Proyek Penerima <span className="text-destructive">*</span>
          </Label>
          {lockedProjectId ? (
            <Input
              id="md-project"
              readOnly
              value={(() => {
                const match = projects.find((p) => p.id === lockedProjectId);
                return match
                  ? `${match.kelompokTani} · ${match.title}`
                  : "Proyek Saat Ini";
              })()}
              className="bg-muted/50"
            />
          ) : (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="md-project">
                <SelectValue placeholder="Pilih proyek..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.kelompokTani} · {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="md-date">
            Tanggal Terima / Pengiriman <span className="text-destructive">*</span>
          </Label>
          <Input
            id="md-date"
            type="date"
            required
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="md-do-number">
            Nomor Surat Jalan (DO Vendor) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="md-do-number"
            required
            placeholder="Contoh: SJ-PM-0891"
            value={doNumber}
            onChange={(event) => setDoNumber(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="md-qty">
            Volume / Jumlah Diterima ({selectedContract?.unit ?? "RIT"}){" "}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="md-qty"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="Contoh: 2 atau 6.5"
            value={quantityReceived}
            onChange={(event) => setQuantityReceived(event.target.value)}
          />
        </div>
      </div>

      {estimatedSubtotal > 0 && selectedContract && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
          <span className="text-emerald-800 dark:text-emerald-200">
            Nilai DO Kontrak ({parsedQty} {selectedContract.unit} &times;{" "}
            {currency(selectedContract.unitPrice)})
          </span>
          <span className="font-bold text-emerald-700 dark:text-emerald-300">
            {currency(estimatedSubtotal)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="md-plate">Plat Nomor Truk</Label>
          <Input
            id="md-plate"
            placeholder="Contoh: B 9123 KDA"
            value={vehiclePlate}
            onChange={(event) => setVehiclePlate(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="md-driver">Nama Supir</Label>
          <Input
            id="md-driver"
            placeholder="Opsional"
            value={driverName}
            onChange={(event) => setDriverName(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="md-proof">Foto Bukti Surat Jalan Fisik</Label>
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <Input
            id="md-proof"
            type="file"
            accept="image/*,.heic,.heif,.pdf,application/pdf"
            disabled={isCompressing || isPending}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void handleFileChange(file);
            }}
          />
          {isCompressing && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Mengompres foto Surat Jalan agar ringan saat diunggah...
            </p>
          )}
          {proofFile && !isCompressing && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <FileCheck2 className="size-3.5" />
              Siap diunggah: {proofFile.name} (
              {Math.max(1, Math.round(proofFile.size / 1024))} KB)
            </p>
          )}
          {!proofFile && !isCompressing && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Upload className="size-3.5" />
              Foto kamera HP otomatis dikompres sebelum dikirim (JPG/PNG/WEBP/PDF).
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="md-notes">Catatan Lokasi / Kondisi Barang</Label>
        <Textarea
          id="md-notes"
          rows={2}
          placeholder="Mis. Turun di area Pintu Air Sekunder 2"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {message && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            isError
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Batal
        </Button>
        <Button type="submit" disabled={isPending || isCompressing}>
          {isPending ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" />
              Menyimpan DO...
            </>
          ) : (
            "Simpan Surat Jalan"
          )}
        </Button>
      </div>
    </form>
  );
}
