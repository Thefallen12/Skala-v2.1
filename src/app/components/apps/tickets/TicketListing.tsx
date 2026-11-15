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
  Lock,
  PackageOpen,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShoppingCart,
  Send,
  Trash2,
  Truck,
  UploadCloud,
  X,
} from "lucide-react";
import { deleteUnbilledMaterialDelivery } from "@/app/actions/material-contracts";
import {
  canRecordMaterialDeliveries,
  formatMaterialVolume,
  type ContractTicketDeliveryOption,
  type MaterialContractRow,
} from "@/lib/material-contracts";
import {
  addTicketItemByExecutive,
  checkTicketItemsStock,
  approveByDirector,
  deleteTicketItemByExecutive,
  fulfillTicketItemsFromStock,
  mapTicketItemToStock,
  submitTicket,
  updateTicketItemByExecutive,
  type TicketActionResult,
} from "@/app/actions/tickets";
import { isTicketProcessedByFinance } from "@/lib/ticket-finance-lock";
import {
  approveEquipmentRequest,
  processEquipmentRequestAtLogistics,
  submitEquipmentRequest,
} from "@/app/actions/equipment-requests";
import CreatePOForm from "@/app/components/forms/CreatePOForm";
import DirectStockPurchaseForm from "@/app/components/forms/DirectStockPurchaseForm";
import ExpeditionArrivalModal from "@/app/components/apps/tickets/ExpeditionArrivalModal";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import type { VehicleSummary } from "@/app/actions/vehicles";
import { EQUIPMENT_REQUEST_TYPE } from "@/lib/equipment-request";
import {
  FulfillmentStatus,
  DOStatus,
  PaymentType,
  POPaymentMethod,
  POStatus,
  TicketCategoryHint,
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
import MaterialDeliveryModal from "@/app/components/apps/material-contracts/MaterialDeliveryModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePaginationControls,
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

const statusLabels: Record<TicketRow["status"], string> = {
  DRAFT: "Draft",
  PENDING_DIRECTOR: "Menunggu persetujuan Direktur",
  PENDING_LOGISTIK: "Menunggu diproses Logistik",
  APPROVED_DIR: "Disetujui Direktur",
  PROCESSED_FINANCE: "Diproses Finance",
  PROCESSED_LOGISTIC: "Diproses Logistik",
  ASSIGNED_TO_MOVER: "Ditugaskan ke Mover",
  IN_TRANSIT: "Dalam perjalanan (ekspedisi)",
  WAITING_FINANCE_PAYMENT: "Menunggu pembayaran Finance",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

const nextStepLabels: Record<TicketRow["status"], string> = {
  DRAFT: "Pemohon perlu mengajukan tiket.",
  PENDING_DIRECTOR: "Menunggu Direktur menyetujui tiket.",
  PENDING_LOGISTIK: "Logistik perlu menentukan alat internal atau vendor.",
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
  TicketRow["status"],
  "gray" | "lightWarning" | "lightSuccess" | "lightInfo" | "lightError"
> = {
  DRAFT: "gray",
  PENDING_DIRECTOR: "lightWarning",
  PENDING_LOGISTIK: "lightWarning",
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
  LOGISTICS_EQUIPMENT_INTERNAL: "Dipenuhi dengan alat internal",
  LOGISTICS_EQUIPMENT_RENTAL: "Diteruskan ke penyewaan vendor",
  FINANCE_PAYMENT_PARTIAL: "Pembayaran dicatat sebagian oleh Keuangan",
  LOGISTICS_READY_WAREHOUSE: "Stok gudang siap; ditugaskan ke Mover",
  LOGISTICS_TICKET_ITEM_SKU_MAPPED: "Item tiket ditautkan ke SKU stok",
  MATERIAL_CONTRACT_DELIVERY_RECORDED: "Surat Jalan kontrak dicatat",
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
    (role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
    isTicketProcessedByFinance(ticket)
  ) {
    return null;
  }
  if (
    (role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
    ticket.status === TicketStatus.PENDING_DIRECTOR
  ) {
    return {
      label: "Setujui",
      run: (currentTicket) =>
        currentTicket.ticketType === EQUIPMENT_REQUEST_TYPE
          ? approveEquipmentRequest(currentTicket.id)
          : approveByDirector(currentTicket.id, currentTicket.type),
    };
  }
  return null;
}

function submitTicketRequest(ticket: TicketRow) {
  return ticket.ticketType === EQUIPMENT_REQUEST_TYPE
    ? submitEquipmentRequest(ticket.id)
    : submitTicket(ticket.id);
}

function workflowFor(
  role: TicketPageRole,
  ticket: TicketRow,
): "LOGISTICS" | "LOGISTICS_DO" | "EXPEDITION_RECEIPT" | "FINANCE" | "MOVER" | null {
  if (
    (role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
    isTicketProcessedByFinance(ticket)
  ) {
    return null;
  }
  if (
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR) &&
    ticket.requestCategory === TicketRequestCategory.SHIPPING_COST &&
    (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.PROCESSED_FINANCE)
  ) {
    return "LOGISTICS_DO";
  }
  if (
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR) &&
    ticket.type === TicketType.MATERIAL &&
    ticket.status === TicketStatus.IN_TRANSIT &&
    ticket.deliveryOrders?.some(
      (deliveryOrder) => deliveryOrder.status === DOStatus.IN_TRANSIT,
    )
  ) {
    return "EXPEDITION_RECEIPT";
  }
  if (
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR) &&
    ticket.type === TicketType.MATERIAL &&
    (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.PROCESSED_FINANCE) &&
    ticket.purchaseOrders?.some((purchaseOrder) => purchaseOrder.paidAt) &&
    ticket.items.some((item) => item.status !== FulfillmentStatus.PROCESSED_TO_DO)
  ) {
    return "LOGISTICS";
  }
  if (
    role === UserRole.FINANCE &&
    ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT
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

function getFinanceActionTarget(
  ticket: TicketRow,
): { href: string; label: string } | null {
  const payablePurchase = ticket.directStockPurchases?.find(
    (purchase) =>
      purchase.status === "PENDING_RECEIPT" &&
      purchase.isApprovedByDirector &&
      Boolean(purchase.vendorInvoiceUrl) &&
      !purchase.hasFinanceProof,
  );
  if (payablePurchase) {
    return {
      href: `/apps/finance?tab=payment&openSheet=${encodeURIComponent(payablePurchase.id)}`,
      label: `Bayar ${payablePurchase.purchaseNumber} di Finance`,
    };
  }
  const payablePo = ticket.purchaseOrders?.find(
    (po) =>
      po.status === POStatus.APPROVED &&
      !po.paidAt &&
      Boolean(po.vendorInvoiceUrl),
  );
  if (payablePo) {
    return {
      href: `/apps/finance?tab=payment&openSheet=${encodeURIComponent(payablePo.publicCode)}`,
      label: `Bayar ${payablePo.poNumber} di Finance`,
    };
  }
  const reviewPo = ticket.purchaseOrders?.find(
    (po) => po.status === POStatus.PENDING_FINANCE_REVIEW,
  );
  if (reviewPo) {
    return {
      href: `/apps/finance?tab=check&openSheet=${encodeURIComponent(reviewPo.publicCode)}`,
      label: `Periksa ${reviewPo.poNumber} di Finance`,
    };
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
  materialContracts = [],
  contractTickets = [],
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
  materialContracts?: MaterialContractRow[];
  contractTickets?: ContractTicketDeliveryOption[];
  role: TicketPageRole;
  ticketSearch: string;
  searchTickets: (term: string) => void;
  hideSearch?: boolean;
  initialOpenSheet?: string;
}) {
  const [selectedTicketState, setSelectedTicket] = useState<TicketRow | null>(
    () => tickets.find((ticket) => ticket.id === initialOpenSheet) ?? null,
  );
  const selectedTicket = selectedTicketState
    ? (tickets.find((ticket) => ticket.id === selectedTicketState.id) ??
      selectedTicketState)
    : null;
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
  const [equipmentDecisionOpen, setEquipmentDecisionOpen] = useState(false);
  const [equipmentSource, setEquipmentSource] = useState<
    "INTERNAL" | "EXTERNAL_VENDOR"
  >("INTERNAL");
  const [equipmentVendorName, setEquipmentVendorName] = useState("");
  const [equipmentQuotedCost, setEquipmentQuotedCost] = useState("");
  const [equipmentDecisionError, setEquipmentDecisionError] = useState("");
  const [equipmentDecisionPending, setEquipmentDecisionPending] =
    useState(false);
  const [purchaseMode, setPurchaseMode] = useState<
    "PURCHASE_ORDER" | "DIRECT_PURCHASE"
  >("PURCHASE_ORDER");
  const [fulfillmentPending, setFulfillmentPending] = useState(false);
  const [fulfillmentMessage, setFulfillmentMessage] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<{
    label: string;
    url: string;
  } | null>(null);
  const [receiptPreviewError, setReceiptPreviewError] = useState(false);
  const openReceiptPreview = (receipt: { label: string; url: string }) => {
    setReceiptPreviewError(false);
    setSelectedReceipt(receipt);
  };
  const closeReceiptPreview = () => {
    setReceiptPreviewError(false);
    setSelectedReceipt(null);
  };
  const [workflowTicket, setWorkflowTicket] = useState<TicketRow | null>(null);
  const [contractDoModalTicket, setContractDoModalTicket] =
    useState<TicketRow | null>(null);
  const [contractDoFeedback, setContractDoFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [deletingDeliveryId, setDeletingDeliveryId] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [printMessage, setPrintMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canRecordContractDo = canRecordMaterialDeliveries(role);
  const selectedItemIds =
    selectedTicket && itemSelection?.ticketId === selectedTicket.id
      ? itemSelection.itemIds
      : [];

  const getContractItemDeliveredVolume = (
    ticket: TicketRow,
    materialContractId?: string | null,
  ) =>
    materialContractId
      ? (ticket.materialDeliveries ?? [])
          .filter((delivery) => delivery.contractId === materialContractId)
          .reduce((sum, delivery) => sum + delivery.quantityReceived, 0)
      : 0;

  const hasOpenContractDelivery = (ticket: TicketRow) =>
    !(
      (role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
      isTicketProcessedByFinance(ticket)
    ) &&
    ticket.type === TicketType.MATERIAL &&
    (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.PROCESSED_FINANCE) &&
    ticket.items.some(
      (item) =>
        item.categoryHint === TicketCategoryHint.CONTRACT &&
        item.status === FulfillmentStatus.PENDING,
    );

  const selectedTicketItems = selectedTicket
    ? selectedTicket.items.filter(
        (item) =>
          selectedItemIds.includes(item.id) &&
          item.status === FulfillmentStatus.PENDING &&
          item.categoryHint !== TicketCategoryHint.CONTRACT,
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
      .filter(
        (item) =>
          item.status === FulfillmentStatus.PENDING &&
          item.categoryHint !== TicketCategoryHint.CONTRACT,
      )
      .map((item) => item.id) ?? [];
  const allPendingItemsSelected =
    pendingTicketItemIds.length > 0 &&
    pendingTicketItemIds.every((id) => selectedItemIds.includes(id));
  const somePendingItemsSelected =
    pendingTicketItemIds.some((id) => selectedItemIds.includes(id));
  const isExecutive =
    role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR;
  const selectedTicketFinanceLocked = selectedTicket
    ? isTicketProcessedByFinance(selectedTicket)
    : false;
  const canExecutiveManageTicket =
    Boolean(selectedTicket) && isExecutive && !selectedTicketFinanceLocked;
  const canSplitFulfillment =
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      ((role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
        !selectedTicketFinanceLocked)) &&
    selectedTicket?.type === TicketType.MATERIAL &&
    (selectedTicket.status === TicketStatus.PROCESSED_LOGISTIC ||
      selectedTicket.status === TicketStatus.PROCESSED_FINANCE) &&
    Boolean(
      selectedTicket.items.some(
        (item) => item.categoryHint !== TicketCategoryHint.CONTRACT,
      ),
    );

  // State khusus Direktur & Wakil Direktur untuk tambah/edit/hapus barang langsung di modal
  const [addingItemOpen, setAddingItemOpen] = useState(false);
  const [newItemStockId, setNewItemStockId] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemCategoryHint, setNewItemCategoryHint] =
    useState<TicketCategoryHint>(TicketCategoryHint.WAREHOUSE);
  const [newItemDeliveryDate, setNewItemDeliveryDate] = useState("");

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemStockId, setEditItemStockId] = useState("");
  const [editItemName, setEditItemName] = useState("");
  const [editItemQuantity, setEditItemQuantity] = useState("");
  const [editItemUnit, setEditItemUnit] = useState("");
  const [editItemCost, setEditItemCost] = useState("");
  const [editItemCategoryHint, setEditItemCategoryHint] =
    useState<TicketCategoryHint>(TicketCategoryHint.WAREHOUSE);
  const [editItemDeliveryDate, setEditItemDeliveryDate] = useState("");

  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(
    null,
  );
  const [executiveItemPending, setExecutiveItemPending] = useState(false);
  const [executiveItemFeedback, setExecutiveItemFeedback] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  const resetExecutiveItemState = () => {
    setAddingItemOpen(false);
    setEditingItemId(null);
    setConfirmDeleteItemId(null);
    setExecutiveItemFeedback(null);
  };

  const openAddItemForm = () => {
    const defaultDate =
      selectedTicket?.items.find((i) => i.expectedDeliveryDate)
        ?.expectedDeliveryDate || new Date().toISOString().slice(0, 10);
    setNewItemStockId("");
    setNewItemName("");
    setNewItemQuantity("1");
    setNewItemUnit("pcs");
    setNewItemCost("");
    setNewItemCategoryHint(TicketCategoryHint.WAREHOUSE);
    setNewItemDeliveryDate(defaultDate);
    setEditingItemId(null);
    setConfirmDeleteItemId(null);
    setExecutiveItemFeedback(null);
    setAddingItemOpen(true);
  };

  const openEditItemRow = (item: TicketRow["items"][number]) => {
    setAddingItemOpen(false);
    setConfirmDeleteItemId(null);
    setExecutiveItemFeedback(null);
    setEditingItemId(item.id);
    setEditItemStockId(item.stockItemId ?? "");
    setEditItemName(item.itemName);
    setEditItemQuantity(String(item.quantity));
    setEditItemUnit(item.unit);
    setEditItemCost(item.estimatedCost ?? "");
    setEditItemCategoryHint(item.categoryHint ?? TicketCategoryHint.WAREHOUSE);
    setEditItemDeliveryDate(item.expectedDeliveryDate ?? "");
  };

  const handleExecutiveAddItem = async () => {
    if (!selectedTicket || executiveItemPending) return;
    const qty = Number(newItemQuantity);
    if (!newItemName.trim() || !newItemUnit.trim() || !Number.isFinite(qty) || qty <= 0) {
      setExecutiveItemFeedback({
        text: "Nama barang, satuan, dan jumlah (> 0) wajib diisi.",
        isError: true,
      });
      return;
    }
    setExecutiveItemPending(true);
    setExecutiveItemFeedback(null);
    try {
      const result = await addTicketItemByExecutive(selectedTicket.id, {
        stockItemId: newItemStockId || null,
        itemName: newItemName.trim(),
        quantity: qty,
        unit: newItemUnit.trim(),
        estimatedCost: newItemCost.trim() !== "" ? Number(newItemCost) : null,
        categoryHint: newItemCategoryHint,
        expectedDeliveryDate: newItemDeliveryDate.trim() || null,
      });
      setExecutiveItemFeedback({
        text: result.message,
        isError: !result.success,
      });
      if (result.success) {
        setAddingItemOpen(false);
        router.refresh();
      }
    } catch (error) {
      console.error("Executive add item failed:", error);
      setExecutiveItemFeedback({
        text: "Gagal menambahkan barang ke tiket.",
        isError: true,
      });
    } finally {
      setExecutiveItemPending(false);
    }
  };

  const handleExecutiveUpdateItem = async (itemId: string) => {
    if (!selectedTicket || executiveItemPending) return;
    const qty = Number(editItemQuantity);
    if (!editItemName.trim() || !editItemUnit.trim() || !Number.isFinite(qty) || qty <= 0) {
      setExecutiveItemFeedback({
        text: "Nama barang, satuan, dan jumlah (> 0) wajib diisi.",
        isError: true,
      });
      return;
    }
    setExecutiveItemPending(true);
    setExecutiveItemFeedback(null);
    try {
      const result = await updateTicketItemByExecutive(
        selectedTicket.id,
        itemId,
        {
          stockItemId: editItemStockId || null,
          itemName: editItemName.trim(),
          quantity: qty,
          unit: editItemUnit.trim(),
          estimatedCost:
            editItemCost.trim() !== "" ? Number(editItemCost) : null,
          categoryHint: editItemCategoryHint,
          expectedDeliveryDate: editItemDeliveryDate.trim() || null,
        },
      );
      setExecutiveItemFeedback({
        text: result.message,
        isError: !result.success,
      });
      if (result.success) {
        setEditingItemId(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Executive update item failed:", error);
      setExecutiveItemFeedback({
        text: "Gagal memperbarui rincian barang.",
        isError: true,
      });
    } finally {
      setExecutiveItemPending(false);
    }
  };

  const handleExecutiveDeleteItem = async (itemId: string) => {
    if (!selectedTicket || executiveItemPending || deletingItemId) return;
    setDeletingItemId(itemId);
    setExecutiveItemFeedback(null);
    try {
      const result = await deleteTicketItemByExecutive(
        selectedTicket.id,
        itemId,
      );
      setExecutiveItemFeedback({
        text: result.message,
        isError: !result.success,
      });
      if (result.success) {
        setConfirmDeleteItemId(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Executive delete item failed:", error);
      setExecutiveItemFeedback({
        text: "Gagal menghapus barang dari tiket.",
        isError: true,
      });
    } finally {
      setDeletingItemId(null);
    }
  };

  const openTicketSheet = (ticket: TicketRow) => {
    setSelectedReceipt(null);
    setDoDialogOpen(false);
    setPoDialogOpen(false);
    setContractDoFeedback(null);
    resetExecutiveItemState();
    setItemSelection(null);
    setFulfillmentMessage("");
    setStockAvailability([]);
    setSelectedMoverId("");
    setSelectedTicket(ticket);
  };

  const closeTicketSheet = () => {
    setSelectedReceipt(null);
    setDoDialogOpen(false);
    setPoDialogOpen(false);
    setContractDoFeedback(null);
    resetExecutiveItemState();
    setSelectedTicket(null);
    setItemSelection(null);
    setFulfillmentMessage("");
    setStockAvailability([]);
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

  const mapTicketItemToSku = async (
    ticketItemId: string,
    stockItemId: string,
  ) => {
    if (!selectedTicket || !stockItemId) return;
    const ticketId = selectedTicket.id;
    const ticketItemIds = stockAvailability.map(
      (availability) => availability.ticketItemId,
    );
    if (ticketItemIds.length === 0) return;

    setFulfillmentPending(true);
    setFulfillmentMessage("");
    try {
      const mappingResult = await mapTicketItemToStock(
        ticketId,
        ticketItemId,
        stockItemId,
      );
      if (!mappingResult.success) {
        setFulfillmentMessage(mappingResult.message);
        return;
      }

      const stockCheck = await checkTicketItemsStock(ticketId, ticketItemIds);
      if (!stockCheck.success) {
        setFulfillmentMessage(stockCheck.message);
        return;
      }
      setStockAvailability(stockCheck.stockAvailability ?? []);
      setItemSelection((current) => {
        const mappedReady =
          stockCheck.readyItemIds?.includes(ticketItemId) ?? false;
        const previousIds =
          current?.ticketId === ticketId
            ? current.itemIds.filter((id) =>
                stockCheck.readyItemIds?.includes(id),
              )
            : stockCheck.readyItemIds ?? [];
        const nextIds = mappedReady
          ? [...new Set([...previousIds, ticketItemId])]
          : previousIds;
        return {
          ticketId,
          itemIds: nextIds,
        };
      });
      router.refresh();
      setMoverOptions(stockCheck.movers ?? []);
      setVehicleOptions(stockCheck.vehicles ?? []);
      setSelectedVehicleId(
        stockCheck.vehicles?.some(
          (vehicle) => vehicle.id === selectedVehicleId,
        )
          ? selectedVehicleId
          : stockCheck.vehicles?.[0]?.id ?? "",
      );
      setSelectedMoverId(
        stockCheck.movers?.some((mover) => mover.id === selectedMoverId)
          ? selectedMoverId
          : stockCheck.movers?.some(
                (mover) => mover.id === stockCheck.moverAssigneeId,
              )
            ? stockCheck.moverAssigneeId ?? ""
            : "",
      );
      setFulfillmentMessage(mappingResult.message);
    } catch (error) {
      console.error("Ticket item SKU mapping failed:", error);
      setFulfillmentMessage(
        "Item tiket gagal ditautkan ke SKU. Muat ulang tiket lalu coba kembali.",
      );
    } finally {
      setFulfillmentPending(false);
    }
  };

  const handleDeleteContractDelivery = (deliveryId: string, doNumber: string) => {
    if (deletingDeliveryId) return;
    setDeletingDeliveryId(deliveryId);
    setContractDoFeedback(null);
    startTransition(async () => {
      try {
        const result = await deleteUnbilledMaterialDelivery(deliveryId);
        setContractDoFeedback({
          text: result.message || `Surat Jalan ${doNumber} berhasil dihapus.`,
          isError: !result.success,
        });
        if (result.success) {
          router.refresh();
        }
      } catch (error) {
        console.error("Delete material delivery failed:", error);
        setContractDoFeedback({
          text: "Gagal menghapus Surat Jalan material alam.",
          isError: true,
        });
      } finally {
        setDeletingDeliveryId(null);
      }
    });
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

  const processEquipmentLogisticsDecision = async () => {
    if (!selectedTicket) return;
    const quotedCost =
      equipmentSource === "EXTERNAL_VENDOR"
        ? Number(equipmentQuotedCost)
        : undefined;
    setEquipmentDecisionPending(true);
    setEquipmentDecisionError("");
    try {
      const result = await processEquipmentRequestAtLogistics(
        selectedTicket.id,
        equipmentSource,
        equipmentVendorName,
        quotedCost,
      );
      if (!result.success) {
        setEquipmentDecisionError(result.message);
        return;
      }
      setEquipmentDecisionOpen(false);
      setSelectedTicket(null);
      router.refresh();
    } catch (error) {
      console.error("Logistics equipment decision failed:", error);
      setEquipmentDecisionError(
        "Pemrosesan gagal. Silakan muat ulang dan coba kembali.",
      );
    } finally {
      setEquipmentDecisionPending(false);
    }
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

  const getTicketStageNumber = (
    status: TicketRow["status"],
  ): 1 | 2 | 3 | 4 => {
    if (status === TicketStatus.DRAFT) return 1;
    if (status === TicketStatus.PENDING_DIRECTOR) return 2;
    if (status === TicketStatus.COMPLETED) return 4;
    return 3;
  };

  const [mobilePage, setMobilePage] = useState(1);
  const MOBILE_PAGE_SIZE = 10;
  const safeMobilePage = Math.min(
    mobilePage,
    Math.max(1, Math.ceil(tickets.length / MOBILE_PAGE_SIZE)),
  );
  const visibleMobileTickets = tickets.slice(
    (safeMobilePage - 1) * MOBILE_PAGE_SIZE,
    safeMobilePage * MOBILE_PAGE_SIZE,
  );

  const renderTicketRowActions = (ticket: TicketRow) => (
    <div className="flex flex-nowrap items-center justify-end gap-1.5 sm:justify-center">
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
                run: submitTicketRequest,
              }
            : null);
        const primaryDo = ticket.deliveryOrders?.[0];
        const showDoPrint =
          (ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
            ticket.status === TicketStatus.IN_TRANSIT) &&
          Boolean(primaryDo);

        if (workflow) {
          const labels = {
            LOGISTICS: ticket.deliveryOrders?.length
              ? "Lanjutkan DO"
              : "Proses Logistik",
            LOGISTICS_DO: "Terbitkan DO",
            EXPEDITION_RECEIPT: "Upload Bukti Tiba & Selesaikan (Tahap 4/4)",
            FINANCE: "Bayar / Selesaikan",
            MOVER: "Konfirmasi Tiba (Ruang Kerja Mover)",
          };
          const icons = {
            LOGISTICS: PackageOpen,
            LOGISTICS_DO: Truck,
            EXPEDITION_RECEIPT: UploadCloud,
            FINANCE: CircleDollarSign,
            MOVER: Truck,
          };
          const WorkflowIcon = icons[workflow];
          return (
            <>
              {showDoPrint && primaryDo && (
                <Button
                  asChild
                  type="button"
                  size="icon"
                  className="h-8 w-8 shrink-0 bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-400"
                >
                  <Link
                    href={`/d/${primaryDo.publicCode}`}
                    title="Cetak Surat Jalan (DO)"
                    aria-label="Cetak DO"
                  >
                    <Printer className="size-4" />
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant={
                  workflow === "EXPEDITION_RECEIPT"
                    ? "outline"
                    : "default"
                }
                title={labels[workflow]}
                aria-label={labels[workflow]}
                className={
                  workflow === "EXPEDITION_RECEIPT"
                    ? "h-8 w-8 shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                    : "h-8 w-8 shrink-0"
                }
                onClick={() => {
                  if (workflow === "LOGISTICS_DO") {
                    router.push(
                      `/apps/orders/new?type=do&ticketId=${encodeURIComponent(ticket.id)}`,
                    );
                    return;
                  }
                  setWorkflowTicket(ticket);
                }}
              >
                <WorkflowIcon className="size-4" />
              </Button>
            </>
          );
        }
        const hasNonContractItems = ticket.items.some(
          (item) =>
            item.categoryHint !== TicketCategoryHint.CONTRACT,
        );
        const hasOpenContract =
          canRecordContractDo && hasOpenContractDelivery(ticket);
        if (hasOpenContract && !hasNonContractItems) {
          return (
            <Button
              type="button"
              size="icon"
              title="Catat Surat Jalan Kontrak (DO)"
              aria-label="Catat Surat Jalan Kontrak (DO)"
              className="h-8 w-8 shrink-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
              onClick={() => setContractDoModalTicket(ticket)}
            >
              <Truck className="size-4" />
            </Button>
          );
        }
        if (
          (role === UserRole.LOGISTICS ||
            role === UserRole.ADMINISTRATIONS ||
            ((role === UserRole.DIRECTOR ||
              role === UserRole.DEPUTY_DIRECTOR) &&
              !isTicketProcessedByFinance(ticket))) &&
          ticket.type === TicketType.MATERIAL &&
          (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
            ticket.status === TicketStatus.PROCESSED_FINANCE) &&
          ticket.items.length > 0 &&
          hasNonContractItems
        ) {
          const hasPendingItems = ticket.items.some(
            (item) =>
              item.categoryHint !==
                TicketCategoryHint.CONTRACT &&
              item.status === FulfillmentStatus.PENDING,
          );
          const itemLabel = hasPendingItems
            ? "Proses & Alokasi Item Gudang"
            : "Kelola Item & Pengadaan";
          return (
            <Button
              type="button"
              size="icon"
              title={itemLabel}
              aria-label={itemLabel}
              className="h-8 w-8 shrink-0 bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-400"
              onClick={() => openTicketSheet(ticket)}
            >
              <ClipboardList className="size-4" />
            </Button>
          );
        }
        if (hasOpenContract) {
          return (
            <Button
              type="button"
              size="icon"
              title="Catat Surat Jalan Kontrak (DO)"
              aria-label="Catat Surat Jalan Kontrak (DO)"
              className="h-8 w-8 shrink-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
              onClick={() => setContractDoModalTicket(ticket)}
            >
              <Truck className="size-4" />
            </Button>
          );
        }
        if (role === UserRole.FINANCE) {
          const financeTarget = getFinanceActionTarget(ticket);
          if (financeTarget || (showDoPrint && primaryDo)) {
            return (
              <>
                {showDoPrint && primaryDo && (
                  <Button
                    asChild
                    type="button"
                    size="icon"
                    className="h-8 w-8 shrink-0 bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-400"
                  >
                    <Link
                      href={`/d/${primaryDo.publicCode}`}
                      title="Cetak Surat Jalan (DO)"
                      aria-label="Cetak DO"
                    >
                      <Printer className="size-4" />
                    </Link>
                  </Button>
                )}
                {financeTarget && (
                  <Button
                    asChild
                    size="icon"
                    className="h-8 w-8 shrink-0"
                  >
                    <Link
                      href={financeTarget.href}
                      title={financeTarget.label}
                      aria-label={financeTarget.label}
                    >
                      <CircleDollarSign className="size-4" />
                    </Link>
                  </Button>
                )}
              </>
            );
          }
        }
        if (showDoPrint && primaryDo) {
          return (
            <Button
              asChild
              type="button"
              size="icon"
              className="h-8 w-8 shrink-0 bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-400"
            >
              <Link
                href={`/d/${primaryDo.publicCode}`}
                title="Cetak Surat Jalan (DO)"
                aria-label="Cetak DO"
              >
                <Printer className="size-4" />
              </Link>
            </Button>
          );
        }
        return visibleAction ? (
          <Button
            type="button"
            size="icon"
            title={visibleAction.label}
            aria-label={visibleAction.label}
            className="h-8 w-8 shrink-0"
            disabled={isPending && busyId === ticket.id}
            onClick={() => runAction(ticket, visibleAction)}
          >
            {visibleAction.label === "Setujui" ? (
              <Check className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        ) : null;
      })()}
      <Button
        type="button"
        variant="outline"
        size="icon"
        title="Lihat Rincian & Lampiran Foto"
        aria-label="Detail Tiket"
        className="h-8 w-8 shrink-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
        onClick={() => openTicketSheet(ticket)}
      >
        <Eye className="size-4" />
      </Button>
      <TicketManagementActions ticket={ticket} role={role} />
    </div>
  );

  return (
    <div className="my-2">
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

      {/* TAMPILAN KARTU MOBILE (< 768px) */}
      <div className="space-y-3 md:hidden">
        {visibleMobileTickets.map((ticket) => {
          const stageNum = getTicketStageNumber(ticket.status);
          const priorityBadgeClass =
            ticket.priority === "URGENT"
              ? "border-rose-500/35 bg-rose-500/15 text-rose-400"
              : ticket.priority === "HIGH"
                ? "border-amber-500/35 bg-amber-500/15 text-amber-400"
                : ticket.priority === "MEDIUM"
                  ? "border-sky-500/35 bg-sky-500/15 text-sky-400"
                  : "border-border bg-muted text-muted-foreground";
          const hasAttachment =
            (ticket.receiptUrls?.length ?? 0) > 0 ||
            Boolean(
              ticket.attachmentUrl ||
                ticket.purchaseReceiptUrl ||
                ticket.transferReceiptUrl ||
                ticket.deliveryReceiptUrl,
            );
          return (
            <article
              key={`mobile-${ticket.id}`}
              onClick={() => openTicketSheet(ticket)}
              className="cursor-pointer rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs transition-colors hover:border-primary/40 active:bg-muted/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-amber-500">
                    {ticket.ticketNumber}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClass}`}
                  >
                    {priorityLabels[ticket.priority]}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm", {
                    locale: id,
                  })}
                </span>
              </div>

              <h4 className="mt-2 line-clamp-2 text-sm font-bold leading-snug text-foreground">
                {ticket.title}
              </h4>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                    ticket.type === TicketType.MATERIAL
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                      : ""
                  }`}
                >
                  {ticket.ticketType === EQUIPMENT_REQUEST_TYPE
                    ? "Alat & Kendaraan"
                    : typeLabels[ticket.type]}
                </Badge>
                <span className="inline-flex max-w-full items-center truncate rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                  {ticket.project
                    ? `${ticket.project.kelompokTani} — ${ticket.project.title}`
                    : "Kantor Pusat / Overhead"}
                </span>
                {ticket.items.length > 0 && (
                  <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {ticket.items.length} Item
                  </span>
                )}
                {hasAttachment && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                    <Paperclip className="size-3" />
                    Nota/Bukti
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 text-xs">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={statusVariants[ticket.status]}
                      className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                    >
                      {statusLabels[ticket.status]}
                    </Badge>
                    {ticket.status !== TicketStatus.REJECTED && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        · Tahap {stageNum}/4
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Pemohon: <strong className="text-foreground">{ticket.requester.name}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Estimasi
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-foreground">
                    {formatCurrency(ticket.totalAmount)}
                  </span>
                </div>
              </div>

              <div
                className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5"
                onClick={(event) => event.stopPropagation()}
              >
                <span className="text-[11px] font-medium text-muted-foreground">
                  Ketuk kartu untuk rincian
                </span>
                {renderTicketRowActions(ticket)}
              </div>
            </article>
          );
        })}
        {tickets.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
            Tidak ada tiket permintaan yang cocok dengan filter saat ini.
          </div>
        )}
        <TablePaginationControls
          count={tickets.length}
          pageSize={MOBILE_PAGE_SIZE}
          page={safeMobilePage}
          itemLabel="tiket"
          onPageChange={setMobilePage}
        />
      </div>

      {/* TAMPILAN TABEL DESKTOP (>= 768px) */}
      <div className="hidden md:block">
        <Table itemLabel="tiket">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                No. Tiket &amp; Tanggal
              </TableHead>
              <TableHead className="min-w-60 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rincian Permintaan &amp; Proyek
              </TableHead>
              <TableHead className="hidden text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
                Pemohon
              </TableHead>
              <TableHead className="hidden text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">
                Prioritas
              </TableHead>
              <TableHead className="min-w-44 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status &amp; Tahap Alur
              </TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nilai Estimasi
              </TableHead>
              <TableHead className="sticky right-0 z-10 w-[132px] border-l border-border/50 bg-card/95 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                Aksi
              </TableHead>
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
              const hasAttachment =
                (ticket.receiptUrls?.length ?? 0) > 0 ||
                Boolean(
                  ticket.attachmentUrl ||
                    ticket.purchaseReceiptUrl ||
                    ticket.transferReceiptUrl ||
                    ticket.deliveryReceiptUrl,
                );
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
                    <span className="inline-flex rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-xs font-medium text-amber-500">
                      {ticket.ticketNumber}
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm", {
                        locale: id,
                      })}
                    </span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                      <span className="text-xs font-medium text-muted-foreground">
                        {ticket.requester.name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClass}`}
                      >
                        {priorityLabels[ticket.priority]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[260px] whitespace-normal break-words align-top lg:max-w-[360px]">
                    <p
                      className="line-clamp-2 break-words text-sm font-semibold leading-snug text-foreground"
                      title={ticket.title}
                    >
                      {ticket.title}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          ticket.type === TicketType.MATERIAL
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-500"
                            : ""
                        }`}
                      >
                        {ticket.ticketType === EQUIPMENT_REQUEST_TYPE
                          ? "Alat & Kendaraan"
                          : typeLabels[ticket.type]}
                      </Badge>
                      <span className="inline-flex max-w-full items-center truncate rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                        {ticket.project
                          ? `${ticket.project.kelompokTani} — ${ticket.project.title}`
                          : "Kantor Pusat / Overhead"}
                      </span>
                      {hasAttachment && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                          <Paperclip className="size-3" />
                          Ada Nota / Bukti
                        </span>
                      )}
                      {ticket.items.some(
                        (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
                      ) && (
                        <span className="inline-flex items-center rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-600 dark:text-teal-300">
                          Kontrak Alam
                        </span>
                      )}
                      {ticket.items.length > 0 && (
                        <span className="inline-flex items-center rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {ticket.items.length} Item
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden align-top text-xs font-medium lg:table-cell">
                    {ticket.requester.name}
                  </TableCell>
                  <TableCell className="hidden align-top text-center lg:table-cell">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClass}`}
                    >
                      {priorityLabels[ticket.priority]}
                    </span>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1.5">
                      <Badge
                        variant={statusVariants[ticket.status]}
                        className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      >
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
                  <TableCell className="whitespace-nowrap align-top text-right text-sm font-bold tabular-nums">
                    {formatCurrency(ticket.totalAmount)}
                  </TableCell>
                  <TableCell
                    className="sticky right-0 z-10 w-[132px] border-l border-border/50 bg-card/95 align-top backdrop-blur-sm"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {renderTicketRowActions(ticket)}
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
                selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE
                  ? "Permintaan Alat & Kendaraan"
                  : selectedTicket.requestCategory
                  ? requestCategoryLabels[selectedTicket.requestCategory]
                  : typeLabels[selectedTicket.type]
              } · Prioritas ${priorityLabels[selectedTicket.priority]} · Status: ${statusLabels[selectedTicket.status]}`
            : ""
        }
        className="sm:max-w-4xl lg:max-w-5xl"
        footer={
          selectedTicket ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {selectedTicket.type === TicketType.MATERIAL &&
                  (role === UserRole.LOGISTICS ||
                    role === UserRole.DIRECTOR ||
                    role === UserRole.DEPUTY_DIRECTOR ||
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
                <TicketManagementActions
                  ticket={selectedTicket}
                  role={role}
                  mode="full"
                  onTicketDeleted={closeTicketSheet}
                />
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
                          run: submitTicketRequest,
                        }
                      : null);
                  const workflow = workflowFor(role, selectedTicket);
                  if (
                    role === UserRole.LOGISTICS &&
                    selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE &&
                    (selectedTicket.status === "PENDING_LOGISTIK" ||
                      selectedTicket.status ===
                        TicketStatus.PROCESSED_LOGISTIC)
                  ) {
                    return (
                      <Button
                        type="button"
                        onClick={() => {
                          setEquipmentSource("INTERNAL");
                          setEquipmentVendorName("");
                          setEquipmentQuotedCost("");
                          setEquipmentDecisionError("");
                          setEquipmentDecisionOpen(true);
                        }}
                      >
                        Proses Permintaan Alat
                      </Button>
                    );
                  }
                  if (workflow) {
                    const labels = {
                      LOGISTICS: "Lanjutkan Proses Logistik (DO)",
                      LOGISTICS_DO: "Terbitkan Surat Jalan (DO)",
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
                          if (workflow === "LOGISTICS_DO") {
                            const tid = selectedTicket.id;
                            setSelectedTicket(null);
                            setItemSelection(null);
                            router.push(`/apps/orders/new?type=do&ticketId=${encodeURIComponent(tid)}`);
                            return;
                          }
                          setWorkflowTicket(selectedTicket);
                        }}
                      >
                        {labels[workflow]}
                      </Button>
                    );
                  }
                  if (role === UserRole.FINANCE) {
                    const financeTarget = getFinanceActionTarget(selectedTicket);
                    if (financeTarget) {
                      return (
                        <Button asChild>
                          <Link href={financeTarget.href}>
                            {financeTarget.label}
                          </Link>
                        </Button>
                      );
                    }
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
            selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE
              ? "Permintaan Alat & Kendaraan"
              : (selectedTicket.requestCategory &&
                  requestCategoryLabels[selectedTicket.requestCategory]) ||
                parsedDesc.categoryFromDesc ||
                typeLabels[selectedTicket.type];

          return (
            <div className="space-y-4">
              {selectedTicket.equipmentDetails && (
                <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                  <h3 className="text-sm font-semibold">Detail alat/kendaraan</h3>
                  <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Alat/kendaraan</dt>
                      <dd>{selectedTicket.equipmentDetails.equipmentName || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Tanggal pakai</dt>
                      <dd>{selectedTicket.equipmentDetails.startDate || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Lama pakai</dt>
                      <dd>
                        {selectedTicket.equipmentDetails.duration ?? "-"}{" "}
                        {selectedTicket.equipmentDetails.timeUnit}
                      </dd>
                    </div>
                    {selectedTicket.equipmentDetails.fulfillmentSource && (
                      <div>
                        <dt className="text-muted-foreground">Pemenuhan</dt>
                        <dd>
                          {selectedTicket.equipmentDetails.fulfillmentSource ===
                          "INTERNAL"
                            ? "Alat internal"
                            : "Sewa vendor eksternal"}
                        </dd>
                      </div>
                    )}
                    {selectedTicket.equipmentDetails.vendorName && (
                      <div>
                        <dt className="text-muted-foreground">Vendor</dt>
                        <dd>{selectedTicket.equipmentDetails.vendorName}</dd>
                      </div>
                    )}
                    {selectedTicket.equipmentDetails.quotedCost != null && (
                      <div>
                        <dt className="text-muted-foreground">
                          Estimasi biaya sewa
                        </dt>
                        <dd>
                          {formatCurrency(
                            String(
                              selectedTicket.equipmentDetails.quotedCost,
                            ),
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
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
                        key={`${selectedTicket.id}-receipt-${index}-${url}`}
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
                          key={`${selectedTicket.id}-${label}-${url}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => openReceiptPreview({ label, url })}
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
                {selectedTicket.deliveryOrders?.map((deliveryOrder) => {
                  const hasOrderPhotos =
                    Boolean(deliveryOrder.arrivalPhotoUrl) ||
                    Boolean(deliveryOrder.deliveryReceiptUrl) ||
                    (deliveryOrder.receiptPhotos?.length ?? 0) > 0;
                  return (
                    <div
                      key={deliveryOrder.publicCode}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
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
                      {hasOrderPhotos && (
                        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                          {deliveryOrder.arrivalPhotoUrl && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() =>
                                openReceiptPreview({
                                  label: `Foto Material Tiba · ${deliveryOrder.doNumber}`,
                                  url: deliveryOrder.arrivalPhotoUrl!,
                                })
                              }
                            >
                              <Eye className="size-3" />
                              Foto Tiba
                            </Button>
                          )}
                          {deliveryOrder.deliveryReceiptUrl && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() =>
                                openReceiptPreview({
                                  label: `Bukti Penerimaan · ${deliveryOrder.doNumber}`,
                                  url: deliveryOrder.deliveryReceiptUrl!,
                                })
                              }
                            >
                              <Eye className="size-3" />
                              Bukti DO
                            </Button>
                          )}
                          {deliveryOrder.receiptPhotos?.map((photo, photoIdx) => (
                            <Button
                              key={photo.id}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() =>
                                openReceiptPreview({
                                  label: `Foto Serah Terima #${photoIdx + 1} · ${deliveryOrder.doNumber}`,
                                  url: photo.url,
                                })
                              }
                            >
                              <Eye className="size-3" />
                              Serah Terima #{photoIdx + 1}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {selectedTicket.directStockPurchases?.map((purchase) => {
                  const stageLabel =
                    purchase.status === "RECEIVED"
                      ? "Diterima · Siap Di-DO"
                      : purchase.hasFinanceProof
                        ? "Siap Diterima Logistik"
                        : purchase.vendorInvoiceUrl
                          ? "Menunggu Pembayaran Finance"
                          : purchase.isApprovedByDirector
                            ? "Menunggu Invoice/Bon Logistik"
                            : "Menunggu Persetujuan Direktur";
                  const purchasePhotoUrls =
                    purchase.receivedPhotos && purchase.receivedPhotos.length > 0
                      ? purchase.receivedPhotos
                      : purchase.arrivalPhotoUrl
                        ? [purchase.arrivalPhotoUrl]
                        : [];
                  return (
                    <div
                      key={purchase.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Pembelian Langsung Toko
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-foreground">
                            {purchase.purchaseNumber} · {purchase.vendorName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(purchase.totalAmount)} · {stageLabel}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              purchase.status === "RECEIVED"
                                ? "lightSuccess"
                                : "lightWarning"
                            }
                          >
                            {stageLabel}
                          </Badge>
                          {purchase.status === "PENDING_RECEIPT" &&
                            role === UserRole.FINANCE &&
                            purchase.isApprovedByDirector &&
                            Boolean(purchase.vendorInvoiceUrl) &&
                            !purchase.hasFinanceProof && (
                              <Button
                                asChild
                                size="sm"
                                className="h-8 text-xs"
                              >
                                <Link
                                  href={`/apps/finance?tab=payment&openSheet=${encodeURIComponent(purchase.id)}`}
                                >
                                  Bayar di Finance
                                </Link>
                              </Button>
                            )}
                          {purchase.status === "PENDING_RECEIPT" &&
                            role !== UserRole.FINANCE && (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                              >
                                <Link href="/apps/logistics?tab=stock">
                                  Kelola di Stok
                                </Link>
                              </Button>
                            )}
                        </div>
                      </div>
                      {(purchase.vendorInvoiceUrl || purchasePhotoUrls.length > 0) && (
                        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                          {purchase.vendorInvoiceUrl && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() =>
                                openReceiptPreview({
                                  label: `Invoice/Bon · ${purchase.purchaseNumber}`,
                                  url: purchase.vendorInvoiceUrl!,
                                })
                              }
                            >
                              <Eye className="size-3" />
                              Invoice/Bon
                            </Button>
                          )}
                          {purchasePhotoUrls.map((photoUrl, photoIdx) => (
                            <Button
                              key={`${purchase.id}-photo-${photoIdx}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={() =>
                                openReceiptPreview({
                                  label: `Foto Tiba #${photoIdx + 1} · ${purchase.purchaseNumber}`,
                                  url: photoUrl,
                                })
                              }
                            >
                              <Eye className="size-3" />
                              Foto Tiba #{photoIdx + 1}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3B. Kontrak Material Alam & Surat Jalan (DO) */}
            {(selectedTicket.items.some(
              (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
            ) ||
              (selectedTicket.materialDeliveries?.length ?? 0) > 0) && (
              <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Kontrak Material Alam &amp; Surat Jalan (DO)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Pengadaan material alam menggunakan Kontrak Payung vendor tanpa PO baru. Catat setiap kedatangan truk agar progres item dan penyelesaian tiket tersinkron otomatis.
                    </p>
                  </div>
                  {canRecordContractDo &&
                    hasOpenContractDelivery(selectedTicket) && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 gap-1.5 text-xs"
                        onClick={() => setContractDoModalTicket(selectedTicket)}
                      >
                        <Truck className="size-3.5" />
                        Catat Surat Jalan (DO)
                      </Button>
                    )}
                </div>

                {contractDoFeedback && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      contractDoFeedback.isError
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {contractDoFeedback.text}
                  </div>
                )}

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {selectedTicket.items
                    .filter(
                      (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
                    )
                    .map((item) => {
                      const delivered = getContractItemDeliveredVolume(
                        selectedTicket,
                        item.materialContractId,
                      );
                      const remaining = Math.max(0, item.quantity - delivered);
                      const isDone =
                        item.status === FulfillmentStatus.PROCESSED_TO_DO ||
                        remaining <= 0;
                      return (
                        <div
                          key={`contract-progress-${item.id}`}
                          className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-bold text-foreground">
                                {item.itemName}
                              </p>
                              {item.materialContract && (
                                <p className="text-[11px] text-muted-foreground">
                                  {item.materialContract.contractNumber} ·{" "}
                                  {item.materialContract.vendorName} ·{" "}
                                  {formatCurrency(
                                    String(item.materialContract.unitPrice),
                                  )}
                                  /{item.unit}
                                </p>
                              )}
                            </div>
                            <Badge variant={isDone ? "lightSuccess" : "lightWarning"}>
                              {isDone ? "Terpenuhi" : "Aktif"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
                            <span>
                              Diminta:{" "}
                              <strong className="text-foreground">
                                {formatMaterialVolume(item.quantity, item.unit)}
                              </strong>
                            </span>
                            <span>
                              Terkirim:{" "}
                              <strong className="text-emerald-600 dark:text-emerald-400">
                                {formatMaterialVolume(delivered, item.unit)}
                              </strong>
                            </span>
                            <span>
                              Sisa:{" "}
                              <strong className="text-foreground">
                                {formatMaterialVolume(remaining, item.unit)}
                              </strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {(selectedTicket.materialDeliveries?.length ?? 0) > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>Tanggal</TableHead>
                          <TableHead>No. DO &amp; Truk</TableHead>
                          <TableHead>Kontrak</TableHead>
                          <TableHead className="text-right">Volume</TableHead>
                          <TableHead className="text-right">Nilai Kontrak</TableHead>
                          <TableHead>Status Tagihan</TableHead>
                          <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTicket.materialDeliveries!.map((delivery) => (
                          <TableRow key={delivery.id}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {delivery.deliveryDate}
                            </TableCell>
                            <TableCell>
                              <div className="text-xs font-bold">
                                {delivery.doNumber}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {delivery.vehiclePlate || "-"}
                                {delivery.driverName ? ` · ${delivery.driverName}` : ""}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs font-medium">
                                {delivery.materialType} · {delivery.vendorName}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {delivery.contractNumber}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs font-semibold">
                              {formatMaterialVolume(
                                delivery.quantityReceived,
                                delivery.unit,
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs font-medium">
                              {formatCurrency(String(delivery.estimatedAmount))}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  delivery.billingStatus === "BILLED"
                                    ? "lightSuccess"
                                    : "lightWarning"
                                }
                              >
                                {delivery.billingStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {delivery.proofUrl && (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    title="Lihat Foto Surat Jalan"
                                    onClick={() =>
                                      openReceiptPreview({
                                        label: `Surat Jalan ${delivery.doNumber}`,
                                        url: delivery.proofUrl!,
                                      })
                                    }
                                  >
                                    <Eye className="size-3.5" />
                                  </Button>
                                )}
                                {canRecordContractDo &&
                                  delivery.billingStatus === "UNBILLED" && (
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7"
                                      disabled={
                                        isPending ||
                                        deletingDeliveryId === delivery.id
                                      }
                                      title="Hapus DO belum ditagih"
                                      onClick={() =>
                                        handleDeleteContractDelivery(
                                          delivery.id,
                                          delivery.doNumber,
                                        )
                                      }
                                    >
                                      <Trash2 className="size-3.5 text-destructive" />
                                    </Button>
                                  )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Belum ada Surat Jalan (DO) material alam yang tercatat untuk tiket ini.
                  </p>
                )}
              </section>
            )}

            {/* 4. Tabel Rincian Item & Pemenuhan Stok */}
            {(selectedTicket.items.length > 0 ||
              (canExecutiveManageTicket &&
                selectedTicket.type === TicketType.MATERIAL)) && (
              <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-foreground">
                        Rincian Item Permintaan ({selectedTicket.items.length} Item)
                      </h3>
                      {isExecutive && selectedTicketFinanceLocked && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/40 bg-amber-500/10 text-[11px] font-medium text-amber-500"
                        >
                          <Lock className="size-3" />
                          Terkunci · Sudah Diproses Keuangan
                        </Badge>
                      )}
                    </div>
                    {canSplitFulfillment && (
                      <p className="text-xs text-muted-foreground">
                        Centang item gudang/pembelian di bawah untuk memeriksa stok (DO) atau menerbitkan PO pengadaan. Item Kontrak Material Alam dipenuhi lewat Surat Jalan (DO) Kontrak di atas.
                      </p>
                    )}
                    {canExecutiveManageTicket && (
                      <p className="text-xs text-muted-foreground">
                        Direktur &amp; Wakil Direktur dapat menambah barang, mengubah rincian, atau menghapus barang selama tiket belum diproses Keuangan.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canExecutiveManageTicket && (
                      <Button
                        type="button"
                        size="sm"
                        variant={addingItemOpen ? "secondary" : "outline"}
                        disabled={executiveItemPending || fulfillmentPending}
                        onClick={() => {
                          if (addingItemOpen) {
                            setAddingItemOpen(false);
                          } else {
                            openAddItemForm();
                          }
                        }}
                        className="h-9 gap-1.5 border-primary/40 text-xs font-semibold text-primary hover:bg-primary/10"
                      >
                        <Plus className="size-3.5" />
                        Tambah Barang
                      </Button>
                    )}
                    {canSplitFulfillment && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            selectedStockItems.length === 0 || fulfillmentPending
                          }
                          onClick={prepareWarehouseFulfillment}
                          className="h-9 gap-1.5 text-xs"
                        >
                          <PackageOpen className="size-3.5" />
                          Periksa &amp; Penuhi dari Stok ({selectedStockItems.length})
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={
                            selectedStockItems.length === 0 || fulfillmentPending
                          }
                          onClick={() => {
                            if (!selectedTicket || selectedStockItems.length === 0)
                              return;
                            const ticketId = selectedTicket.id;
                            const itemIds = selectedStockItems.map(
                              (item) => item.id,
                            );
                            setFulfillmentMessage("");
                            setStockAvailability([]);
                            setItemSelection({ ticketId, itemIds });
                            setPurchaseMode("DIRECT_PURCHASE");
                            setPoDialogOpen(true);
                          }}
                          className="h-9 gap-1.5 text-xs"
                        >
                          <ShoppingCart className="size-3.5" />
                          Pembelian Langsung / PO ({selectedStockItems.length})
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {executiveItemFeedback && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                      executiveItemFeedback.isError
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                    }`}
                    role={executiveItemFeedback.isError ? "alert" : "status"}
                  >
                    {executiveItemFeedback.text}
                  </div>
                )}

                {canExecutiveManageTicket && addingItemOpen && (
                  <div className="space-y-3 rounded-xl border border-primary/35 bg-primary/5 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                        Tambah Barang Baru ke Tiket
                      </h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={executiveItemPending}
                        onClick={() => setAddingItemOpen(false)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    {stockItems.length > 0 && (
                      <div className="space-y-1">
                        <FormLabel className="text-xs text-muted-foreground">
                          Pilih dari Katalog Stok Gudang (Opsional)
                        </FormLabel>
                        <select
                          value={newItemStockId}
                          disabled={executiveItemPending}
                          onChange={(event) => {
                            const val = event.target.value;
                            setNewItemStockId(val);
                            const found = stockItems.find((s) => s.id === val);
                            if (found) {
                              setNewItemName(found.name);
                              setNewItemUnit(found.unit);
                              if (
                                found.unitPrice &&
                                Number(found.unitPrice) > 0
                              ) {
                                setNewItemCost(String(Number(found.unitPrice)));
                              }
                            }
                          }}
                          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                        >
                          <option value="">
                            — Ketik manual atau pilih SKU dari katalog stok —
                          </option>
                          {stockItems.map((stock) => (
                            <option key={stock.id} value={stock.id}>
                              {stock.sku} — {stock.name} ({stock.unit})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-6">
                      <div className="space-y-1 sm:col-span-2">
                        <FormLabel className="text-xs">Nama Barang *</FormLabel>
                        <Input
                          value={newItemName}
                          maxLength={160}
                          placeholder="Contoh: Semen 40 Kg"
                          disabled={executiveItemPending}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <FormLabel className="text-xs">Jumlah *</FormLabel>
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          value={newItemQuantity}
                          disabled={executiveItemPending}
                          onChange={(e) => setNewItemQuantity(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <FormLabel className="text-xs">Satuan *</FormLabel>
                        <Input
                          value={newItemUnit}
                          maxLength={32}
                          placeholder="Zak / pcs / m2"
                          disabled={executiveItemPending}
                          onChange={(e) => setNewItemUnit(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <FormLabel className="text-xs">
                          Harga Satuan (Rp)
                        </FormLabel>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Opsional"
                          value={newItemCost}
                          disabled={executiveItemPending}
                          onChange={(e) => setNewItemCost(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <FormLabel className="text-xs">Sumber</FormLabel>
                        <select
                          value={newItemCategoryHint}
                          disabled={executiveItemPending}
                          onChange={(e) =>
                            setNewItemCategoryHint(
                              e.target.value as TicketCategoryHint,
                            )
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value={TicketCategoryHint.WAREHOUSE}>
                            Stok Gudang
                          </option>
                          <option value={TicketCategoryHint.PURCHASE}>
                            Pembelian
                          </option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-2 pt-1">
                      <div className="w-full space-y-1 sm:w-48">
                        <FormLabel className="text-xs">Target Tiba</FormLabel>
                        <Input
                          type="date"
                          value={newItemDeliveryDate}
                          disabled={executiveItemPending}
                          onChange={(e) =>
                            setNewItemDeliveryDate(e.target.value)
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={executiveItemPending}
                          onClick={() => setAddingItemOpen(false)}
                        >
                          Batal
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          disabled={
                            executiveItemPending ||
                            !newItemName.trim() ||
                            !newItemUnit.trim() ||
                            !(Number(newItemQuantity) > 0)
                          }
                          onClick={() => void handleExecutiveAddItem()}
                        >
                          <Plus className="size-3.5" />
                          {executiveItemPending
                            ? "Menyimpan..."
                            : "Simpan Barang"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mobile Card View untuk Rincian Item Permintaan (< 768px) */}
                <div className="space-y-2.5 md:hidden">
                  {canSplitFulfillment && pendingTicketItemIds.length > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                        <Checkbox
                          checked={
                            allPendingItemsSelected
                              ? true
                              : somePendingItemsSelected
                                ? "indeterminate"
                                : false
                          }
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
                        <span>Pilih Semua Item Pending ({pendingTicketItemIds.length})</span>
                      </label>
                    </div>
                  )}

                  {selectedTicket.items.map((item) => {
                    const isEditingThisRow = editingItemId === item.id;
                    const isConfirmingDeleteThisRow =
                      confirmDeleteItemId === item.id;
                    const isContractItem =
                      item.categoryHint === TicketCategoryHint.CONTRACT;
                    const activeDirectPurchase =
                      item.status === FulfillmentStatus.PENDING
                        ? selectedTicket.directStockPurchases?.find(
                            (purchase) =>
                              purchase.status === "PENDING_RECEIPT" &&
                              (purchase.items ?? []).some((purchaseItem) => {
                                if (
                                  item.stockItemId &&
                                  purchaseItem.stockItemId
                                ) {
                                  return (
                                    purchaseItem.stockItemId ===
                                    item.stockItemId
                                  );
                                }
                                return (
                                  purchaseItem.itemName.trim().toLowerCase() ===
                                    item.itemName.trim().toLowerCase() &&
                                  purchaseItem.unit.trim().toLowerCase() ===
                                    item.unit.trim().toLowerCase()
                                );
                              }),
                          )
                        : undefined;

                    if (isEditingThisRow && canExecutiveManageTicket) {
                      return (
                        <div
                          key={item.id}
                          className="space-y-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3"
                        >
                          <div className="grid grid-cols-1 gap-2">
                            <Input
                              value={editItemName}
                              maxLength={160}
                              disabled={isContractItem || executiveItemPending}
                              onChange={(e) => setEditItemName(e.target.value)}
                              className="h-8 text-xs"
                              placeholder="Nama barang"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min="0.01"
                                step="any"
                                value={editItemQuantity}
                                disabled={executiveItemPending}
                                onChange={(e) =>
                                  setEditItemQuantity(e.target.value)
                                }
                                className="h-8 text-xs"
                                placeholder="Jumlah"
                              />
                              <Input
                                value={editItemUnit}
                                maxLength={32}
                                disabled={isContractItem || executiveItemPending}
                                onChange={(e) => setEditItemUnit(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Satuan"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={editItemCost}
                                disabled={executiveItemPending}
                                onChange={(e) => setEditItemCost(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Harga Satuan (Rp)"
                              />
                              {isContractItem ? (
                                <div className="flex items-center">
                                  <Badge variant="outline">Kontrak Alam</Badge>
                                </div>
                              ) : (
                                <select
                                  value={editItemCategoryHint}
                                  disabled={executiveItemPending}
                                  onChange={(e) =>
                                    setEditItemCategoryHint(
                                      e.target.value as TicketCategoryHint,
                                    )
                                  }
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  <option value={TicketCategoryHint.WAREHOUSE}>
                                    Stok Gudang
                                  </option>
                                  <option value={TicketCategoryHint.PURCHASE}>
                                    Pembelian
                                  </option>
                                </select>
                              )}
                            </div>
                            <Input
                              type="date"
                              value={editItemDeliveryDate}
                              disabled={executiveItemPending}
                              onChange={(e) =>
                                setEditItemDeliveryDate(e.target.value)
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2.5 text-xs"
                              disabled={executiveItemPending}
                              onClick={() => setEditingItemId(null)}
                            >
                              Batal
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 gap-1 px-2.5 text-xs"
                              disabled={executiveItemPending}
                              onClick={() =>
                                void handleExecutiveUpdateItem(item.id)
                              }
                            >
                              <Save className="size-3" />
                              Simpan
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    const deliveredContractVolume =
                      item.categoryHint === TicketCategoryHint.CONTRACT
                        ? getContractItemDeliveredVolume(
                            selectedTicket,
                            item.materialContractId,
                          )
                        : 0;

                    return (
                      <div
                        key={item.id}
                        className="space-y-2 rounded-lg border border-border/80 bg-card p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            {canSplitFulfillment && (
                              <Checkbox
                                className="mt-0.5"
                                checked={selectedItemIds.includes(item.id)}
                                disabled={
                                  item.status !== FulfillmentStatus.PENDING ||
                                  item.categoryHint ===
                                    TicketCategoryHint.CONTRACT
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
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-snug text-foreground">
                                {item.itemName}
                              </p>
                              {item.categoryHint ===
                                TicketCategoryHint.CONTRACT &&
                                item.materialContract && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {item.materialContract.contractNumber} ·{" "}
                                    {item.materialContract.vendorName}
                                  </p>
                                )}
                            </div>
                          </div>
                          <Badge
                            variant={
                              item.status === FulfillmentStatus.PENDING
                                ? "lightWarning"
                                : "lightSuccess"
                            }
                            className="shrink-0"
                          >
                            {item.categoryHint === TicketCategoryHint.CONTRACT
                              ? item.status === FulfillmentStatus.PROCESSED_TO_DO
                                ? `Dipenuhi (${formatMaterialVolume(deliveredContractVolume, item.unit)})`
                                : deliveredContractVolume > 0
                                  ? `Parsial (${formatMaterialVolume(deliveredContractVolume, item.unit)} / ${formatMaterialVolume(item.quantity, item.unit)})`
                                  : "Menunggu DO Kontrak"
                              : item.status === FulfillmentStatus.PENDING
                                ? activeDirectPurchase
                                  ? `Dipesan · ${activeDirectPurchase.purchaseNumber}`
                                  : "Menunggu"
                                : item.status ===
                                    FulfillmentStatus.PROCESSED_TO_DO
                                  ? "Dipenuhi via DO"
                                  : "Diproses via PO"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md bg-muted/30 p-2 text-xs">
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Jumlah
                            </span>
                            <p className="font-semibold text-foreground">
                              {item.quantity} {item.unit}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Harga Satuan
                            </span>
                            <p className="font-semibold tabular-nums text-foreground">
                              {formatCurrency(item.estimatedCost)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Sumber
                            </span>
                            <p className="font-medium text-foreground">
                              {item.categoryHint ===
                              TicketCategoryHint.WAREHOUSE
                                ? "Stok Gudang"
                                : item.categoryHint ===
                                    TicketCategoryHint.CONTRACT
                                  ? "Kontrak Alam"
                                  : "Pembelian"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Target Tiba
                            </span>
                            <p className="font-medium text-foreground">
                              {item.expectedDeliveryDate ?? "—"}
                            </p>
                          </div>
                        </div>

                        {canExecutiveManageTicket && (
                          <div className="flex items-center justify-end gap-1.5 border-t border-border/60 pt-2">
                            {isConfirmingDeleteThisRow ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 px-2.5 text-xs"
                                  disabled={deletingItemId === item.id}
                                  onClick={() =>
                                    void handleExecutiveDeleteItem(item.id)
                                  }
                                >
                                  {deletingItemId === item.id
                                    ? "Menghapus..."
                                    : "Ya, Hapus"}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2.5 text-xs"
                                  disabled={deletingItemId === item.id}
                                  onClick={() => setConfirmDeleteItemId(null)}
                                >
                                  Batal
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2.5 text-xs"
                                  onClick={() => openEditItemRow(item)}
                                >
                                  <Pencil className="size-3" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                  disabled={selectedTicket.items.length <= 1}
                                  onClick={() => setConfirmDeleteItemId(item.id)}
                                >
                                  <Trash2 className="size-3" />
                                  Hapus
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View (>= 768px) */}
                <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        {canSplitFulfillment && (
                          <TableHead className="w-9 px-2.5 py-2">
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
                        <TableHead className="px-2.5 py-2 text-xs">Nama Item</TableHead>
                        <TableHead className="px-2.5 py-2 text-xs">Jumlah</TableHead>
                        <TableHead className="px-2.5 py-2 text-xs">Harga Satuan</TableHead>
                        <TableHead className="px-2.5 py-2 text-xs">Sumber</TableHead>
                        <TableHead className="px-2.5 py-2 text-xs">Target Tiba</TableHead>
                        <TableHead className="px-2.5 py-2 text-xs">Status Pemenuhan</TableHead>
                        {canExecutiveManageTicket && (
                          <TableHead className="px-2.5 py-2 text-right text-xs">Aksi</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTicket.items.map((item) => {
                        const isEditingThisRow = editingItemId === item.id;
                        const isConfirmingDeleteThisRow =
                          confirmDeleteItemId === item.id;
                        const isContractItem =
                          item.categoryHint === TicketCategoryHint.CONTRACT;
                        const activeDirectPurchase =
                          item.status === FulfillmentStatus.PENDING
                            ? selectedTicket.directStockPurchases?.find(
                                (purchase) =>
                                  purchase.status === "PENDING_RECEIPT" &&
                                  (purchase.items ?? []).some((purchaseItem) => {
                                    if (
                                      item.stockItemId &&
                                      purchaseItem.stockItemId
                                    ) {
                                      return (
                                        purchaseItem.stockItemId ===
                                        item.stockItemId
                                      );
                                    }
                                    return (
                                      purchaseItem.itemName
                                        .trim()
                                        .toLowerCase() ===
                                        item.itemName.trim().toLowerCase() &&
                                      purchaseItem.unit.trim().toLowerCase() ===
                                        item.unit.trim().toLowerCase()
                                    );
                                  }),
                              )
                            : undefined;
                        if (isEditingThisRow && canExecutiveManageTicket) {
                          return (
                            <TableRow
                              key={item.id}
                              className="bg-primary/5 align-top"
                            >
                              {canSplitFulfillment && <TableCell />}
                              <TableCell className="min-w-[160px]">
                                <Input
                                  value={editItemName}
                                  maxLength={160}
                                  disabled={
                                    isContractItem || executiveItemPending
                                  }
                                  onChange={(e) =>
                                    setEditItemName(e.target.value)
                                  }
                                  className="h-8 text-xs"
                                  placeholder="Nama barang"
                                />
                              </TableCell>
                              <TableCell className="min-w-[130px]">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min="0.01"
                                    step="any"
                                    value={editItemQuantity}
                                    disabled={executiveItemPending}
                                    onChange={(e) =>
                                      setEditItemQuantity(e.target.value)
                                    }
                                    className="h-8 w-16 px-2 text-xs"
                                  />
                                  <Input
                                    value={editItemUnit}
                                    maxLength={32}
                                    disabled={
                                      isContractItem || executiveItemPending
                                    }
                                    onChange={(e) =>
                                      setEditItemUnit(e.target.value)
                                    }
                                    className="h-8 w-16 px-2 text-xs"
                                    placeholder="Satuan"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="min-w-[120px]">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={editItemCost}
                                  disabled={executiveItemPending}
                                  onChange={(e) =>
                                    setEditItemCost(e.target.value)
                                  }
                                  className="h-8 text-xs"
                                  placeholder="Rp"
                                />
                              </TableCell>
                              <TableCell className="min-w-[120px]">
                                {isContractItem ? (
                                  <Badge variant="outline">Kontrak Alam</Badge>
                                ) : (
                                  <select
                                    value={editItemCategoryHint}
                                    disabled={executiveItemPending}
                                    onChange={(e) =>
                                      setEditItemCategoryHint(
                                        e.target.value as TicketCategoryHint,
                                      )
                                    }
                                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                  >
                                    <option value={TicketCategoryHint.WAREHOUSE}>
                                      Stok Gudang
                                    </option>
                                    <option value={TicketCategoryHint.PURCHASE}>
                                      Pembelian
                                    </option>
                                  </select>
                                )}
                              </TableCell>
                              <TableCell className="min-w-[125px]">
                                <Input
                                  type="date"
                                  value={editItemDeliveryDate}
                                  disabled={executiveItemPending}
                                  onChange={(e) =>
                                    setEditItemDeliveryDate(e.target.value)
                                  }
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                Mengedit...
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs"
                                    disabled={executiveItemPending}
                                    onClick={() =>
                                      void handleExecutiveUpdateItem(item.id)
                                    }
                                  >
                                    <Save className="size-3" />
                                    Simpan
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    disabled={executiveItemPending}
                                    onClick={() => setEditingItemId(null)}
                                  >
                                    Batal
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        }
                        return (
                          <TableRow key={item.id}>
                            {canSplitFulfillment && (
                              <TableCell>
                                <Checkbox
                                  checked={selectedItemIds.includes(item.id)}
                                  disabled={
                                    item.status !== FulfillmentStatus.PENDING ||
                                    item.categoryHint ===
                                      TicketCategoryHint.CONTRACT
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
                              <div>{item.itemName}</div>
                              {item.categoryHint ===
                                TicketCategoryHint.CONTRACT &&
                                item.materialContract && (
                                  <div className="text-[11px] font-normal text-muted-foreground">
                                    {item.materialContract.contractNumber} ·{" "}
                                    {item.materialContract.vendorName}
                                  </div>
                                )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {item.quantity} {item.unit}
                            </TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums">
                              {formatCurrency(item.estimatedCost)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.categoryHint ===
                                TicketCategoryHint.WAREHOUSE
                                  ? "Stok Gudang"
                                  : item.categoryHint ===
                                      TicketCategoryHint.CONTRACT
                                    ? "Kontrak Alam"
                                    : "Pembelian"}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {item.expectedDeliveryDate ?? "—"}
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const deliveredContractVolume =
                                  item.categoryHint ===
                                  TicketCategoryHint.CONTRACT
                                    ? getContractItemDeliveredVolume(
                                        selectedTicket,
                                        item.materialContractId,
                                      )
                                    : 0;
                                return (
                                  <Badge
                                    variant={
                                      item.status === FulfillmentStatus.PENDING
                                        ? "lightWarning"
                                        : "lightSuccess"
                                    }
                                  >
                                    {item.categoryHint ===
                                    TicketCategoryHint.CONTRACT
                                      ? item.status ===
                                        FulfillmentStatus.PROCESSED_TO_DO
                                        ? `Dipenuhi (${formatMaterialVolume(deliveredContractVolume, item.unit)})`
                                        : deliveredContractVolume > 0
                                          ? `Parsial (${formatMaterialVolume(deliveredContractVolume, item.unit)} / ${formatMaterialVolume(item.quantity, item.unit)})`
                                          : "Menunggu DO Kontrak"
                                      : item.status ===
                                          FulfillmentStatus.PENDING
                                        ? activeDirectPurchase
                                          ? `Dipesan · ${activeDirectPurchase.purchaseNumber}`
                                          : "Menunggu"
                                        : item.status ===
                                            FulfillmentStatus.PROCESSED_TO_DO
                                          ? "Dipenuhi via DO"
                                          : "Diproses via PO"}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            {canExecutiveManageTicket && (
                              <TableCell className="whitespace-nowrap text-right">
                                {isConfirmingDeleteThisRow ? (
                                  <div className="inline-flex items-center justify-end gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      className="h-7 px-2 text-xs"
                                      disabled={deletingItemId === item.id}
                                      onClick={() =>
                                        void handleExecutiveDeleteItem(item.id)
                                      }
                                    >
                                      {deletingItemId === item.id
                                        ? "Menghapus..."
                                        : "Ya, Hapus"}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      disabled={deletingItemId === item.id}
                                      onClick={() =>
                                        setConfirmDeleteItemId(null)
                                      }
                                    >
                                      Batal
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center justify-end gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 px-2 text-xs"
                                      title={`Edit ${item.itemName}`}
                                      onClick={() => openEditItemRow(item)}
                                    >
                                      <Pencil className="size-3" />
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 gap-1 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                      title={
                                        selectedTicket.items.length <= 1
                                          ? "Minimal 1 barang pada tiket (gunakan Hapus Tiket di bawah untuk menghapus seluruh tiket)"
                                          : `Hapus ${item.itemName}`
                                      }
                                      disabled={selectedTicket.items.length <= 1}
                                      onClick={() =>
                                        setConfirmDeleteItemId(item.id)
                                      }
                                    >
                                      <Trash2 className="size-3" />
                                      Hapus
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
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
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() =>
                                  openReceiptPreview({
                                    label: `Bukti Pembayaran · ${selectedTicket.ticketNumber}`,
                                    url: payment.proofOfTransferUrl!,
                                  })
                                }
                              >
                                <Eye className="size-3" />
                                Bukti
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

      <GlobalModal
        isOpen={equipmentDecisionOpen}
        onClose={() => {
          if (equipmentDecisionPending) return;
          setEquipmentDecisionOpen(false);
          setEquipmentDecisionError("");
        }}
        title="Proses Permintaan Alat"
        description="Tentukan apakah kebutuhan dipenuhi dari aset internal atau melalui penyewaan vendor."
        className="sm:max-w-xl"
      >
        <div className="space-y-4">
          <RadioGroup
            value={equipmentSource}
            onValueChange={(value) =>
              setEquipmentSource(
                value === "EXTERNAL_VENDOR" ? "EXTERNAL_VENDOR" : "INTERNAL",
              )
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <FormLabel
              htmlFor="equipment-source-internal"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                equipmentSource === "INTERNAL"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <RadioGroupItem
                value="INTERNAL"
                id="equipment-source-internal"
              />
              <span>
                <span className="block font-semibold">Alat Internal</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Tandai permintaan selesai dengan aset perusahaan.
                </span>
              </span>
            </FormLabel>
            <FormLabel
              htmlFor="equipment-source-vendor"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                equipmentSource === "EXTERNAL_VENDOR"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <RadioGroupItem
                value="EXTERNAL_VENDOR"
                id="equipment-source-vendor"
              />
              <span>
                <span className="block font-semibold">Sewa Vendor Eksternal</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Kirim estimasi biaya sewa ke Finance untuk pembayaran.
                </span>
              </span>
            </FormLabel>
          </RadioGroup>
          {equipmentSource === "EXTERNAL_VENDOR" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormLabel className="space-y-1.5 text-sm">
                <span className="font-semibold">Nama Vendor</span>
                <Input
                  value={equipmentVendorName}
                  onChange={(event) =>
                    setEquipmentVendorName(event.target.value)
                  }
                  maxLength={160}
                  placeholder="Nama penyedia alat"
                  disabled={equipmentDecisionPending}
                  required
                />
              </FormLabel>
              <FormLabel className="space-y-1.5 text-sm">
                <span className="font-semibold">Estimasi Biaya Sewa (IDR)</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={equipmentQuotedCost}
                  onChange={(event) =>
                    setEquipmentQuotedCost(event.target.value)
                  }
                  placeholder="Contoh: 1500000"
                  disabled={equipmentDecisionPending}
                  required
                />
              </FormLabel>
            </div>
          )}
          {equipmentDecisionError && (
            <p className="text-sm text-destructive" role="alert">
              {equipmentDecisionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEquipmentDecisionOpen(false)}
              disabled={equipmentDecisionPending}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={processEquipmentLogisticsDecision}
              disabled={
                equipmentDecisionPending ||
                (equipmentSource === "EXTERNAL_VENDOR" &&
                  (!equipmentVendorName.trim() ||
                    !equipmentQuotedCost ||
                    Number(equipmentQuotedCost) <= 0))
              }
            >
              {equipmentDecisionPending ? "Menyimpan..." : "Simpan Keputusan"}
            </Button>
          </div>
        </div>
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
        description="Status stok dihitung otomatis untuk barang yang dipilih. Buat Surat Jalan (DO) untuk barang ready dan teruskan barang yang kurang ke pengadaan PO atau Pembelian Langsung."
        className="sm:max-w-4xl"
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
            {stockAvailability.length === 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={prepareWarehouseFulfillment}
                  disabled={fulfillmentPending}
                  className="gap-1.5"
                >
                  <RefreshCw className={`size-3.5 ${fulfillmentPending ? "animate-spin" : ""}`} />
                  Coba Periksa Ulang
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!selectedTicket || selectedStockItems.length === 0) return;
                    const ticketId = selectedTicket.id;
                    const itemIds = selectedStockItems.map((item) => item.id);
                    setFulfillmentMessage("");
                    setDoDialogOpen(false);
                    setStockAvailability([]);
                    setItemSelection({ ticketId, itemIds });
                    setPurchaseMode("DIRECT_PURCHASE");
                    setPoDialogOpen(true);
                  }}
                  disabled={fulfillmentPending || selectedStockItems.length === 0}
                  className="gap-1.5"
                >
                  <ShoppingCart className="size-3.5" />
                  Alihkan ke Pengadaan / Pembelian Langsung ({selectedStockItems.length})
                </Button>
              </>
            )}
            {stockAvailability.some((a) => Boolean(a.pendingPurchaseNumber)) && (
              <Button asChild type="button" variant="outline">
                <Link href="/apps/logistics?tab=stock">
                  Kelola di Stok Gudang
                </Link>
              </Button>
            )}
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
            <Table className="w-full table-auto">
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="min-w-[140px]">Barang yang Dibutuhkan</TableHead>
                  <TableHead className="whitespace-nowrap">Jumlah</TableHead>
                  <TableHead className="whitespace-nowrap">Stok Tersedia</TableHead>
                  <TableHead className="min-w-[260px]">Status Ketersediaan</TableHead>
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
                      <TableCell className="align-top font-medium whitespace-normal break-words">
                        {item.itemName}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap tabular-nums">
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap tabular-nums">
                        {availability
                          ? `${availability.availableQuantity} ${item.unit}`
                          : "Belum diperiksa"}
                      </TableCell>
                      <TableCell className="align-top whitespace-normal">
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
                          <span className="mt-1.5 block whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">
                            {availability.message}
                          </span>
                        )}
                        {availability?.stockItemSku && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            SKU gudang: {availability.stockItemSku}
                          </span>
                        )}
                        {availability && !availability.pendingPurchaseNumber && (
                          <label className="mt-2 block w-full max-w-md space-y-1 text-xs text-muted-foreground">
                            <span>Tautkan ke SKU katalog stok</span>
                            <select
                              value={availability.stockItemId ?? ""}
                              onChange={(event) =>
                                void mapTicketItemToSku(
                                  item.id,
                                  event.target.value,
                                )
                              }
                              disabled={
                                fulfillmentPending || stockItems.length === 0
                              }
                              className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                            >
                              <option value="">Pilih SKU</option>
                              {stockItems.map((stockItem) => (
                                <option
                                  key={stockItem.id}
                                  value={stockItem.id}
                                >
                                  {stockItem.sku} — {stockItem.name} ·{" "}
                                  {stockItem.unit}
                                </option>
                              ))}
                            </select>
                          </label>
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
              <FormLabel className="min-w-0 space-y-1.5 text-sm">
                <span className="font-semibold">Mover Pengiriman</span>
                <select
                  value={selectedMoverId}
                  onChange={(event) => setSelectedMoverId(event.target.value)}
                  disabled={fulfillmentPending || moverOptions.length === 0}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
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
              <FormLabel className="min-w-0 space-y-1.5 text-sm">
                <span className="font-semibold">Kendaraan Operasional</span>
                <select
                  value={selectedVehicleId}
                  onChange={(event) => setSelectedVehicleId(event.target.value)}
                  disabled={fulfillmentPending || vehicleOptions.length === 0}
                  className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
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
                stockItemId: item.stockItemId,
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
                stockItemId: item.stockItemId,
                itemName: item.itemName,
                quantity: item.quantity,
                unit: item.unit,
                estimatedCost: item.estimatedCost,
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
        onClose={closeReceiptPreview}
        title={selectedReceipt?.label ?? "Pratinjau Bukti Dokumen"}
        description="Pratinjau dokumen/foto bukti terunggah. Klik tombol Unduh di bawah untuk menyimpan salinan file."
        className="max-w-4xl"
        footer={
          selectedReceipt ? (
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeReceiptPreview}
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
            {/\.(jpe?g|png|webp)$/i.test(
              selectedReceipt.url.split(/[?#]/, 1)[0],
            ) && receiptPreviewError ? (
              <p className="p-8 text-sm text-muted-foreground" role="status">
                Foto tidak dapat dimuat. File mungkin sudah tidak tersedia di
                penyimpanan.
              </p>
            ) : /\.(jpe?g|png|webp)$/i.test(
              selectedReceipt.url.split(/[?#]/, 1)[0],
            ) ? (
              <img
                key={selectedReceipt.url}
                src={withLocalPhotoPreview(selectedReceipt.url)}
                alt={selectedReceipt.label}
                className="max-h-[65vh] max-w-full object-contain"
                onError={() => setReceiptPreviewError(true)}
              />
            ) : selectedReceipt.url
                .split(/[?#]/, 1)[0]
                .toLowerCase()
                .endsWith(".pdf") ? (
              <iframe
                key={selectedReceipt.url}
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
      {contractDoModalTicket &&
        (() => {
          const modalContracts: MaterialContractRow[] = (() => {
            if (materialContracts.length > 0) return materialContracts;
            const seen = new Set<string>();
            const synthesized: MaterialContractRow[] = [];
            for (const item of contractDoModalTicket.items) {
              if (
                item.categoryHint === TicketCategoryHint.CONTRACT &&
                item.materialContract &&
                !seen.has(item.materialContract.id)
              ) {
                seen.add(item.materialContract.id);
                synthesized.push({
                  id: item.materialContract.id,
                  contractNumber: item.materialContract.contractNumber,
                  vendorId: null,
                  vendorName: item.materialContract.vendorName,
                  vendorBankAccounts: [],
                  materialType: item.materialContract.materialType,
                  unit: item.materialContract.unit,
                  unitPrice: item.materialContract.unitPrice,
                  estimatedVolume: null,
                  startDate: "",
                  endDate: null,
                  notes: null,
                  isActive: true,
                  createdByName: null,
                  createdAt: "",
                  totalDeliveriesCount: 0,
                  unbilledDeliveriesCount: 0,
                  totalDeliveredVolume: 0,
                  unbilledVolume: 0,
                  unbilledEstimatedAmount: 0,
                });
              }
            }
            return synthesized;
          })();
          const modalProjects: TicketProjectOption[] =
            contractDoModalTicket.projectId &&
            contractDoModalTicket.project &&
            !projects.some((p) => p.id === contractDoModalTicket.projectId)
              ? [
                  ...projects,
                  {
                    id: contractDoModalTicket.projectId,
                    title: contractDoModalTicket.project.title,
                    kelompokTani: contractDoModalTicket.project.kelompokTani,
                  },
                ]
              : projects;
          const modalContractTickets: ContractTicketDeliveryOption[] = (() => {
            if (
              contractTickets.some((t) => t.id === contractDoModalTicket.id)
            ) {
              return contractTickets;
            }
            if (!contractDoModalTicket.projectId) return contractTickets;
            return [
              {
                id: contractDoModalTicket.id,
                ticketNumber: contractDoModalTicket.ticketNumber,
                title: contractDoModalTicket.title,
                projectId: contractDoModalTicket.projectId,
                projectName: contractDoModalTicket.project
                  ? `${contractDoModalTicket.project.kelompokTani} · ${contractDoModalTicket.project.title}`
                  : "Proyek",
                status: contractDoModalTicket.status,
                fulfillmentStatus: contractDoModalTicket.fulfillmentStatus,
                items: contractDoModalTicket.items
                  .filter(
                    (item) =>
                      item.categoryHint === TicketCategoryHint.CONTRACT &&
                      Boolean(item.materialContract),
                  )
                  .map((item) => {
                    const deliveredQuantity = getContractItemDeliveredVolume(
                      contractDoModalTicket,
                      item.materialContractId,
                    );
                    return {
                      ticketItemId: item.id,
                      materialContractId: item.materialContract!.id,
                      contractNumber: item.materialContract!.contractNumber,
                      vendorName: item.materialContract!.vendorName,
                      materialType: item.materialContract!.materialType,
                      unit: item.materialContract!.unit,
                      unitPrice: item.materialContract!.unitPrice,
                      requestedQuantity: item.quantity,
                      deliveredQuantity,
                      remainingQuantity: Math.max(
                        0,
                        item.quantity - deliveredQuantity,
                      ),
                    };
                  }),
              },
              ...contractTickets,
            ];
          })();
          const defaultContractId = contractDoModalTicket.items.find(
            (item) =>
              item.categoryHint === TicketCategoryHint.CONTRACT &&
              item.status === FulfillmentStatus.PENDING &&
              item.materialContractId,
          )?.materialContractId;

          return (
            <MaterialDeliveryModal
              open
              onOpenChange={(open) => {
                if (!open) setContractDoModalTicket(null);
              }}
              contracts={modalContracts}
              projects={modalProjects}
              contractTickets={modalContractTickets}
              defaultContractId={defaultContractId ?? undefined}
              lockedProjectId={contractDoModalTicket.projectId ?? undefined}
              lockedTicketId={contractDoModalTicket.id}
              onSaved={() => {
                setContractDoFeedback({
                  text: `Surat Jalan (DO) untuk tiket ${contractDoModalTicket.ticketNumber} berhasil dicatat.`,
                  isError: false,
                });
                setContractDoModalTicket(null);
                router.refresh();
              }}
            />
          );
        })()}
    </div>
  );
}
