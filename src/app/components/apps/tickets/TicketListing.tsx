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

  return (
    <div className="my-6">
      {!hideSearch && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-72">
            <Icon
              icon="tabler:search"
              height={18}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              type="search"
              className="pl-8"
              value={ticketSearch}
              onChange={(event) => searchTickets(event.target.value)}
              placeholder="Cari tiket"
              aria-label="Cari tiket"
            />
          </div>
        </div>
      )}

      {message && (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      <p className="mb-2 text-xs text-muted-foreground sm:hidden">
        Geser tabel ke samping untuk melihat semua kolom.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor tiket</TableHead>
              <TableHead>Permintaan</TableHead>
              <TableHead>Pemohon</TableHead>
              <TableHead>Prioritas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Estimasi</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => openTicketSheet(ticket)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTicketSheet(ticket);
                  }
                }}
              >
                <TableCell className="min-w-40 whitespace-nowrap font-medium">
                  {ticket.ticketNumber}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm", {
                      locale: id,
                    })}
                  </span>
                </TableCell>
                <TableCell className="min-w-52">
                  <p className="font-medium">{ticket.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {typeLabels[ticket.type]}
                    {ticket.project
                      ? ` · ${ticket.project.kelompokTani} - ${ticket.project.title}`
                      : ""}
                  </p>
                </TableCell>
                <TableCell>{ticket.requester.name}</TableCell>
                <TableCell>{priorityLabels[ticket.priority]}</TableCell>
                <TableCell>
                  <Badge variant={statusVariants[ticket.status]}>
                    {statusLabels[ticket.status]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatCurrency(ticket.totalAmount)}
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <div className="flex flex-nowrap items-center gap-1">
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
                        EXPEDITION_RECEIPT: "Terima & Selesaikan",
                        FINANCE: "Selesaikan",
                        MOVER: "Konfirmasi Tiba",
                      };
                      const icons = {
                        LOGISTICS: PackageOpen,
                        EXPEDITION_RECEIPT: PackageCheck,
                        FINANCE: CircleDollarSign,
                        MOVER: Truck,
                      };
                      return (
                        <ActionIconButton
                          label={labels[workflow]}
                          tooltip={labels[workflow]}
                          icon={icons[workflow]}
                          onClick={() => setWorkflowTicket(ticket)}
                        />
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
                        <ActionIconButton
                          label="Proses Item"
                          tooltip="Proses Item"
                          icon={ClipboardList}
                          onClick={() => openTicketSheet(ticket)}
                        />
                      );
                    }
                    return visibleAction ? (
                      <ActionIconButton
                        label={
                          isPending && busyId === ticket.id
                            ? "Memproses..."
                            : visibleAction.label
                        }
                        tooltip={
                          isPending && busyId === ticket.id
                            ? "Memproses..."
                            : visibleAction.label
                        }
                        icon={visibleAction.label === "Setujui" ? Check : Send}
                        disabled={isPending && busyId === ticket.id}
                        onClick={() => runAction(ticket, visibleAction)}
                      />
                    ) : (
                      <ActionIconButton
                        label="Detail"
                        tooltip="Lihat detail tiket"
                        icon={Eye}
                        variant="outline"
                        onClick={() => openTicketSheet(ticket)}
                      />
                    );
                    })()}
                    <TicketManagementActions ticket={ticket} role={role} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tickets.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Tidak ada tiket untuk ditampilkan.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <GlobalModal
        isOpen={selectedTicket !== null}
        onClose={closeTicketSheet}
        title={
          selectedTicket
            ? `${selectedTicket.ticketNumber} · ${selectedTicket.title}`
            : "Detail tiket"
        }
        description={
          selectedTicket
            ? `${typeLabels[selectedTicket.type]} · ${statusLabels[selectedTicket.status]} · Prioritas ${priorityLabels[selectedTicket.priority]} · Pemenuhan ${
                selectedTicket.fulfillmentStatus === "COMPLETED"
                  ? "Selesai"
                  : selectedTicket.fulfillmentStatus === "PARTIALLY_FULFILLED"
                    ? "Sebagian"
                    : "Menunggu"
              }`
            : ""
        }
        className="max-w-2xl"
      >
          {selectedTicket && (
            <>

              <div className="mt-6 space-y-6">
                <section className="space-y-2">
                  <h3 className="font-semibold">Ringkasan</h3>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {selectedTicket.description || "Tidak ada deskripsi."}
                  </p>
                  {selectedTicket.requestCategory ===
                    TicketRequestCategory.APH && (
                    <div className="space-y-1 rounded-md border p-3 text-sm">
                      <h4 className="font-semibold">Detail Pembayaran APH</h4>
                      <p>
                        Type pembayaran:{" "}
                        {selectedTicket.requestPaymentMethod ===
                        POPaymentMethod.CASH
                          ? "Cash"
                          : "Transfer"}
                      </p>
                      {selectedTicket.requestPaymentMethod ===
                        POPaymentMethod.TRANSFER && (
                        <p>
                          Tujuan transfer:{" "}
                          {selectedTicket.transferDestination || "—"}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap">
                        Keterangan:{" "}
                        {selectedTicket.requestPaymentDescription || "—"}
                      </p>
                    </div>
                  )}
                  <p className="text-sm">
                    Pemohon: {selectedTicket.requester.name}
                  </p>
                  <p className="text-sm">
                    Tanggal &amp; waktu request:{" "}
                    {format(
                      new Date(selectedTicket.createdAt),
                      "d MMMM yyyy, HH:mm",
                      { locale: id },
                    )}
                  </p>
                  <p className="text-sm">
                    Proyek: {selectedTicket.project
                      ? `${selectedTicket.project.kelompokTani} - ${selectedTicket.project.title}`
                      : "Tidak ditentukan"}
                  </p>
                  <p className="text-sm">
                    Total estimasi: {formatCurrency(selectedTicket.totalAmount)}
                  </p>
                  <div className="rounded-md border border-warning/30 bg-lightwarning p-3">
                    <p className="text-sm font-semibold">Tahap proses saat ini</p>
                    <p className="mt-1 text-sm">
                      {statusLabels[selectedTicket.status]}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nextStepLabels[selectedTicket.status]}
                    </p>
                  </div>
                  {(selectedTicket.directStockPurchases?.length ?? 0) > 0 && (
                    <div className="space-y-2 rounded-md border p-3">
                      <h4 className="font-semibold">Pembelian Langsung Terkait</h4>
                      {selectedTicket.directStockPurchases!.map((purchase) => (
                        <div
                          key={purchase.id}
                          className="flex flex-wrap items-center justify-between gap-3 border-t pt-2 first:border-0 first:pt-0"
                        >
                          <div>
                            <p className="font-medium">
                              {purchase.purchaseNumber} · {purchase.vendorName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(
                                new Date(purchase.createdAt),
                                "d MMM yyyy, HH:mm",
                                { locale: id },
                              )}{" "}
                              · {formatCurrency(purchase.totalAmount)}
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
                                ? "Dalam proses"
                                : "Menunggu Direktur"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedTicket.type === TicketType.MATERIAL &&
                    (role === UserRole.LOGISTICS ||
                      role === UserRole.DIRECTOR ||
                      role === UserRole.ADMINISTRATIONS) && (
                      <div className="space-y-2">
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
                          <Printer className="mr-2 h-4 w-4" />
                          Cetak PO
                        </Button>
                        {printMessage && (
                          <p className="text-sm text-muted-foreground" role="status">
                            {printMessage}
                          </p>
                        )}
                      </div>
                    )}
                  {selectedTicket.deliveryOrders?.map((deliveryOrder) => (
                    <div
                      key={deliveryOrder.publicCode}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div>
                        <h4 className="font-semibold">Surat Jalan</h4>
                        <p className="text-sm text-muted-foreground">
                          DO {deliveryOrder.doNumber}
                        </p>
                      </div>
                      <ActionIconButton
                        type="button"
                        label={`Buka / cetak DO ${deliveryOrder.doNumber}`}
                        tooltip="Buka / cetak DO"
                        icon={FileText}
                        href={`/d/${deliveryOrder.publicCode}`}
                      />
                    </div>
                  ))}
                  {(selectedTicket.recipientName ||
                    selectedTicket.bankName ||
                    selectedTicket.accountNumber ||
                    selectedTicket.transferReceiptUrl) && (
                    <div className="rounded-md border p-3 text-sm">
                      <h4 className="mb-2 font-semibold">Tujuan Pembayaran</h4>
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div className="space-y-0.5">
                          <p>Nama penerima: {selectedTicket.recipientName || "—"}</p>
                          <p>Bank: {selectedTicket.bankName || "—"}</p>
                          <p>Nomor rekening: {selectedTicket.accountNumber || "—"}</p>
                        </div>
                        {selectedTicket.transferReceiptUrl && (
                          <ActionIconButton
                            type="button"
                            label="Lihat Bukti transfer"
                            tooltip="Lihat Bukti transfer"
                            icon={Eye}
                            onClick={() =>
                              setSelectedReceipt({
                                label: "Bukti transfer",
                                url: selectedTicket.transferReceiptUrl!,
                              })
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {(selectedTicket.paymentTransactions?.length ?? 0) > 0 && (
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold">Riwayat Pembayaran</h4>
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
                        <table className="app-data-table w-full min-w-[640px] text-left text-sm">
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
                                    ? new Date(payment.paidAt).toLocaleDateString("id-ID")
                                    : "—"}
                                </td>
                                <td className="py-2 pr-3">{payment.reference}</td>
                                <td className="py-2 pr-3">
                                  {payment.paymentType === PaymentType.DOWN_PAYMENT
                                    ? "DP"
                                    : payment.paymentType === PaymentType.PROGRESS_PAYMENT
                                      ? "Termin"
                                      : "Pelunasan"}
                                </td>
                                <td className="py-2 pr-3">
                                  {formatCurrency(String(payment.amount))}
                                </td>
                                <td className="py-2 pr-3">{payment.transferDestination}</td>
                                <td className="py-2">
                                  {payment.proofOfTransferUrl ? (
                                    <ActionIconButton
                                      label={`Lihat bukti transfer pembayaran ${payment.reference}`}
                                      tooltip="Lihat Bukti"
                                      icon={ExternalLink}
                                      href={withLocalPhotoPreview(
                                        payment.proofOfTransferUrl,
                                      )}
                                      target="_blank"
                                      rel="noreferrer"
                                    />
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
                  {selectedTicket.attachmentUrl && (
                    <ActionIconButton
                      label="Buka lampiran atau quotation"
                      tooltip="Buka lampiran / quotation"
                      icon={ExternalLink}
                      href={selectedTicket.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                    />
                  )}
                  {selectedTicket.receiptUrls.map((url, index) => (
                    <ActionIconButton
                      key={url}
                      type="button"
                      label={`Lihat bukti pengajuan ${index + 1}`}
                      tooltip={`Lihat bukti pengajuan ${index + 1}`}
                      icon={Eye}
                      onClick={() =>
                        setSelectedReceipt({
                          label: `Bukti pengajuan ${index + 1}`,
                          url,
                        })
                      }
                    />
                  ))}
                  {[
                    ["Bukti pembayaran", selectedTicket.paymentProofUrl],
                    ["Bukti pembelian", selectedTicket.purchaseReceiptUrl],
                    ["Bukti pengiriman", selectedTicket.deliveryReceiptUrl],
                  ]
                    .filter((receipt): receipt is [string, string] =>
                      Boolean(receipt[1]),
                    )
                    .map(([label, url]) => (
                      <ActionIconButton
                        key={url}
                        type="button"
                        label={`Lihat ${label}`}
                        tooltip={`Lihat ${label}`}
                        icon={Eye}
                        onClick={() => setSelectedReceipt({ label, url })}
                      />
                    ))}
                </section>

                {selectedTicket.items.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Rincian item</h3>
                  {canSplitFulfillment && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        Pilih item untuk diperiksa stoknya. PO hanya tersedia jika stok tidak mencukupi.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            selectedStockItems.length === 0 ||
                            fulfillmentPending
                          }
                          onClick={prepareWarehouseFulfillment}
                        >
                          Penuhi dari Stok (DO)
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
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
                          <TableHead>Item</TableHead>
                          <TableHead>Jumlah</TableHead>
                          <TableHead>Harga satuan</TableHead>
                          <TableHead>Sumber</TableHead>
                          <TableHead>Tanggal diperlukan</TableHead>
                          <TableHead>Status pemenuhan</TableHead>
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
                            <TableCell>{item.itemName}</TableCell>
                            <TableCell>
                              {item.quantity} {item.unit}
                            </TableCell>
                            <TableCell>
                              {formatCurrency(item.estimatedCost)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.categoryHint === "WAREHOUSE"
                                  ? "Gudang"
                                  : "Pembelian"}
                              </Badge>
                            </TableCell>
                            <TableCell>
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

                <section className="space-y-3">
                  <h3 className="font-semibold">Aktivitas</h3>
                  <ol className="space-y-4 border-l pl-4">
                    {selectedTicket.auditLogs.map((log) => (
                      <li key={log.id} className="relative">
                        <span className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-primary" />
                        <p className="font-medium">
                          {auditActionLabels[log.action] ?? log.action}
                        </p>
                        {log.notes && (
                          <p className="text-sm text-muted-foreground">
                            {log.notes}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {log.user.name} ·{" "}
                          {format(new Date(log.createdAt), "d MMM yyyy, HH:mm", {
                            locale: id,
                          })}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>

                {(() => {
                  const action =
                    actionFor(role, selectedTicket) ??
                    (selectedTicket.status === TicketStatus.DRAFT &&
                    selectedTicket.canSubmit
                      ? {
                          label: "Ajukan",
                          run: (currentTicket: TicketRow) =>
                            submitTicket(currentTicket.id),
                        }
                      : null);
                  const workflow = workflowFor(role, selectedTicket);
                  if (workflow) {
                    const labels = {
                      LOGISTICS: "Lanjutkan DO",
                      EXPEDITION_RECEIPT: "Terima & Selesaikan",
                      FINANCE: "Selesaikan",
                      MOVER: "Konfirmasi Tiba",
                    };
                    return (
                      <Button
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
                      disabled={isPending}
                      onClick={() => runAction(selectedTicket, action)}
                    >
                      {isPending ? "Memproses..." : action.label}
                    </Button>
                  ) : null;
                })()}
              </div>
            </>
          )}
      </GlobalModal>
      <GlobalModal
        isOpen={doDialogOpen}
        onClose={() => {
          setDoDialogOpen(false);
          setFulfillmentMessage("");
          setStockAvailability([]);
        }}
        title="Konfirmasi pemenuhan dari stok"
        description="Status stok dihitung untuk barang yang dipilih. Buat DO untuk barang ready dan teruskan hanya barang yang belum cukup ke pengadaan."
      >
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Barang yang dibutuhkan</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Stok tersedia</TableHead>
                  <TableHead>Status</TableHead>
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
                      <TableCell>{item.itemName}</TableCell>
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
                                ? "Ready"
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
            <div className="grid gap-3 sm:grid-cols-2">
              <FormLabel className="space-y-1.5 text-sm">
                <span className="font-medium">Mover untuk pengiriman</span>
                <select
                  value={selectedMoverId}
                  onChange={(event) => setSelectedMoverId(event.target.value)}
                  disabled={fulfillmentPending || moverOptions.length === 0}
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  required
                >
                  <option value="">Pilih Mover</option>
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
                <span className="font-medium">Kendaraan (ditetapkan Logistik)</span>
                <select
                  value={selectedVehicleId}
                  onChange={(event) => setSelectedVehicleId(event.target.value)}
                  disabled={fulfillmentPending || vehicleOptions.length === 0}
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  required
                >
                  <option value="">Pilih kendaraan</option>
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
          <DialogFooter>
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
                onClick={openPurchaseOrderForUnavailableItems}
                disabled={fulfillmentPending}
              >
                {fulfillmentPending
                  ? "Memproses..."
                  : `Buat Pesanan untuk ${needsOrderTicketItemIds.length} Barang`}
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
                  : `Terbitkan DO untuk ${readyStockItems.length} Barang Ready`}
              </Button>
            )}
          </DialogFooter>
      </GlobalModal>
      <GlobalModal
        isOpen={poDialogOpen}
        onClose={() => {
          setPoDialogOpen(false);
          setFulfillmentMessage("");
        }}
        title="Pilih Mode Pengadaan"
        description="Pilih jalur pengadaan untuk barang yang stoknya belum mencukupi. Hanya barang yang perlu dipesan yang akan disertakan."
        className="sm:max-w-5xl"
      >
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
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
            >
              <RadioGroupItem
                value="PURCHASE_ORDER"
                id="ticket-procurement-po"
              />
              <span>
                <span className="block font-medium">Purchase Order (PO)</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Pengadaan melalui PO vendor dan alur persetujuan.
                </span>
              </span>
            </FormLabel>
            <FormLabel
              htmlFor="ticket-procurement-direct"
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
            >
              <RadioGroupItem
                value="DIRECT_PURCHASE"
                id="ticket-procurement-direct"
              />
              <span>
                <span className="block font-medium">
                  Pembelian Langsung ke Toko
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Catat pembelian barang yang dibutuhkan tanpa membuat PO.
                </span>
              </span>
            </FormLabel>
          </RadioGroup>
          {selectedTicket && selectedTicketItems.length > 0 &&
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
      </GlobalModal>
      <GlobalModal
        isOpen={selectedReceipt !== null}
        onClose={() => setSelectedReceipt(null)}
        title={selectedReceipt?.label ?? "Pratinjau bukti"}
        description="Pratinjau bukti terunggah. Unduh file untuk menyimpan salinannya."
        className="max-w-4xl"
      >
          {selectedReceipt && (
            <>
              <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
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
                      Pratinjau tidak tersedia untuk jenis file ini.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button asChild>
                  <a
                    href={photoDownloadHref(selectedReceipt.url)}
                    {...photoDownloadLinkProps(selectedReceipt.url)}
                  >
                    <Download aria-hidden="true" />
                    {photoDownloadLabel(selectedReceipt.url).replace(
                      "foto",
                      "bukti",
                    )}
                  </a>
                </Button>
              </DialogFooter>
            </>
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
