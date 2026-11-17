"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { recordMaterialDelivery } from "@/app/actions/material-contracts";
import { getJakartaDateKey } from "@/lib/habit-date";
import { compressFieldImageFile } from "@/lib/image-compression-client";
import {
  calculateContractDeliverySubtotal,
  formatMaterialVolume,
  type ContractTicketDeliveryOption,
  type MaterialContractRow,
} from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
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

export default function MaterialDeliveryModal({
  open,
  onOpenChange,
  contracts,
  projects,
  contractTickets = [],
  defaultContractId,
  defaultTicketId,
  lockedProjectId,
  lockedTicketId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contracts: MaterialContractRow[];
  projects: DeliveryProjectOption[];
  contractTickets?: ContractTicketDeliveryOption[];
  defaultContractId?: string;
  defaultTicketId?: string;
  lockedProjectId?: string;
  lockedTicketId?: string;
  onSaved?: () => void;
}) {
  const activeContracts = contracts.filter((contract) => contract.isActive);
  const modalKey = `${open ? "open" : "closed"}:${defaultContractId ?? ""}:${defaultTicketId ?? ""}:${lockedProjectId ?? ""}:${lockedTicketId ?? ""}`;

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onOpenChange={onOpenChange}
      title="Catat Surat Jalan Material"
      description="Pencatatan penerimaan material alam berdasarkan tiket lapangan aktif & kontrak payung."
      className="sm:max-w-xl"
    >
      <MaterialDeliveryFormBody
        key={modalKey}
        activeContracts={activeContracts}
        projects={projects}
        contractTickets={contractTickets}
        defaultContractId={defaultContractId}
        defaultTicketId={defaultTicketId}
        lockedProjectId={lockedProjectId}
        lockedTicketId={lockedTicketId}
        onClose={() => onOpenChange(false)}
        onSaved={onSaved}
      />
    </GlobalModal>
  );
}

function MaterialDeliveryFormBody({
  activeContracts,
  projects,
  contractTickets,
  defaultContractId,
  defaultTicketId,
  lockedProjectId,
  lockedTicketId,
  onClose,
  onSaved,
}: {
  activeContracts: MaterialContractRow[];
  projects: DeliveryProjectOption[];
  contractTickets: ContractTicketDeliveryOption[];
  defaultContractId?: string;
  defaultTicketId?: string;
  lockedProjectId?: string;
  lockedTicketId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const availableTickets = useMemo(() => {
    const projectFiltered = lockedProjectId
      ? contractTickets.filter((ticket) => ticket.projectId === lockedProjectId)
      : contractTickets;
    if (!defaultContractId || lockedTicketId || defaultTicketId) {
      return projectFiltered;
    }
    const matchingContractTickets = projectFiltered.filter((ticket) =>
      ticket.items.some((item) => item.materialContractId === defaultContractId),
    );
    return matchingContractTickets.length > 0
      ? matchingContractTickets
      : projectFiltered;
  }, [
    contractTickets,
    defaultContractId,
    defaultTicketId,
    lockedProjectId,
    lockedTicketId,
  ]);

  const initialTicketId = (() => {
    const candidateId = lockedTicketId || defaultTicketId || "";
    if (candidateId && availableTickets.some((t) => t.id === candidateId)) {
      return candidateId;
    }
    if (availableTickets.length === 1) {
      return availableTickets[0].id;
    }
    return "";
  })();

  const initialTicket =
    availableTickets.find((ticket) => ticket.id === initialTicketId) ?? null;
  const initialTicketItem =
    initialTicket?.items.find((item) => item.remainingQuantity > 0) ??
    initialTicket?.items[0] ??
    null;

  const [ticketId, setTicketId] = useState(initialTicketId);
  const [contractId, setContractId] = useState(() => {
    if (
      defaultContractId &&
      activeContracts.some((c) => c.id === defaultContractId)
    ) {
      return defaultContractId;
    }
    if (
      initialTicketItem &&
      activeContracts.some((c) => c.id === initialTicketItem.materialContractId)
    ) {
      return initialTicketItem.materialContractId;
    }
    return activeContracts[0]?.id ?? "";
  });
  const [projectId, setProjectId] = useState(
    () => lockedProjectId || initialTicket?.projectId || projects[0]?.id || "",
  );
  const [deliveryDate, setDeliveryDate] = useState(() => getJakartaDateKey());
  const [doNumber, setDoNumber] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [quantityReceived, setQuantityReceived] = useState(() =>
    initialTicketItem && initialTicketItem.remainingQuantity > 0
      ? String(initialTicketItem.remainingQuantity)
      : "",
  );
  const [notes, setNotes] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);

  const selectedTicket =
    availableTickets.find((ticket) => ticket.id === ticketId) ?? null;

  const selectableContracts = useMemo(() => {
    if (!selectedTicket || selectedTicket.items.length === 0) {
      return activeContracts;
    }
    const ticketContractIds = new Set(
      selectedTicket.items.map((item) => item.materialContractId),
    );
    const matched = activeContracts.filter((c) => ticketContractIds.has(c.id));
    return matched.length > 0 ? matched : activeContracts;
  }, [activeContracts, selectedTicket]);

  const selectedContract =
    selectableContracts.find((contract) => contract.id === contractId) ??
    activeContracts.find((contract) => contract.id === contractId) ??
    null;

  const ticketComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      availableTickets.map((ticket) => ({
        value: ticket.id,
        label: `${ticket.ticketNumber} · ${ticket.title}`,
        description: `${ticket.projectName} — ${ticket.items
          .map(
            (item) =>
              `${item.materialType} (sisa ${formatMaterialVolume(item.remainingQuantity, item.unit)})`,
          )
          .join(", ")}`,
        keywords: [
          ticket.ticketNumber,
          ticket.title,
          ticket.projectName,
          ...ticket.items.map(
            (item) => `${item.materialType} ${item.contractNumber}`,
          ),
        ],
      })),
    [availableTickets],
  );

  const parsedQty = Number(quantityReceived);
  const estimatedSubtotal =
    selectedContract && Number.isFinite(parsedQty) && parsedQty > 0
      ? calculateContractDeliverySubtotal(parsedQty, selectedContract.unitPrice)
      : 0;

  const handleTicketChange = (nextValue: string) => {
    setTicketId(nextValue);
    const matchedTicket = availableTickets.find(
      (ticket) => ticket.id === nextValue,
    );
    if (!matchedTicket) return;
    if (!lockedProjectId && matchedTicket.projectId) {
      setProjectId(matchedTicket.projectId);
    }
    const preferredItem =
      (defaultContractId
        ? matchedTicket.items.find(
            (item) => item.materialContractId === defaultContractId,
          )
        : undefined) ??
      matchedTicket.items.find((item) => item.remainingQuantity > 0) ??
      matchedTicket.items[0];
    if (
      preferredItem &&
      activeContracts.some((c) => c.id === preferredItem.materialContractId)
    ) {
      setContractId(preferredItem.materialContractId);
      if (preferredItem.remainingQuantity > 0) {
        setQuantityReceived(String(preferredItem.remainingQuantity));
      }
    }
  };

  const handleProofFilesChange = async (files: File[]) => {
    const file = files[0] ?? null;
    if (!file) {
      setProofFiles([]);
      return;
    }
    setIsCompressing(true);
    try {
      const prepared = await compressFieldImageFile(file, {
        allowPdfPassthrough: true,
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
      });
      setProofFiles([prepared]);
    } catch (error) {
      console.error("DO proof photo compression failed:", error);
      setProofFiles([file]);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || isCompressing) return;

    if (!ticketId.trim()) {
      toast.error("Pilih Tiket Material Alam aktif dari Tim Lapangan terlebih dahulu.");
      return;
    }
    if (!contractId || !projectId || !deliveryDate || !doNumber.trim()) {
      toast.error("Kontrak, proyek tujuan, tanggal, dan nomor Surat Jalan wajib diisi.");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      toast.error("Volume / jumlah rit diterima harus lebih dari 0.");
      return;
    }

    const formData = new FormData();
    formData.set("contractId", contractId);
    formData.set("projectId", projectId);
    formData.set("ticketId", ticketId);
    formData.set("deliveryDate", deliveryDate);
    formData.set("doNumber", doNumber.trim());
    formData.set("vehiclePlate", vehiclePlate.trim());
    formData.set("driverName", driverName.trim());
    formData.set("quantityReceived", String(parsedQty));
    formData.set("notes", notes.trim());
    if (proofFiles[0]) {
      formData.set("proof", proofFiles[0]);
    }

    startTransition(async () => {
      try {
        const result = await recordMaterialDelivery(formData);
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
          onSaved?.();
          onClose();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Record material delivery failed:", error);
        toast.error("Gagal mencatat Surat Jalan material. Silakan coba lagi.");
      }
    });
  };

  if (activeContracts.length === 0) {
    return (
      <EmptyState
        title="Belum Ada Kontrak Aktif"
        description="Logistik atau Administrasi perlu membuat Kontrak Payung Material Alam yang aktif sebelum mencatat Surat Jalan."
        action={
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
        }
      />
    );
  }

  if (availableTickets.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="Belum Ada Tiket Material Alam Aktif"
        description="Surat Jalan Material Alam wajib ditautkan ke tiket permintaan aktif dari Tim Lapangan."
        action={
          <Button type="button" variant="outline" onClick={onClose}>
            Tutup
          </Button>
        }
      />
    );
  }

  const resolvedProjectLabel = (() => {
    const targetId = selectedTicket?.projectId || projectId;
    const match = projects.find((p) => p.id === targetId);
    if (match) return `${match.kelompokTani} · ${match.title}`;
    return selectedTicket?.projectName ?? "Proyek Terkait Tiket";
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="md-ticket" className="type-p2 font-medium">
          Tiket Material Alam <span className="text-destructive">*</span>
        </Label>
        {lockedTicketId && selectedTicket ? (
          <Input
            id="md-ticket"
            readOnly
            value={`${selectedTicket.ticketNumber} · ${selectedTicket.title}`}
            className="bg-muted/50"
          />
        ) : (
          <Combobox
            id="md-ticket"
            options={ticketComboboxOptions}
            value={ticketId}
            onValueChange={handleTicketChange}
            placeholder="Pilih tiket material alam aktif..."
            searchPlaceholder="Cari nomor tiket, proyek, atau material..."
            emptyText="Tiket material alam aktif tidak ditemukan."
          />
        )}

        {selectedTicket ? (
          <div className="space-y-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sky-900 dark:text-sky-200">
            {selectedTicket.items.map((item) => (
              <div
                key={item.ticketItemId}
                className="type-p3 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="font-medium">
                  {item.materialType} ({item.contractNumber})
                </span>
                <span className="tabular-nums">
                  Diminta {formatMaterialVolume(item.requestedQuantity, item.unit)} ·
                  Terkirim {formatMaterialVolume(item.deliveredQuantity, item.unit)} ·
                  Sisa{" "}
                  <strong>
                    {formatMaterialVolume(item.remainingQuantity, item.unit)}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="type-p3 text-muted-foreground">
            Setiap Surat Jalan wajib ditautkan ke tiket permintaan dari Tim Lapangan.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="md-contract" className="type-p2 font-medium">
          Kontrak Payung Material <span className="text-destructive">*</span>
        </Label>
        <Select value={contractId} onValueChange={setContractId}>
          <SelectTrigger id="md-contract" className="w-full">
            <SelectValue placeholder="Pilih kontrak vendor..." />
          </SelectTrigger>
          <SelectContent>
            {selectableContracts.map((contract) => (
              <SelectItem key={contract.id} value={contract.id}>
                {contract.vendorName} · {contract.materialType} (
                {contract.contractNumber}) — {currency(contract.unitPrice)}/
                {contract.unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedContract && (
          <div className="type-p3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <Badge variant="outline">{selectedContract.materialType}</Badge>
            <span className="font-medium text-foreground">
              {selectedContract.vendorName}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {currency(selectedContract.unitPrice)} / {selectedContract.unit}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="md-project" className="type-p2 font-medium">
            Proyek Tujuan <span className="text-destructive">*</span>
          </Label>
          <Input
            id="md-project"
            readOnly
            value={resolvedProjectLabel}
            className="bg-muted/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="md-date" className="type-p2 font-medium">
            Tanggal Pengiriman <span className="text-destructive">*</span>
          </Label>
          <DatePicker
            id="md-date"
            value={deliveryDate}
            onValueChange={setDeliveryDate}
            placeholder="Pilih tanggal"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="md-do-number" className="type-p2 font-medium">
            Nomor Surat Jalan <span className="text-destructive">*</span>
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
          <Label htmlFor="md-qty" className="type-p2 font-medium">
            Volume ({selectedContract?.unit ?? "RIT"}){" "}
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
        <div className="type-p3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <span className="text-emerald-800 dark:text-emerald-200">
            Nilai DO ({parsedQty} {selectedContract.unit} &times;{" "}
            {currency(selectedContract.unitPrice)})
          </span>
          <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {currency(estimatedSubtotal)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="md-plate" className="type-p2 font-medium">
            Plat Nomor Truk
          </Label>
          <Input
            id="md-plate"
            placeholder="Contoh: B 9123 KDA"
            value={vehiclePlate}
            onChange={(event) => setVehiclePlate(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="md-driver" className="type-p2 font-medium">
            Nama Supir
          </Label>
          <Input
            id="md-driver"
            placeholder="Opsional"
            value={driverName}
            onChange={(event) => setDriverName(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="md-proof" className="type-p2 font-medium">
          Foto Surat Jalan Fisik
        </Label>
        <FileDropzone
          id="md-proof"
          accept="image/*,.heic,.heif,.pdf,application/pdf"
          capture="environment"
          maxFiles={1}
          maxSizeMb={10}
          files={proofFiles}
          disabled={isCompressing || isPending}
          label={isCompressing ? "Mengompres foto..." : "Unggah Foto Surat Jalan"}
          hint="JPG, PNG, WEBP, atau PDF. Foto kamera otomatis dikompres."
          onFilesChange={(files) => void handleProofFilesChange(files)}
          onError={(err) => toast.error(err)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="md-notes" className="type-p2 font-medium">
          Catatan Lokasi
        </Label>
        <Textarea
          id="md-notes"
          rows={2}
          placeholder="Mis. Turun di area Pintu Air Sekunder 2"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isPending}
        >
          Batal
        </Button>
        <Button
          type="submit"
          disabled={isPending || isCompressing || !ticketId.trim()}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Menyimpan...
            </>
          ) : (
            "Simpan Surat Jalan"
          )}
        </Button>
      </div>
    </form>
  );
}
