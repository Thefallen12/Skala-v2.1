"use client";
import { FormLabel } from "@/components/ui/label"

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import {
  Check,
  CircleDollarSign,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FileText,
  PackageCheck,
  PackageOpen,
  Printer,
  Send,
  Truck,
} from "lucide-react";
import {
  checkTicketItemsStock,
  approveByDirector,
  fulfillTicketItemsFromStock,
  submitTicket,
  type TicketActionResult,
} from "@/app/actions/tickets";
import CreatePOForm from "@/app/components/forms/CreatePOForm";
import DirectStockPurchaseForm from "@/app/components/forms/DirectStockPurchaseForm";
import ExpeditionArrivalModal from "@/app/components/apps/tickets/ExpeditionArrivalModal";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import type { VehicleSummary } from "@/app/actions/vehicles";
import {
  FulfillmentStatus,
  DOStatus,
  PaymentType,
  POPaymentMethod,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { NativeDataTable } from "@/components/ui/native-data-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { GlobalModal } from "@/components/ui/global-modal";
import FinanceActionModal from "./FinanceActionModal";
import LogisticsActionModal from "./LogisticsActionModal";
import MoverActionModal from "./MoverActionModal";
import TicketManagementActions from "./TicketManagementActions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  photoDownloadHref,
  photoDownloadLabel,
  photoDownloadLinkProps,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";
import { printUrlInFrame } from "@/lib/print-url";
import type { VendorBankAccountOption } from "@/lib/vendor-bank-accounts";

const statusLabels: Record<TicketStatus, string> = {
  DRAFT: "Draft",
  PENDING_DIRECTOR: "Menunggu persetujuan Direktur",
  APPROVED_DIR: "Disetujui Direktur",
  PROCESSED_FINANCE: "Diproses Finance",
  PROCESSED_LOGISTIC: "Diproses Logistik",
  ASSIGNED_TO_MOVER: "Ditugaskan ke Mover",
  IN_TRANSIT: "Dalam perjalanan (ekspedisi)",
  WAITING_FINANCE_PAYMENT: "Menunggu pembayaran Finance",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

const nextStepLabels: Record<TicketStatus, string> = {
  DRAFT: "Pemohon perlu mengajukan tiket.",
  PENDING_DIRECTOR: "Menunggu Direktur menyetujui tiket.",
  APPROVED_DIR: "Menunggu Finance memproses kebutuhan.",
  PROCESSED_FINANCE: "Menunggu Logistik menyiapkan barang atau pengiriman.",
  PROCESSED_LOGISTIC: "Menunggu proses pengiriman atau konfirmasi kebutuhan.",
  ASSIGNED_TO_MOVER: "Menunggu Mover mengambil dan mengantar barang.",
  IN_TRANSIT: "Menunggu barang tiba dan diterima.",
  WAITING_FINANCE_PAYMENT: "Menunggu Finance melakukan pembayaran.",
  COMPLETED: "Seluruh proses tiket telah selesai.",
  REJECTED: "Tiket ditolak dan tidak dilanjutkan.",
};

const statusVariants: Record<
  TicketStatus,
  "gray" | "lightWarning" | "lightSuccess" | "lightInfo" | "lightError"
> = {
  DRAFT: "gray",
  PENDING_DIRECTOR: "lightWarning",
  APPROVED_DIR: "lightSuccess",
  PROCESSED_FINANCE: "lightInfo",
  PROCESSED_LOGISTIC: "lightInfo",
  ASSIGNED_TO_MOVER: "lightWarning",
  IN_TRANSIT: "lightInfo",
  WAITING_FINANCE_PAYMENT: "lightWarning",
  COMPLETED: "lightSuccess",
  REJECTED: "lightError",
};

const typeLabels = {
  MATERIAL: "Material",
  COST: "Biaya",
  OPERATIONAL: "Operasional",
} as const;

const requestCategoryLabels: Record<TicketRequestCategory, string> = {
  MATERIAL: "Material Proyek",
  WAREHOUSE: "Stok Gudang",
  FIELD: "Biaya Lapangan",
  OPS: "Dana Operasional",
  APH: "Permintaan APH",
  OFFICE: "Operasional Kantor",
  OPERATING_EXPENSE: "Biaya Operasional",
  KASBON: "Kasbon / Ambilan",
  REIMBURSEMENT: "Reimbursement",
  SHIPPING_COST: "Biaya Pengiriman",
};

function parseTicketDescription(description: string | null) {
  if (!description) {
    return { categoryFromDesc: null, notes: "", extraFields: [] as { label: string; value: string }[] };
  }
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let categoryFromDesc: string | null = null;
  const noteLines: string[] = [];
  const extraFields: { label: string; value: string }[] = [];

  for (const line of lines) {
    if (/^Jenis permintaan\s*:/i.test(line)) {
      categoryFromDesc = line.replace(/^Jenis permintaan\s*:\s*/i, "").trim();
      continue;
    }
    if (
      /^(Nominal pengajuan|Jumlah dana diminta|Biaya pengiriman|Jumlah dana|Metode pembayaran|Tujuan transfer)\s*:/i.test(
        line,
      )
    ) {
      // Already displayed in dedicated KPI / Payment cards
      continue;
    }
    if (/^Keterangan\s*:/i.test(line)) {
      const val = line.replace(/^Keterangan\s*:\s*/i, "").trim();
      if (val) noteLines.push(val);
      continue;
    }
    const kvMatch = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (kvMatch) {
      extraFields.push({ label: kvMatch[1].trim(), value: kvMatch[2].trim() });
    } else {
      noteLines.push(line);
    }
  }

  return {
    categoryFromDesc,
    notes: noteLines.join("\n"),
    extraFields,
  };
}

const priorityLabels = {
  LOW: "Rendah",
  MEDIUM: "Sedang",
  HIGH: "Tinggi",
  URGENT: "Mendesak",
} as const;

const auditActionLabels: Record<string, string> = {
  CREATED: "Draft dibuat",
  UPDATED: "Detail tiket diperbarui",
  SUBMITTED: "Diajukan ke Direktur",
  APPROVED_BY_DIR: "Disetujui Direktur",
  REJECTED_BY_DIR: "Ditolak Direktur",
  REVISION_REQUESTED_BY_DIR: "Diminta revisi oleh Direktur",
  LOGISTICS_READY_WAREHOUSE: "Stok gudang siap; ditugaskan ke Mover",
  LOGISTICS_SWITCHED_TO_PURCHASE: "Dialihkan ke pengadaan baru",
  LOGISTICS_BUY_STORE: "Dibeli di toko; diteruskan ke Keuangan",
  LOGISTICS_PO_CREATED: "PO dibuat; menunggu persetujuan",
  LOGISTICS_DIRECT_PURCHASE_CREATED: "Pembelian langsung ditautkan",
  DIRECT_PURCHASE_APPROVED: "Pembelian langsung disetujui Direktur",
  DIRECT_PURCHASE_PAYMENT: "Pembayaran pembelian langsung dicatat",
  DIRECT_PURCHASE_RECEIVED: "Pembelian langsung diterima Logistik",
  DOCUMENT_ISSUED: "Dokumen PO/DO diterbitkan",
  FINANCE_PAYMENT_COMPLETED: "Pembayaran diselesaikan",
  MOVER_DELIVERY_COMPLETED: "Barang diterima di lapangan",
  COMPLETED: "Pemrosesan selesai",
};

const formatCurrency = (amount: string | null) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(amount));

const warehouseInsufficientMessage =
  "Stok gudang tidak mencukupi untuk memenuhi permintaan ini.";

type DirectAction = {
  label: string;
  run: (ticket: TicketRow) => Promise<TicketActionResult>;
};

function actionFor(
  role: TicketPageRole,
  ticket: TicketRow,
): DirectAction | null {
  if (
    role === UserRole.DIRECTOR &&
    ticket.status === TicketStatus.PENDING_DIRECTOR
  ) {
    return {
      label: "Setujui",
      run: (currentTicket) =>
        approveByDirector(currentTicket.id, currentTicket.type),
    };
  }
  return null;
}

function workflowFor(
  role: TicketPageRole,
  ticket: TicketRow,
): "LOGISTICS" | "EXPEDITION_RECEIPT" | "FINANCE" | "MOVER" | null {
  if (
    role === UserRole.LOGISTICS &&
    ticket.type === TicketType.MATERIAL &&
    ticket.status === TicketStatus.IN_TRANSIT &&
    ticket.deliveryOrders?.some(
      (deliveryOrder) => deliveryOrder.status === DOStatus.IN_TRANSIT,
    )
  ) {
    return "EXPEDITION_RECEIPT";
  }
  if (
    role === UserRole.LOGISTICS &&
    ticket.type === TicketType.MATERIAL &&
    ticket.status === TicketStatus.PROCESSED_LOGISTIC &&
    ticket.fulfillmentStatus === "COMPLETED" &&
    ticket.purchaseOrders?.some((purchaseOrder) => purchaseOrder.paidAt) &&
    ticket.deliveryOrders?.length === 0
  ) {
    return "LOGISTICS";
  }
  if (
    role === UserRole.FINANCE &&
    (ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
      ticket.status === TicketStatus.PROCESSED_FINANCE)
  ) {
    return "FINANCE";
  }
  if (
    role === UserRole.MOVER &&
    ticket.status === TicketStatus.ASSIGNED_TO_MOVER
  ) {
    return "MOVER";
  }
  return null;
}

type TicketVendorOption = {
  id: string;
  name: string;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts?: VendorBankAccountOption[];
};

type TicketStockItemOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitPrice: string;
};

export default function TicketListing({
  tickets,
  projects,
  vendors = [],
  stockItems = [],
  vehicles = [],
  role,
  ticketSearch,
  searchTickets,
  hideSearch = false,
  initialOpenSheet,
}: {
  tickets: TicketRow[];
  projects: TicketProjectOption[];
  vendors?: TicketVendorOption[];
  stockItems?: TicketStockItemOption[];
  vehicles?: VehicleSummary[];
  role: TicketPageRole;
  ticketSearch: string;
  searchTickets: (term: string) => void;
  hideSearch?: boolean;
  initialOpenSheet?: string;
}) {
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(
    () => tickets.find((ticket) => ticket.id === initialOpenSheet) ?? null,
  );
  const [itemSelection, setItemSelection] = useState<{
    ticketId: string;
    itemIds: string[];
  } | null>(null);
  const [doDialogOpen, setDoDialogOpen] = useState(false);
  const [stockAvailability, setStockAvailability] = useState<
    NonNullable<TicketActionResult["stockAvailability"]>
  >([]);
  const [moverOptions, setMoverOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [vehicleOptions, setVehicleOptions] = useState<
    {
      id: string;
      plateNumber: string;
      vehicleType: string;
      brand: string | null;
      modelName: string | null;
    }[]
  >([]);
  const [selectedMoverId, setSelectedMoverId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [poDialogOpen, setPoDialogOpen] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<
    "PURCHASE_ORDER" | "DIRECT_PURCHASE"
  >("PURCHASE_ORDER");
  const [fulfillmentPending, setFulfillmentPending] = useState(false);
  const [fulfillmentMessage, setFulfillmentMessage] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [workflowTicket, setWorkflowTicket] = useState<TicketRow | null>(null);
  const [message, setMessage] = useState("");
  const [printMessage, setPrintMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedItemIds =
    selectedTicket && itemSelection?.ticketId === selectedTicket.id
      ? itemSelection.itemIds
      : [];

  const selectedTicketItems = selectedTicket
    ? selectedTicket.items.filter(
        (item) =>
          selectedItemIds.includes(item.id) &&
          item.status === FulfillmentStatus.PENDING,
      )
    : [];
  const readyTicketItemIds = stockAvailability
    .filter((item) => item.ready)
    .map((item) => item.ticketItemId);
  const readyStockItems =
    selectedTicket?.items.filter((item) =>
      readyTicketItemIds.includes(item.id),
    ) ?? [];
  const selectedStockItems =
    stockAvailability.length > 0 ? readyStockItems : selectedTicketItems;
  const needsOrderTicketItemIds = stockAvailability
    .filter((item) => !item.ready && !item.pendingPurchaseNumber)
    .map((item) => item.ticketItemId);
  const pendingTicketItemIds =
    selectedTicket?.items
      .filter((item) => item.status === FulfillmentStatus.PENDING)
      .map((item) => item.id) ?? [];
  const allPendingItemsSelected =
    pendingTicketItemIds.length > 0 &&
    pendingTicketItemIds.every((id) => selectedItemIds.includes(id));
  const somePendingItemsSelected =
    pendingTicketItemIds.some((id) => selectedItemIds.includes(id));
  const canSplitFulfillment =
    role === UserRole.LOGISTICS &&
    selectedTicket?.type === TicketType.MATERIAL &&
    selectedTicket.status === TicketStatus.PROCESSED_LOGISTIC;

  const openTicketSheet = (ticket: TicketRow) => {
    setItemSelection(null);
    setFulfillmentMessage("");
    setStockAvailability([]);
    setSelectedMoverId("");
    setSelectedTicket(ticket);
  };

  const closeTicketSheet = () => {
    setSelectedTicket(null);
    setItemSelection(null);
    setFulfillmentMessage("");
    if (initialOpenSheet) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("openSheet");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }
  };

  const fulfillSelectedItemsFromStock = async () => {
    if (!selectedTicket || readyStockItems.length === 0) return;
    if (!selectedMoverId || !selectedVehicleId) {
      setFulfillmentMessage("Pilih Mover dan kendaraan sebelum membuat DO.");
      return;
    }
    setFulfillmentPending(true);
    setFulfillmentMessage("");
    try {
      const result = await fulfillTicketItemsFromStock(
        selectedTicket.id,
        readyTicketItemIds,
        selectedMoverId,
        selectedVehicleId,
      );
      setFulfillmentMessage(result.message);
      if (result.success) {
        setDoDialogOpen(false);
        setStockAvailability([]);
        setSelectedTicket(null);
        setItemSelection(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Ticket stock fulfillment failed:", error);
      setFulfillmentMessage(
        "Pemenuhan stok gagal. Muat ulang tiket lalu coba kembali.",
      );
    } finally {
      setFulfillmentPending(false);
    }
  };

  const prepareWarehouseFulfillment = async () => {
    if (!selectedTicket || selectedStockItems.length === 0) return;
    setFulfillmentPending(true);
    setFulfillmentMessage("");
    setStockAvailability([]);
    setMoverOptions([]);
    setVehicleOptions([]);
    setSelectedMoverId("");
    setSelectedVehicleId("");
    try {
      const result = await checkTicketItemsStock(
        selectedTicket.id,
        selectedStockItems.map((item) => item.id),
      );
      if (!result.success) {
        setFulfillmentMessage(result.message);
        setDoDialogOpen(true);
      } else {
        setStockAvailability(result.stockAvailability ?? []);
        setItemSelection({
          ticketId: selectedTicket.id,
          itemIds: result.readyItemIds ?? [],
        });
        setMoverOptions(result.movers ?? []);
        setVehicleOptions(result.vehicles ?? []);
        setSelectedVehicleId(result.vehicles?.[0]?.id ?? "");
        setSelectedMoverId(
          result.movers?.some((mover) => mover.id === result.moverAssigneeId)
            ? result.moverAssigneeId ?? ""
            : "",
        );
        setDoDialogOpen(true);
      }
    } catch (error) {
      console.error("Ticket stock availability check failed:", error);
      setFulfillmentMessage("Saldo gudang gagal diperiksa. Silakan coba kembali.");
      setDoDialogOpen(true);
    } finally {
      setFulfillmentPending(false);
    }
  };

  const openPurchaseOrderForUnavailableItems = () => {
    if (!selectedTicket || needsOrderTicketItemIds.length === 0) return;
    const ticketId = selectedTicket.id;
    const itemIds = needsOrderTicketItemIds;
    setFulfillmentMessage("");
    setDoDialogOpen(false);
    setStockAvailability([]);
    setItemSelection({ ticketId, itemIds });
    setPurchaseMode("PURCHASE_ORDER");
    setPoDialogOpen(true);
  };

  const runAction = (
    ticket: TicketRow,
    action: ReturnType<typeof actionFor>,
  ) => {
    if (!action) return;
    setBusyId(ticket.id);
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action.run(ticket);
        setMessage(result.message);
        if (result.success) {
          setSelectedTicket(null);
          setItemSelection(null);
          router.refresh();
        }
      } catch (error) {
        console.error("Ticket workflow action failed:", error);
        setMessage("Aksi tiket gagal. Silakan muat ulang dan coba kembali.");
      } finally {
        setBusyId(null);
      }
    });
  };

  const printPurchaseOrder = async (ticketId: string, publicCode?: string) => {
    setPrintMessage("Menyiapkan PDF Purchase Order...");
    let pdfUrl: string | null = null;
    try {
      const response = publicCode
        ? await fetch(
            `/api/documents/transactions?kind=PO&publicCode=${encodeURIComponent(publicCode)}`,
          )
        : await fetch("/api/documents/po", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticketId }),
          });
      if (!response.ok) {
        const body: unknown = await response.json();
        const errorMessage =
          typeof body === "object" &&
          body !== null &&
          "message" in body &&
          typeof body.message === "string"
            ? body.message
            : "PDF PO gagal dibuat.";
        setPrintMessage(errorMessage);
        return;
      }
      pdfUrl = URL.createObjectURL(await response.blob());
      await printUrlInFrame(pdfUrl);
      setPrintMessage("");
    } catch (error) {
      console.error("Purchase order PDF download failed:", error);
      setPrintMessage("PDF PO gagal disiapkan untuk dicetak. Silakan coba kembali.");
    } finally {
      if (pdfUrl) {
        const urlToRevoke = pdfUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 60_000);
      }
    }
  };

  const getTicketStageNumber = (status: TicketStatus): 1 | 2 | 3 | 4 => {
    if (status === TicketStatus.DRAFT) return 1;
    if (status === TicketStatus.PENDING_DIRECTOR) return 2;
    if (status === TicketStatus.COMPLETED) return 4;
    return 3;
  };

  return (
    <div className="my-3">
      {!hideSearch && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-96">
            <Icon
              icon="tabler:search"
              height={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              className="h-9 pl-9 text-sm"
              value={ticketSearch}
              onChange={(event) => searchTickets(event.target.value)}
              placeholder="Cari nomor tiket, judul permintaan, proyek, atau pemohon..."
              aria-label="Cari tiket"
            />
          </div>
          {ticketSearch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => searchTickets("")}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              Bersihkan pencarian
            </Button>
          )}
        </div>
      )}

      {message && (
        <div
          className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-sm font-medium text-foreground"
          role="status"
        >
          {message}
        </div>
      )}

      <p className="mb-2 text-xs text-muted-foreground sm:hidden">
        Geser tabel ke samping untuk melihat seluruh kolom &amp; tombol aksi.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-40">No. Tiket &amp; Tanggal</TableHead>
              <TableHead className="min-w-60">Rincian Permintaan &amp; Proyek</TableHead>
              <TableHead>Pemohon</TableHead>
              <TableHead>Prioritas</TableHead>
              <TableHead className="min-w-48">Status &amp; Tahap Alur</TableHead>
              <TableHead className="text-right">Nilai Estimasi</TableHead>
              <TableHead className="text-right">Aksi Cepat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => {
              const stageNum = getTicketStageNumber(ticket.status);
              const priorityBadgeClass =
                ticket.priority === "URGENT"
                  ? "border-rose-500/35 bg-rose-500/15 text-rose-400"
                  : ticket.priority === "HIGH"
                    ? "border-amber-500/35 bg-amber-500/15 text-amber-400"
                    : ticket.priority === "MEDIUM"
                      ? "border-sky-500/35 bg-sky-500/15 text-sky-400"
                      : "border-border bg-muted text-muted-foreground";
              return (
                <TableRow
                  key={ticket.id}
                  tabIndex={0}
                  className="cursor-pointer transition-colors hover:bg-muted/30"
                  onClick={() => openTicketSheet(ticket)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTicketSheet(ticket);
                    }
                  }}
                >
                  <TableCell className="min-w-36 whitespace-nowrap align-top">
                    <span className="inline-flex rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs font-bold text-foreground">
                      {ticket.ticketNumber}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm", {
                        locale: id,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-60 align-top">
                    <p className="font-semibold text-foreground">{ticket.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[11px]">
                        {typeLabels[ticket.type]}
                      </Badge>
                      {ticket.project && (
                        <span className="inline-flex items-center rounded-md bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {ticket.project.kelompokTani} — {ticket.project.title}
                        </span>
                      )}
                      {ticket.items.length > 0 && (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          · {ticket.items.length} item
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-sm font-medium">
                    {ticket.requester.name}
                  </TableCell>
                  <TableCell className="align-top">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${priorityBadgeClass}`}
                    >
                      {priorityLabels[ticket.priority]}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1.5">
                      <Badge variant={statusVariants[ticket.status]}>
                        {statusLabels[ticket.status]}
                      </Badge>
                      {ticket.status !== TicketStatus.REJECTED && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4].map((step) => (
                              <span
                                key={step}
                                className={`h-1.5 w-4 rounded-full ${
                                  step <= stageNum
                                    ? ticket.status === TicketStatus.COMPLETED
                                      ? "bg-emerald-500"
                                      : "bg-primary"
                                    : "bg-muted-foreground/25"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            Tahap {stageNum}/4
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-right font-bold tabular-nums">
                    {formatCurrency(ticket.totalAmount)}
                  </TableCell>
                  <TableCell
                    className="align-top text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      {(() => {
                        const action = actionFor(role, ticket);
                        const workflow = workflowFor(role, ticket);
                        const canSubmit =
                          ticket.status === TicketStatus.DRAFT && ticket.canSubmit;
                        const visibleAction =
                          action ??
                          (canSubmit
                            ? {
                                label: "Ajukan",
                                run: (currentTicket: TicketRow) =>
                                  submitTicket(currentTicket.id),
                              }
                            : null);
                        if (workflow) {
                          const labels = {
                            LOGISTICS: ticket.deliveryOrders?.length
                              ? "Lanjutkan DO"
                              : "Proses Logistik",
                            EXPEDITION_RECEIPT: "Terima Barang",
                            FINANCE: "Bayar / Selesaikan",
                            MOVER: "Konfirmasi Tiba",
                          };
                          const icons = {
                            LOGISTICS: PackageOpen,
                            EXPEDITION_RECEIPT: PackageCheck,
                            FINANCE: CircleDollarSign,
                            MOVER: Truck,
                          };
                          const WorkflowIcon = icons[workflow];
                          return (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
                              onClick={() => setWorkflowTicket(ticket)}
                            >
                              <WorkflowIcon className="size-3.5" />
                              {labels[workflow]}
                            </Button>
                          );
                        }
                        if (
                          role === UserRole.LOGISTICS &&
                          ticket.type === TicketType.MATERIAL &&
                          ticket.status === TicketStatus.PROCESSED_LOGISTIC &&
                          ticket.items.some(
                            (item) => item.status === FulfillmentStatus.PENDING,
                          )
                        ) {
                          return (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
                              onClick={() => openTicketSheet(ticket)}
                            >
                              <ClipboardList className="size-3.5" />
                              Proses Item
                            </Button>
                          );
                        }
                        return visibleAction ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5 text-xs font-semibold"
                            disabled={isPending && busyId === ticket.id}
                            onClick={() => runAction(ticket, visibleAction)}
                          >
                            {visibleAction.label === "Setujui" ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            {isPending && busyId === ticket.id
                              ? "Memproses..."
                              : visibleAction.label}
                          </Button>
                        ) : null;
                      })()}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2.5 text-xs font-medium"
                        onClick={() => openTicketSheet(ticket)}
                      >
                        <Eye className="size-3.5" />
                        Detail
                      </Button>
                      <TicketManagementActions ticket={ticket} role={role} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {tickets.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-12 text-center text-muted-foreground"
                >
                  Tidak ada tiket permintaan yang cocok dengan filter saat ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal Detail Tiket */}
      <GlobalModal
        isOpen={selectedTicket !== null}
        onClose={closeTicketSheet}
        title={
          selectedTicket ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 font-mono text-xs font-extrabold text-primary">
                {selectedTicket.ticketNumber}
              </span>
              <span className="line-clamp-1 text-base font-bold text-foreground">
                {selectedTicket.title}
              </span>
            </span>
          ) : (
            "Detail Tiket"
          )
        }
        description={
          selectedTicket
            ? `${
                selectedTicket.requestCategory
                  ? requestCategoryLabels[selectedTicket.requestCategory]
                  : typeLabels[selectedTicket.type]
              } · Prioritas ${priorityLabels[selectedTicket.priority]} · Status: ${statusLabels[selectedTicket.status]}`
            : ""
        }
        className="max-w-3xl"
        footer={
          selectedTicket ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {selectedTicket.type === TicketType.MATERIAL &&
                  (role === UserRole.LOGISTICS ||
                    role === UserRole.DIRECTOR ||
                    role === UserRole.ADMINISTRATIONS) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        printPurchaseOrder(
                          selectedTicket.id,
                          selectedTicket.purchaseOrders?.[0]?.publicCode,
                        )
                      }
                    >
                      <Printer className="mr-1.5 size-4" />
                      Cetak PO
                    </Button>
                  )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeTicketSheet}
                >
                  Tutup
                </Button>
                {(() => {
                  const action =
                    actionFor(role, selectedTicket) ??
                    (selectedTicket.status === TicketStatus.DRAFT &&
                    selectedTicket.canSubmit
                      ? {
                          label: "Ajukan ke Direktur",
                          run: (currentTicket: TicketRow) =>
                            submitTicket(currentTicket.id),
                        }
                      : null);
                  const workflow = workflowFor(role, selectedTicket);
                  if (workflow) {
                    const labels = {
                      LOGISTICS: "Lanjutkan Proses Logistik (DO)",
                      EXPEDITION_RECEIPT: "Terima Barang & Selesaikan",
                      FINANCE: "Proses Pembayaran Finance",
                      MOVER: "Konfirmasi Barang Tiba",
                    };
                    return (
                      <Button
                        type="button"
                        onClick={() => {
                          setSelectedTicket(null);
                          setItemSelection(null);
                          setWorkflowTicket(selectedTicket);
                        }}
                      >
                        {labels[workflow]}
                      </Button>
                    );
                  }
                  return action ? (
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(selectedTicket, action)}
                    >
                      {isPending ? "Memproses..." : action.label}
                    </Button>
                  ) : null;
                })()}
              </div>
            </div>
          ) : undefined
        }
      >
        {selectedTicket && (() => {
          const parsedDesc = parseTicketDescription(selectedTicket.description);
          const categoryDisplay =
            (selectedTicket.requestCategory &&
              requestCategoryLabels[selectedTicket.requestCategory]) ||
            parsedDesc.categoryFromDesc ||
            typeLabels[selectedTicket.type];

          return (
            <div className="space-y-4">
              {/* 1. Alur Tahapan Visual 4 Langkah */}
              <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { step: 1, title: "01. Pengajuan", sub: "Draft & Submit" },
                    { step: 2, title: "02. Otorisasi", sub: "Direktur" },
                    {
                      step: 3,
                      title: "03. Eksekusi",
                      sub:
                        selectedTicket.type === TicketType.MATERIAL
                          ? "Logistik / PO / DO"
                          : "Pencairan Finance",
                    },
                    { step: 4, title: "04. Selesai", sub: "Tuntas" },
                  ].map((s) => {
                    const currentStage = getTicketStageNumber(
                      selectedTicket.status,
                    );
                    const isDone =
                      selectedTicket.status === TicketStatus.COMPLETED ||
                      s.step < currentStage;
                    const isActive =
                      selectedTicket.status !== TicketStatus.COMPLETED &&
                      s.step === currentStage;
                    return (
                      <div
                        key={s.step}
                        className={`rounded-lg border px-3 py-2 ${
                          isDone
                            ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                            : isActive
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card/50 text-muted-foreground"
                        }`}
                      >
                        <p className="text-xs font-bold">{s.title}</p>
                        <p className="text-[11px] opacity-80">{s.sub}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                  <div>
                    <span className="font-bold text-amber-400">
                      Tahap Saat Ini:{" "}
                    </span>
                    <span className="font-semibold text-foreground">
                      {statusLabels[selectedTicket.status]}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {nextStepLabels[selectedTicket.status]}
                  </span>
                </div>
                {printMessage && (
                  <p className="mt-2 text-xs text-amber-400" role="status">
                    {printMessage}
                  </p>
                )}
              </div>

              {/* 2. Grid Informasi Utama Tiket (Tanpa Duplikasi) */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pemohon
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {selectedTicket.requester.name}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Tanggal Pengajuan
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {format(
                      new Date(selectedTicket.createdAt),
                      "d MMM yyyy, HH:mm",
                      { locale: id },
                    )}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:col-span-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {selectedTicket.type === TicketType.MATERIAL
                      ? "Total Nilai Estimasi"
                      : "Nominal Pengajuan"}
                  </p>
                  <p className="mt-1 text-base font-extrabold text-primary tabular-nums">
                    {formatCurrency(selectedTicket.totalAmount)}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-border bg-card p-3 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Proyek &amp; Lokasi Kerja
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {selectedTicket.project
                      ? `${selectedTicket.project.kelompokTani} — ${selectedTicket.project.title}`
                      : "Non-Proyek / Operasional Internal"}
                  </p>
                </div>
                <div className="col-span-2 rounded-xl border border-border bg-card p-3 sm:col-span-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {selectedTicket.items.length > 0
                      ? "Status Pemenuhan Barang"
                      : "Kategori Permintaan"}
                  </p>
                  <p className="mt-1 text-sm font-bold text-foreground">
                    {selectedTicket.items.length > 0
                      ? selectedTicket.fulfillmentStatus === "COMPLETED"
                        ? "Selesai (100%)"
                        : selectedTicket.fulfillmentStatus ===
                            "PARTIALLY_FULFILLED"
                          ? "Sebagian Terpenuhi"
                          : "Menunggu Pemenuhan"
                      : categoryDisplay}
                  </p>
                </div>
              </div>

              {/* 3. Kartu Keterangan / Catatan Kebutuhan (Bersih Tanpa Pengulangan) */}
              {(parsedDesc.notes ||
                parsedDesc.extraFields.length > 0 ||
                selectedTicket.requestCategory === TicketRequestCategory.APH) && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Keterangan &amp; Rincian Kebutuhan
                    </h4>
                    <Badge variant="outline" className="text-[11px]">
                      {categoryDisplay}
                    </Badge>
                  </div>

                  {parsedDesc.notes && (
                    <div className="rounded-lg border border-border/70 bg-muted/25 px-3.5 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {parsedDesc.notes}
                    </div>
                  )}

                  {parsedDesc.extraFields.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {parsedDesc.extraFields.map((field, idx) => (
                        <div
                          key={`${field.label}-${idx}`}
                          className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
                        >
                          <span className="block text-[11px] text-muted-foreground">
                            {field.label}
                          </span>
                          <span className="mt-0.5 block font-semibold text-foreground">
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedTicket.requestCategory ===
                    TicketRequestCategory.APH && (
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                      <h4 className="font-semibold text-foreground">
                        Detail Pembayaran APH
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Metode Pembayaran:{" "}
                        <span className="font-semibold text-foreground">
                          {selectedTicket.requestPaymentMethod ===
                          POPaymentMethod.CASH
                            ? "Tunai (Cash)"
                            : "Transfer Bank"}
                        </span>
                      </p>
                      {selectedTicket.requestPaymentMethod ===
                        POPaymentMethod.TRANSFER && (
                        <p className="text-xs text-muted-foreground">
                          Tujuan Transfer:{" "}
                          <span className="font-semibold text-foreground">
                            {selectedTicket.transferDestination || "—"}
                          </span>
                        </p>
                      )}
                      {selectedTicket.requestPaymentDescription && (
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                          Keterangan: {selectedTicket.requestPaymentDescription}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Kartu Khusus Rekening Tujuan Pembayaran */}
              {(selectedTicket.recipientName ||
                selectedTicket.bankName ||
                selectedTicket.accountNumber ||
                selectedTicket.transferReceiptUrl) && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Tujuan Pembayaran / Rekening Penerima
                    </h4>
                    {selectedTicket.transferReceiptUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() =>
                          setSelectedReceipt({
                            label: "Bukti Transfer",
                            url: selectedTicket.transferReceiptUrl!,
                          })
                        }
                      >
                        <Eye className="size-3.5" />
                        Lihat Bukti Transfer
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className="rounded-lg border border-border bg-muted/25 p-3">
                      <span className="block text-[11px] text-muted-foreground">
                        Nama Penerima
                      </span>
                      <span className="mt-0.5 block text-sm font-bold text-foreground">
                        {selectedTicket.recipientName || "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 p-3">
                      <span className="block text-[11px] text-muted-foreground">
                        Bank Tujuan
                      </span>
                      <span className="mt-0.5 block text-sm font-bold uppercase text-foreground">
                        {selectedTicket.bankName || "—"}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/25 p-3">
                      <span className="block text-[11px] text-muted-foreground">
                        Nomor Rekening
                      </span>
                      <span className="mt-0.5 block font-mono text-sm font-bold tracking-wide text-primary">
                        {selectedTicket.accountNumber || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. Lampiran & Bukti Dokumen dengan Label Jelas */}
              {(selectedTicket.attachmentUrl ||
                selectedTicket.receiptUrls.length > 0 ||
                selectedTicket.paymentProofUrl ||
                selectedTicket.purchaseReceiptUrl ||
                selectedTicket.deliveryReceiptUrl) && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Lampiran &amp; Bukti Dokumen
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.attachmentUrl && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                      >
                        <a
                          href={selectedTicket.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-3.5" />
                          Lampiran / Quotation
                        </a>
                      </Button>
                    )}
                    {selectedTicket.receiptUrls.map((url, index) => (
                      <Button
                        key={url}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() =>
                          setSelectedReceipt({
                            label: `Bukti Pengajuan ${index + 1}`,
                            url,
                          })
                        }
                      >
                        <Eye className="size-3.5" />
                        Bukti Pengajuan {index + 1}
                      </Button>
                    ))}
                    {[
                      ["Bukti Pembayaran", selectedTicket.paymentProofUrl],
                      ["Bukti Pembelian", selectedTicket.purchaseReceiptUrl],
                      ["Bukti Pengiriman", selectedTicket.deliveryReceiptUrl],
                    ]
                      .filter((receipt): receipt is [string, string] =>
                        Boolean(receipt[1]),
                      )
                      .map(([label, url]) => (
                        <Button
                          key={url}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setSelectedReceipt({ label, url })}
                        >
                          <Eye className="size-3.5" />
                          {label}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

            {/* Dokumen Surat Jalan (DO) & Pembelian Langsung */}
            {((selectedTicket.deliveryOrders?.length ?? 0) > 0 ||
              (selectedTicket.directStockPurchases?.length ?? 0) > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedTicket.deliveryOrders?.map((deliveryOrder) => (
                  <div
                    key={deliveryOrder.publicCode}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Surat Jalan Gudang (DO)
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-foreground">
                        {deliveryOrder.doNumber}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                      <Link href={`/d/${deliveryOrder.publicCode}`}>
                        <FileText className="size-3.5" />
                        Buka / Cetak DO
                      </Link>
                    </Button>
                  </div>
                ))}

                {selectedTicket.directStockPurchases?.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                  >
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Pembelian Langsung Toko
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-foreground">
                        {purchase.purchaseNumber} · {purchase.vendorName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(purchase.totalAmount)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        purchase.status === "RECEIVED"
                          ? "lightSuccess"
                          : "lightWarning"
                      }
                    >
                      {purchase.status === "RECEIVED"
                        ? "Diterima"
                        : purchase.isApprovedByDirector
                          ? "Dalam Proses"
                          : "Menunggu Direktur"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* 4. Tabel Rincian Item & Pemenuhan Stok */}
            {selectedTicket.items.length > 0 && (
              <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Rincian Item Permintaan ({selectedTicket.items.length} Item)
                    </h3>
                    {canSplitFulfillment && (
                      <p className="text-xs text-muted-foreground">
                        Centang item di bawah untuk memeriksa ketersediaan stok gudang (DO) atau menerbitkan PO pengadaan.
                      </p>
                    )}
                  </div>
                  {canSplitFulfillment && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        selectedStockItems.length === 0 || fulfillmentPending
                      }
                      onClick={prepareWarehouseFulfillment}
                      className="gap-1.5 text-xs"
                    >
                      <PackageOpen className="size-3.5" />
                      Periksa &amp; Penuhi dari Stok ({selectedStockItems.length})
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        {canSplitFulfillment && (
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                allPendingItemsSelected
                                  ? true
                                  : somePendingItemsSelected
                                    ? "indeterminate"
                                    : false
                              }
                              disabled={pendingTicketItemIds.length === 0}
                              aria-label="Pilih semua item yang belum dipenuhi"
                              onCheckedChange={(checked) =>
                                setItemSelection({
                                  ticketId: selectedTicket.id,
                                  itemIds:
                                    checked === true
                                      ? pendingTicketItemIds
                                      : [],
                                })
                              }
                            />
                          </TableHead>
                        )}
                        <TableHead>Nama Item</TableHead>
                        <TableHead>Jumlah</TableHead>
                        <TableHead>Harga Satuan</TableHead>
                        <TableHead>Sumber</TableHead>
                        <TableHead>Target Tiba</TableHead>
                        <TableHead>Status Pemenuhan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTicket.items.map((item) => (
                        <TableRow key={item.id}>
                          {canSplitFulfillment && (
                            <TableCell>
                              <Checkbox
                                checked={selectedItemIds.includes(item.id)}
                                disabled={
                                  item.status !== FulfillmentStatus.PENDING
                                }
                                aria-label={`Pilih ${item.itemName}`}
                                onCheckedChange={(checked) =>
                                  setItemSelection({
                                    ticketId: selectedTicket.id,
                                    itemIds:
                                      checked === true
                                        ? [...selectedItemIds, item.id]
                                        : selectedItemIds.filter(
                                            (id) => id !== item.id,
                                          ),
                                  })
                                }
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">
                            {item.itemName}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {item.quantity} {item.unit}
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {formatCurrency(item.estimatedCost)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.categoryHint === "WAREHOUSE"
                                ? "Stok Gudang"
                                : "Pembelian"}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {item.expectedDeliveryDate ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === FulfillmentStatus.PENDING
                                  ? "lightWarning"
                                  : "lightSuccess"
                              }
                            >
                              {item.status === FulfillmentStatus.PENDING
                                ? "Menunggu"
                                : item.status ===
                                    FulfillmentStatus.PROCESSED_TO_DO
                                  ? "Dipenuhi via DO"
                                  : "Diproses via PO"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {/* 5. Riwayat Pembayaran (Jika Ada) */}
            {(selectedTicket.paymentTransactions?.length ?? 0) > 0 && (
              <div className="space-y-2.5 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-foreground">
                    Riwayat Transaksi Pembayaran
                  </h4>
                  {(() => {
                    const paid = selectedTicket.paymentTransactions!.reduce(
                      (sum, payment) => sum + payment.amount,
                      0,
                    );
                    return (
                      <Badge variant="secondary">
                        {selectedTicket.paymentTransactions!.length} transaksi ·{" "}
                        {formatCurrency(String(paid))}
                      </Badge>
                    );
                  })()}
                </div>
                <NativeDataTable itemLabel="pembayaran">
                  <table className="app-data-table w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 pr-3">Tanggal</th>
                        <th className="py-2 pr-3">Referensi</th>
                        <th className="py-2 pr-3">Tipe</th>
                        <th className="py-2 pr-3">Jumlah</th>
                        <th className="py-2 pr-3">Tujuan Transfer</th>
                        <th className="py-2">Bukti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTicket.paymentTransactions!.map((payment) => (
                        <tr key={payment.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {payment.paidAt
                              ? new Date(payment.paidAt).toLocaleDateString(
                                  "id-ID",
                                )
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">{payment.reference}</td>
                          <td className="py-2 pr-3">
                            {payment.paymentType === PaymentType.DOWN_PAYMENT
                              ? "DP"
                              : payment.paymentType ===
                                  PaymentType.PROGRESS_PAYMENT
                                ? "Termin"
                                : "Pelunasan"}
                          </td>
                          <td className="py-2 pr-3 font-semibold tabular-nums">
                            {formatCurrency(String(payment.amount))}
                          </td>
                          <td className="py-2 pr-3">
                            {payment.transferDestination}
                          </td>
                          <td className="py-2">
                            {payment.proofOfTransferUrl ? (
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                              >
                                <a
                                  href={withLocalPhotoPreview(
                                    payment.proofOfTransferUrl,
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <ExternalLink className="size-3" />
                                  Bukti
                                </a>
                              </Button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </NativeDataTable>
              </div>
            )}

            {/* 6. Jejak Audit / Riwayat Aktivitas */}
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-bold text-foreground">
                Riwayat Aktivitas &amp; Otorisasi ({selectedTicket.auditLogs.length})
              </h3>
              <ol className="space-y-3 border-l-2 border-primary/30 pl-4">
                {selectedTicket.auditLogs.map((log) => (
                  <li key={log.id} className="relative">
                    <span className="absolute -left-[1.35rem] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {auditActionLabels[log.action] ?? log.action}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {log.user.name} ·{" "}
                        {format(new Date(log.createdAt), "d MMM yyyy, HH:mm", {
                          locale: id,
                        })}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {log.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>
          );
        })()}
      </GlobalModal>

      {/* Modal Konfirmasi Pemenuhan dari Stok Gudang */}
      <GlobalModal
        isOpen={doDialogOpen}
        onClose={() => {
          setDoDialogOpen(false);
          setFulfillmentMessage("");
          setStockAvailability([]);
        }}
        title="Konfirmasi Pemenuhan dari Stok Gudang"
        description="Status stok dihitung otomatis untuk barang yang dipilih. Buat Surat Jalan (DO) untuk barang ready dan teruskan barang yang kurang ke pengadaan PO."
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDoDialogOpen(false)}
              disabled={fulfillmentPending}
            >
              Batal
            </Button>
            {needsOrderTicketItemIds.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={openPurchaseOrderForUnavailableItems}
                disabled={fulfillmentPending}
              >
                {fulfillmentPending
                  ? "Memproses..."
                  : `Buat Pengadaan untuk ${needsOrderTicketItemIds.length} Barang`}
              </Button>
            )}
            {readyStockItems.length > 0 && (
              <Button
                type="button"
                onClick={fulfillSelectedItemsFromStock}
                disabled={
                  fulfillmentPending ||
                  readyStockItems.length === 0 ||
                  !selectedMoverId ||
                  !selectedVehicleId
                }
              >
                {fulfillmentPending
                  ? "Memproses..."
                  : `Terbitkan DO (${readyStockItems.length} Barang Ready)`}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Barang yang Dibutuhkan</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Stok Tersedia</TableHead>
                  <TableHead>Status Ketersediaan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stockAvailability.length > 0
                  ? selectedTicket?.items.filter((item) =>
                      stockAvailability.some(
                        (availability) =>
                          availability.ticketItemId === item.id,
                      ),
                    ) ?? []
                  : selectedStockItems
                ).map((item) => {
                  const availability = stockAvailability.find(
                    (entry) => entry.ticketItemId === item.id,
                  );
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.itemName}</TableCell>
                      <TableCell>
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell>
                        {availability
                          ? `${availability.availableQuantity} ${item.unit}`
                          : "Belum diperiksa"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            availability?.ready
                              ? "lightSuccess"
                              : "lightWarning"
                          }
                        >
                          {availability
                            ? availability.pendingPurchaseNumber
                              ? "Sedang Dipesan"
                              : availability.ready
                                ? "Stok Ready"
                                : "Perlu Pemesanan"
                            : "Menunggu pemeriksaan"}
                        </Badge>
                        {availability?.message && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {availability.message}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {readyStockItems.length > 0 && (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:grid-cols-2">
              <FormLabel className="space-y-1.5 text-sm">
                <span className="font-semibold">Mover Pengiriman</span>
                <select
                  value={selectedMoverId}
                  onChange={(event) => setSelectedMoverId(event.target.value)}
                  disabled={fulfillmentPending || moverOptions.length === 0}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Pilih Petugas Mover</option>
                  {moverOptions.map((mover) => (
                    <option key={mover.id} value={mover.id}>
                      {mover.name}
                    </option>
                  ))}
                </select>
                {moverOptions.length === 0 && (
                  <span className="block text-xs text-destructive" role="alert">
                    Belum ada Mover aktif yang dapat ditugaskan.
                  </span>
                )}
              </FormLabel>
              <FormLabel className="space-y-1.5 text-sm">
                <span className="font-semibold">Kendaraan Operasional</span>
                <select
                  value={selectedVehicleId}
                  onChange={(event) => setSelectedVehicleId(event.target.value)}
                  disabled={fulfillmentPending || vehicleOptions.length === 0}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  <option value="">Pilih Kendaraan</option>
                  {vehicleOptions.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plateNumber} · {vehicle.vehicleType}
                      {vehicle.brand ? ` · ${vehicle.brand}` : ""}
                      {vehicle.modelName ? ` · ${vehicle.modelName}` : ""}
                    </option>
                  ))}
                </select>
                {vehicleOptions.length === 0 && (
                  <span className="block text-xs text-destructive" role="alert">
                    Tidak ada kendaraan tersedia dengan KM awal yang sudah disiapkan.
                  </span>
                )}
              </FormLabel>
            </div>
          )}
          {fulfillmentMessage && (
            <p className="text-sm text-destructive" role="alert">
              {fulfillmentMessage}
            </p>
          )}
        </div>
      </GlobalModal>

      {/* Modal Pilih Mode Pengadaan (PO / Pembelian Langsung) */}
      <GlobalModal
        isOpen={poDialogOpen}
        onClose={() => {
          setPoDialogOpen(false);
          setFulfillmentMessage("");
        }}
        title="Pilih Mode Pengadaan Barang"
        description="Pilih jalur pengadaan untuk barang yang stoknya belum mencukupi di gudang."
        className="sm:max-w-5xl"
      >
        <div className="space-y-4">
          <RadioGroup
            value={purchaseMode}
            onValueChange={(value) =>
              setPurchaseMode(
                value === "DIRECT_PURCHASE"
                  ? "DIRECT_PURCHASE"
                  : "PURCHASE_ORDER",
              )
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <FormLabel
              htmlFor="ticket-procurement-po"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                purchaseMode === "PURCHASE_ORDER"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <RadioGroupItem
                value="PURCHASE_ORDER"
                id="ticket-procurement-po"
              />
              <span>
                <span className="block font-semibold">Purchase Order (PO Vendor)</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Pengadaan resmi melalui PO vendor dan alur otorisasi pembayaran.
                </span>
              </span>
            </FormLabel>
            <FormLabel
              htmlFor="ticket-procurement-direct"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                purchaseMode === "DIRECT_PURCHASE"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <RadioGroupItem
                value="DIRECT_PURCHASE"
                id="ticket-procurement-direct"
              />
              <span>
                <span className="block font-semibold">
                  Pembelian Langsung ke Toko
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Catat pembelian langsung barang kebutuhan tanpa menerbitkan PO.
                </span>
              </span>
            </FormLabel>
          </RadioGroup>
          {selectedTicket &&
          selectedTicketItems.length > 0 &&
          purchaseMode === "PURCHASE_ORDER" ? (
            <CreatePOForm
              key={`${selectedTicket.id}:${selectedTicketItems
                .map((item) => item.id)
                .join(",")}`}
              vendors={vendors}
              stockItems={stockItems}
              ticketId={selectedTicket.id}
              ticketItems={selectedTicketItems.map((item) => ({
                ticketItemId: item.id,
                itemName: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
              }))}
              projectSiteName={
                selectedTicket.project
                  ? `${selectedTicket.project.kelompokTani} - ${selectedTicket.project.title}`
                  : selectedTicket.title
              }
              onCancel={() => setPoDialogOpen(false)}
              onCreated={() => {
                setPoDialogOpen(false);
                setSelectedTicket(null);
                setItemSelection(null);
                router.refresh();
              }}
            />
          ) : selectedTicket && selectedTicketItems.length > 0 ? (
            <DirectStockPurchaseForm
              key={`direct:${selectedTicket.id}:${selectedTicketItems
                .map((item) => item.id)
                .join(",")}`}
              vendors={vendors}
              stockItems={stockItems}
              tickets={[
                {
                  id: selectedTicket.id,
                  ticketNumber: selectedTicket.ticketNumber,
                  title: selectedTicket.title,
                },
              ]}
              initialTicketId={selectedTicket.id}
              initialTicketItems={selectedTicketItems.map((item) => ({
                ticketItemId: item.id,
                itemName: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
              }))}
              onCancel={() => setPoDialogOpen(false)}
              onCreated={() => {
                setPoDialogOpen(false);
                setSelectedTicket(null);
                setItemSelection(null);
                router.refresh();
              }}
            />
          ) : (
            <p className="text-sm text-destructive" role="alert">
              Tidak ada barang yang perlu dipesan. Tutup dan periksa kembali stok.
            </p>
          )}
        </div>
      </GlobalModal>

      {/* Modal Pratinjau Bukti Dokumen */}
      <GlobalModal
        isOpen={selectedReceipt !== null}
        onClose={() => setSelectedReceipt(null)}
        title={selectedReceipt?.label ?? "Pratinjau Bukti Dokumen"}
        description="Pratinjau dokumen/foto bukti terunggah. Klik tombol Unduh di bawah untuk menyimpan salinan file."
        className="max-w-4xl"
        footer={
          selectedReceipt ? (
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedReceipt(null)}
              >
                Tutup
              </Button>
              <Button asChild>
                <a
                  href={photoDownloadHref(selectedReceipt.url)}
                  {...photoDownloadLinkProps(selectedReceipt.url)}
                >
                  <Download className="mr-1.5 size-4" aria-hidden="true" />
                  {photoDownloadLabel(selectedReceipt.url).replace(
                    "foto",
                    "bukti",
                  )}
                </a>
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedReceipt && (
          <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
            {/\.(jpe?g|png|webp)$/i.test(selectedReceipt.url.split("?")[0]) ? (
              <img
                src={withLocalPhotoPreview(selectedReceipt.url)}
                alt={selectedReceipt.label}
                className="max-h-[65vh] max-w-full object-contain"
              />
            ) : selectedReceipt.url.toLowerCase().endsWith(".pdf") ? (
              <iframe
                src={withLocalPhotoPreview(selectedReceipt.url)}
                title={`Pratinjau ${selectedReceipt.label}`}
                className="h-[65vh] w-full"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <FileText className="size-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Pratinjau tidak tersedia untuk jenis file ini. Silakan unduh file melalui tombol di bawah.
                </p>
              </div>
            )}
          </div>
        )}
      </GlobalModal>
      {workflowTicket && (
        <>
          {workflowFor(role, workflowTicket) === "EXPEDITION_RECEIPT" &&
            (() => {
              const deliveryOrder = workflowTicket.deliveryOrders?.find(
                (item) => item.status === DOStatus.IN_TRANSIT,
              );
              return deliveryOrder ? (
                <ExpeditionArrivalModal
                  open
                  publicCode={deliveryOrder.publicCode}
                  ticketNumber={workflowTicket.ticketNumber}
                  doNumber={deliveryOrder.doNumber}
                  onOpenChange={(open) => {
                    if (!open) setWorkflowTicket(null);
                  }}
                  onSuccess={() => {
                    setWorkflowTicket(null);
                    router.refresh();
                  }}
                />
              ) : null;
            })()}
          <LogisticsActionModal
            open={workflowFor(role, workflowTicket) === "LOGISTICS"}
            ticket={workflowTicket}
            vendors={vendors}
            stockItems={stockItems}
            vehicles={vehicles}
            onOpenChange={(open) => {
              if (!open) setWorkflowTicket(null);
            }}
            onSuccess={() => {
              setWorkflowTicket(null);
              router.refresh();
            }}
          />
          <FinanceActionModal
            open={workflowFor(role, workflowTicket) === "FINANCE"}
            ticket={workflowTicket}
            onOpenChange={(open) => {
              if (!open) setWorkflowTicket(null);
            }}
            onSuccess={() => {
              setWorkflowTicket(null);
              router.refresh();
            }}
          />
          <MoverActionModal
            open={workflowFor(role, workflowTicket) === "MOVER"}
            ticketId={workflowTicket.id}
            onOpenChange={(open) => {
              if (!open) setWorkflowTicket(null);
            }}
            onSuccess={() => {
              setWorkflowTicket(null);
              router.refresh();
            }}
          />
        </>
      )}
    </div>
  );
}
