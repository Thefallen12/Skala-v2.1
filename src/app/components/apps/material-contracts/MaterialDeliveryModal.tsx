"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Info,
  Loader2,
  Plus,
  Printer,
  Ticket,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  attachMaterialDeliveryProof,
  recordMaterialDelivery,
} from "@/app/actions/material-contracts";
import { getJakartaDateKey } from "@/lib/habit-date";
import { compressFieldImageFile } from "@/lib/image-compression-client";
import {
  calculateContractDeliverySubtotal,
  formatMaterialVolume,
  getMaterialDeliveryDocumentPreviewUrl,
  type ContractTicketDeliveryOption,
  type MaterialContractRow,
} from "@/lib/material-contracts";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import UniversalDocumentPreview from "@/components/documents/UniversalDocumentPreview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export type PrintableMaterialDelivery = {
  id: string;
  publicCode?: string | null;
  doNumber: string;
  deliveryDate?: string;
  materialType?: string;
  vendorName?: string;
  quantityReceived?: number;
  unit?: string;
};

export type AttachableMaterialDelivery = {
  id: string;
  publicCode?: string | null;
  doNumber: string;
  vehiclePlate: string | null;
  driverName: string | null;
  proofUrl: string | null;
  vendorName?: string;
  materialType?: string;
};

async function prepareMaterialProofFile(file: File): Promise<File> {
  try {
    return await compressFieldImageFile(file, {
      allowPdfPassthrough: true,
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
    });
  } catch (error) {
    console.error("Material delivery proof compression failed:", error);
    return file;
  }
}

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
    <MaterialDeliveryFormBody
      key={modalKey}
      open={open}
      onOpenChange={onOpenChange}
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
  );
}

function MaterialDeliveryFormBody({
  open,
  onOpenChange,
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [issuedDelivery, setIssuedDelivery] = useState<{
    id: string;
    publicCode: string | null;
    doNumber: string;
    materialType: string;
    vendorName: string;
    quantityReceived: number;
    unit: string;
    deliveryDate: string;
    projectLabel: string;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

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
      const prepared = await prepareMaterialProofFile(file);
      setProofFiles([prepared]);
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
    if (!contractId || !projectId || !deliveryDate) {
      toast.error("Kontrak, proyek tujuan, dan tanggal pengiriman wajib diisi.");
      return;
    }
    if (doNumber.trim().length > 0 && doNumber.trim().length < 2) {
      toast.error("Nomor Surat Jalan minimal 2 karakter jika diisi manual.");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      toast.error("Volume / jumlah rit harus lebih dari 0.");
      return;
    }

    const formData = new FormData();
    formData.set("contractId", contractId);
    formData.set("projectId", projectId);
    formData.set("ticketId", ticketId);
    formData.set("deliveryDate", deliveryDate);
    if (doNumber.trim()) {
      formData.set("doNumber", doNumber.trim());
    }
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
          if (result.id) {
            setIssuedDelivery({
              id: result.id,
              publicCode: result.publicCode ?? null,
              doNumber: result.doNumber ?? (doNumber.trim() || "Surat Jalan"),
              materialType: selectedContract?.materialType ?? "Material Alam",
              vendorName: selectedContract?.vendorName ?? "-",
              quantityReceived: parsedQty,
              unit: selectedContract?.unit ?? "RIT",
              deliveryDate,
              projectLabel: resolvedProjectLabel,
            });
          } else {
            onClose();
          }
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Record material delivery failed:", error);
        toast.error("Gagal menerbitkan Surat Jalan material. Silakan coba lagi.");
      }
    });
  };

  const formId = "material-delivery-create-form";

  const resolvedProjectLabel = (() => {
    const targetId = selectedTicket?.projectId || projectId;
    const match = projects.find((p) => p.id === targetId);
    if (match) return `${match.kelompokTani} · ${match.title}`;
    return selectedTicket?.projectName ?? "Proyek Terkait Tiket";
  })();

  const isEmptyState =
    activeContracts.length === 0 || availableTickets.length === 0;

  const modalFooter = isEmptyState ? (
    <Button type="button" variant="outline" onClick={onClose}>
      Tutup
    </Button>
  ) : issuedDelivery ? (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setIssuedDelivery(null);
          setDoNumber("");
          setVehiclePlate("");
          setDriverName("");
          setNotes("");
          setProofFiles([]);
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Terbitkan Lagi
      </Button>
      <Button type="button" variant="outline" onClick={onClose}>
        Selesai
      </Button>
      <Button type="button" onClick={() => setPreviewOpen(true)}>
        <Printer className="size-4" aria-hidden="true" />
        Pratinjau / Cetak SJ
      </Button>
    </>
  ) : (
    <>
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
        form={formId}
        disabled={isPending || isCompressing || !ticketId.trim()}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Menerbitkan...
          </>
        ) : (
          "Terbitkan Surat Jalan"
        )}
      </Button>
    </>
  );

  return (
    <>
      <GlobalModal
        isOpen={open}
        onClose={onClose}
        onOpenChange={onOpenChange}
        title="Terbitkan Surat Jalan Material Alam"
        description="Penerbitan Surat Jalan resmi untuk material alam (batu, pasir, sirtu, tanah urug) berdasarkan Kontrak Payung."
        className="sm:max-w-xl"
        footer={modalFooter}
      >
        {activeContracts.length === 0 ? (
          <EmptyState
            title="Belum Ada Kontrak Aktif"
            description="Logistik atau Administrasi perlu membuat Kontrak Payung Material Alam yang aktif sebelum mencatat Surat Jalan."
          />
        ) : availableTickets.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="Belum Ada Tiket Material Alam Aktif"
            description="Surat Jalan Material Alam wajib ditautkan ke tiket permintaan aktif dari Tim Lapangan."
          />
        ) : issuedDelivery ? (
          <div className="space-y-4">
            <Alert
              variant="lightsuccess"
              className="border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-emerald-900 sm:py-3.5 dark:text-emerald-100"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <AlertTitle>
                Surat Jalan {issuedDelivery.doNumber} Berhasil Diterbitkan
              </AlertTitle>
              <AlertDescription className="text-emerald-900/90 dark:text-emerald-100/90">
                Dokumen resmi siap dicetak atau dibagikan ke vendor / tim
                lapangan. Lampiran foto dan info armada vendor dapat dilengkapi
                menyusul jika belum tersedia saat ini.
              </AlertDescription>
            </Alert>

            <dl className="type-p2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 p-3 sm:p-3.5">
              <dt className="text-muted-foreground">No. Surat Jalan</dt>
              <dd className="text-right font-mono font-bold text-primary">
                {issuedDelivery.doNumber}
              </dd>
              <dt className="text-muted-foreground">Material &amp; Volume</dt>
              <dd className="text-right font-semibold">
                {issuedDelivery.materialType} ·{" "}
                {formatMaterialVolume(
                  issuedDelivery.quantityReceived,
                  issuedDelivery.unit,
                )}
              </dd>
              <dt className="text-muted-foreground">Vendor Kontrak</dt>
              <dd className="text-right font-medium">
                {issuedDelivery.vendorName}
              </dd>
              <dt className="text-muted-foreground">Armada &amp; Mover</dt>
              <dd className="text-right font-medium">
                Disediakan Vendor Sendiri
              </dd>
              <dt className="text-muted-foreground">Proyek Tujuan</dt>
              <dd className="text-right font-medium">
                {issuedDelivery.projectLabel}
              </dd>
              <dt className="text-muted-foreground">Tanggal</dt>
              <dd className="text-right tabular-nums">
                {issuedDelivery.deliveryDate}
              </dd>
            </dl>
          </div>
        ) : (
          <form id={formId} onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
            <Alert
              variant="lightinfo"
              className="border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sky-900 sm:px-4 sm:py-3.5 dark:text-sky-100"
            >
              <Info className="size-4" aria-hidden="true" />
              <AlertTitle>Armada &amp; Mover Disediakan Vendor</AlertTitle>
              <AlertDescription className="text-xs leading-snug text-sky-900/90 sm:text-sm dark:text-sky-100/90">
                Armada &amp; mover disediakan vendor kontrak payung. Plat nomor,
                supir, dan foto bukti bersifat opsional.
              </AlertDescription>
            </Alert>

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
                <SelectTrigger id="md-contract" className="w-full [&>span]:truncate">
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

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="md-do-number" className="type-p2 font-medium">
                  <span className="sm:hidden">No. SJ (Opsional)</span>
                  <span className="hidden sm:inline">
                    Nomor Surat Jalan{" "}
                    <span className="type-p3 font-normal text-muted-foreground">
                      (Opsional)
                    </span>
                  </span>
                </Label>
                <Input
                  id="md-do-number"
                  placeholder="Otomatis jika kosong"
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
                  placeholder="Mis. 2 atau 6.5"
                  value={quantityReceived}
                  onChange={(event) => setQuantityReceived(event.target.value)}
                />
              </div>
            </div>

            {estimatedSubtotal > 0 && selectedContract && (
              <div className="type-p3 flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                <span className="min-w-0 truncate text-emerald-800 dark:text-emerald-200">
                  Nilai SJ ({parsedQty} {selectedContract.unit} &times;{" "}
                  {currency(selectedContract.unitPrice)})
                </span>
                <span className="shrink-0 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {currency(estimatedSubtotal)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="md-plate" className="type-p2 font-medium">
                  <span className="sm:hidden">Plat Truk (Opsional)</span>
                  <span className="hidden sm:inline">
                    Plat Nomor Truk Vendor{" "}
                    <span className="type-p3 font-normal text-muted-foreground">
                      (Opsional)
                    </span>
                  </span>
                </Label>
                <Input
                  id="md-plate"
                  placeholder="Mis. B 9123 KDA"
                  value={vehiclePlate}
                  onChange={(event) => setVehiclePlate(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="md-driver" className="type-p2 font-medium">
                  <span className="sm:hidden">Nama Supir (Opsional)</span>
                  <span className="hidden sm:inline">
                    Nama Supir Vendor{" "}
                    <span className="type-p3 font-normal text-muted-foreground">
                      (Opsional)
                    </span>
                  </span>
                </Label>
                <Input
                  id="md-driver"
                  placeholder="Nama supir / mover"
                  value={driverName}
                  onChange={(event) => setDriverName(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="md-proof" className="type-p2 font-medium">
                Foto / PDF Bukti Surat Jalan{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  (Opsional — bisa menyusul)
                </span>
              </Label>
              <FileDropzone
                id="md-proof"
                accept="image/*,.heic,.heif,.pdf,application/pdf"
                capture="environment"
                maxFiles={1}
                maxSizeMb={5}
                files={proofFiles}
                disabled={isCompressing || isPending}
                label={isCompressing ? "Mengompres foto..." : "Unggah Foto / PDF Bukti (Opsional)"}
                hint="JPG, PNG, WEBP, atau PDF maks. 5 MB. Foto kamera otomatis dikompres."
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
          </form>
        )}
      </GlobalModal>

      {issuedDelivery && (
        <MaterialDeliveryPrintModal
          deliveries={previewOpen ? [issuedDelivery] : []}
          initialDeliveryId={issuedDelivery.id}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

/**
 * Reusable print/preview modal for official Material Alam Surat Jalan (kind=SJ).
 */
export function MaterialDeliveryPrintModal({
  deliveries,
  initialDeliveryId,
  onClose,
}: {
  deliveries: PrintableMaterialDelivery[];
  initialDeliveryId?: string;
  onClose: () => void;
}) {
  const modalKey = `${deliveries.map((d) => d.id).join(",")}:${initialDeliveryId ?? ""}`;

  return (
    <GlobalModal
      isOpen={deliveries.length > 0}
      onClose={onClose}
      title={
        deliveries[0]
          ? `Surat Jalan ${deliveries[0].doNumber}`
          : "Pratinjau Surat Jalan"
      }
      description="Pratinjau & cetak dokumen resmi Surat Jalan Material Alam."
      hideHeader
      footerNote=""
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      className="sm:max-w-3xl"
    >
      {deliveries.length > 0 && (
        <MaterialDeliveryPrintModalBody
          key={modalKey}
          deliveries={deliveries}
          initialDeliveryId={initialDeliveryId}
          onClose={onClose}
        />
      )}
    </GlobalModal>
  );
}

function MaterialDeliveryPrintModalBody({
  deliveries,
  initialDeliveryId,
  onClose,
}: {
  deliveries: PrintableMaterialDelivery[];
  initialDeliveryId?: string;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(
    () => initialDeliveryId || deliveries[0]?.id || "",
  );
  const activeDelivery =
    deliveries.find((d) => d.id === selectedId) ?? deliveries[0];

  if (!activeDelivery) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {deliveries.length > 1 && (
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/40 px-3 py-2 scrollbar-none">
          <span className="type-p3 mr-1 shrink-0 whitespace-nowrap font-medium text-muted-foreground">
            Pilih Surat Jalan:
          </span>
          {deliveries.map((item) => {
            const isActive = item.id === activeDelivery.id;
            return (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="h-7 shrink-0 whitespace-nowrap px-2.5 text-xs"
                onClick={() => setSelectedId(item.id)}
              >
                {item.doNumber}
                {item.quantityReceived !== undefined && item.unit
                  ? ` (${formatMaterialVolume(item.quantityReceived, item.unit)})`
                  : ""}
              </Button>
            );
          })}
        </div>
      )}
      <UniversalDocumentPreview
        title={`Surat Jalan ${activeDelivery.doNumber}`}
        documentNumber={activeDelivery.doNumber}
        toolbarLabel="Surat Jalan Material Alam · Armada Vendor"
        minimalToolbar
        src={getMaterialDeliveryDocumentPreviewUrl(activeDelivery)}
        onClose={onClose}
      />
    </div>
  );
}

/**
 * Reusable modal to attach/replace signed Surat Jalan proof photo/PDF and vendor fleet info.
 */
export function MaterialDeliveryAttachModal({
  delivery,
  onClose,
  onSaved,
}: {
  delivery: AttachableMaterialDelivery | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  if (!delivery) {
    return (
      <GlobalModal
        isOpen={false}
        onClose={onClose}
        title="Lampirkan Bukti Surat Jalan"
        description="Lengkapi atau perbarui foto/PDF Surat Jalan bertanda tangan serta plat nomor & nama supir vendor (semuanya opsional)."
        className="sm:max-w-lg"
      >
        {null}
      </GlobalModal>
    );
  }

  return (
    <MaterialDeliveryAttachModalBody
      key={delivery.id}
      delivery={delivery}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function MaterialDeliveryAttachModalBody({
  delivery,
  onClose,
  onSaved,
}: {
  delivery: AttachableMaterialDelivery;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vehiclePlate, setVehiclePlate] = useState(delivery.vehiclePlate ?? "");
  const [driverName, setDriverName] = useState(delivery.driverName ?? "");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);

  const hasChanges =
    Boolean(proofFiles[0]) ||
    vehiclePlate.trim() !== (delivery.vehiclePlate ?? "") ||
    driverName.trim() !== (delivery.driverName ?? "");

  const handleFilesChange = async (files: File[]) => {
    const file = files[0] ?? null;
    if (!file) {
      setProofFiles([]);
      return;
    }
    setIsCompressing(true);
    try {
      const prepared = await prepareMaterialProofFile(file);
      setProofFiles([prepared]);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || isCompressing) return;
    if (!hasChanges) {
      toast.error(
        "Pilih foto/PDF baru atau ubah plat nomor / nama supir vendor terlebih dahulu.",
      );
      return;
    }

    const formData = new FormData();
    formData.set("deliveryId", delivery.id);
    formData.set("vehiclePlate", vehiclePlate.trim());
    formData.set("driverName", driverName.trim());
    if (proofFiles[0]) {
      formData.set("proof", proofFiles[0]);
    }

    startTransition(async () => {
      try {
        const result = await attachMaterialDeliveryProof(formData);
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
        console.error("Attach material delivery proof failed:", error);
        toast.error("Gagal menyimpan bukti atau info armada Surat Jalan.");
      }
    });
  };

  const attachFormId = `material-delivery-attach-form-${delivery.id}`;

  return (
    <GlobalModal
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      title={`Lampiran SJ · ${delivery.doNumber}`}
      description="Lengkapi atau perbarui foto/PDF Surat Jalan bertanda tangan serta plat nomor & nama supir vendor (opsional)."
      className="sm:max-w-lg"
      footer={
        <>
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
            form={attachFormId}
            disabled={isPending || isCompressing || !hasChanges}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
                Menyimpan...
              </>
            ) : (
              <>
                <Upload className="mr-1.5 size-4" aria-hidden="true" />
                Simpan Lampiran
              </>
            )}
          </Button>
        </>
      }
    >
      <form id={attachFormId} onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="min-w-0">
            <p className="type-p2 font-semibold text-foreground">
              {delivery.doNumber}
            </p>
            {(delivery.materialType || delivery.vendorName) && (
              <p className="type-p3 text-muted-foreground">
                {[delivery.materialType, delivery.vendorName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <Badge variant={delivery.proofUrl ? "lightSuccess" : "lightWarning"}>
            {delivery.proofUrl ? "Bukti Terlampir" : "Belum Ada Bukti"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="attach-plate" className="type-p2 font-medium">
              <span className="sm:hidden">Plat Truk</span>
              <span className="hidden sm:inline">
                Plat Nomor Truk Vendor{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  (Opsional)
                </span>
              </span>
            </Label>
            <Input
              id="attach-plate"
              maxLength={40}
              placeholder="Contoh: B 9123 KDA"
              value={vehiclePlate}
              onChange={(event) => setVehiclePlate(event.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="attach-driver" className="type-p2 font-medium">
              <span className="sm:hidden">Nama Supir</span>
              <span className="hidden sm:inline">
                Nama Supir Vendor{" "}
                <span className="type-p3 font-normal text-muted-foreground">
                  (Opsional)
                </span>
              </span>
            </Label>
            <Input
              id="attach-driver"
              maxLength={80}
              placeholder="Nama supir / mover"
              value={driverName}
              onChange={(event) => setDriverName(event.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="attach-proof" className="type-p2 font-medium">
            {delivery.proofUrl
              ? "Ganti Foto / PDF Bukti Surat Jalan (Opsional)"
              : "Unggah Foto / PDF Surat Jalan Bertanda Tangan"}
          </Label>
          <FileDropzone
            id="attach-proof"
            accept="image/*,.heic,.heif,.pdf,application/pdf"
            capture="environment"
            maxFiles={1}
            maxSizeMb={5}
            files={proofFiles}
            disabled={isCompressing || isPending}
            label={
              isCompressing
                ? "Mengompres foto..."
                : delivery.proofUrl
                  ? "Pilih File Baru untuk Mengganti Bukti"
                  : "Unggah Foto / PDF Bukti Surat Jalan"
            }
            hint="JPG, PNG, WEBP, atau PDF maks. 5 MB. Kosongkan jika hanya memperbarui plat/supir."
            onFilesChange={(files) => void handleFilesChange(files)}
            onError={(err) => toast.error(err)}
          />
        </div>
      </form>
    </GlobalModal>
  );
}
