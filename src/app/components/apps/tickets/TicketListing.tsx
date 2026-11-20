"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  CircleDollarSign,
  ClipboardList,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  MoreHorizontal,
  PackageOpen,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Truck,
  Upload,
  UploadCloud,
} from "lucide-react";
import {
  DOStatus,
  FulfillmentStatus,
  PaymentType,
  POPaymentMethod,
  POStatus,
  TicketCategoryHint,
  TicketPriority,
  TicketRequestCategory,
  TicketStatus,
  TicketType,
  UserRole,
} from "@prisma/client";
import { deleteUnbilledMaterialDelivery } from "@/app/actions/material-contracts";
import {
  canOperateFinanceActions,
  canOperateLogisticsActions,
} from "@/lib/user-access";
import {
  canBillAndPayVendorContracts,
  canManageMaterialContracts,
  canRecordMaterialDeliveries,
  formatMaterialVolume,
  type ContractTicketDeliveryOption,
  type MaterialContractRow,
} from "@/lib/material-contracts";
import {
  addTicketItemByExecutive,
  approveByDirector,
  checkTicketItemsStock,
  deleteTicketItemByExecutive,
  fulfillTicketItemsFromStock,
  mapTicketItemToStock,
  submitTicket,
  updateTicketItemByExecutive,
  type TicketActionResult,
} from "@/app/actions/tickets";
import {
  approveEquipmentRequest,
  processEquipmentRequestAtLogistics,
  submitEquipmentRequest,
} from "@/app/actions/equipment-requests";
import { isTicketProcessedByFinance } from "@/lib/ticket-finance-lock";
import { EQUIPMENT_REQUEST_TYPE } from "@/lib/equipment-request";
import type { VehicleSummary } from "@/app/actions/vehicles";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import type { VendorBankAccountOption } from "@/lib/vendor-bank-accounts";
import CreatePOForm from "@/app/components/forms/CreatePOForm";
import DirectStockPurchaseForm from "@/app/components/forms/DirectStockPurchaseForm";
import MaterialDeliveryModal, {
  MaterialDeliveryAttachModal,
  MaterialDeliveryPrintModal,
  type AttachableMaterialDelivery,
  type PrintableMaterialDelivery,
} from "@/app/components/apps/material-contracts/MaterialDeliveryModal";
import ExpeditionArrivalModal from "@/app/components/apps/tickets/ExpeditionArrivalModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  parseClientAssetCode,
  photoDownloadHref,
  photoDownloadLabel,
  photoDownloadLinkProps,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";

type TicketRowWithDeliveryOrderReceipt = TicketRow & {
  deliveryOrderReceiptUrl?: string | null;
};
import { printUrlInFrame } from "@/lib/print-url";
import { cn } from "@/lib/utils";
import FinanceActionModal from "./FinanceActionModal";
import LogisticsActionModal from "./LogisticsActionModal";
import MoverActionModal from "./MoverActionModal";
import {
  getTicketManagementPermissions,
  TicketManagementModal,
  type TicketManageMode,
} from "./TicketManagementActions";

const statusLabels: Record<TicketRow["status"], string> = {
  DRAFT: "Draft",
  PENDING_DIRECTOR: "Menunggu Direktur",
  PENDING_LOGISTIK: "Menunggu Logistik",
  APPROVED_DIR: "Disetujui Direktur",
  PROCESSED_FINANCE: "Diproses Finance",
  PROCESSED_LOGISTIC: "Diproses Logistik",
  ASSIGNED_TO_MOVER: "Ditugaskan ke Mover",
  IN_TRANSIT: "Dalam Perjalanan",
  WAITING_FINANCE_PAYMENT: "Menunggu Finance",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

const nextStepLabels: Record<TicketRow["status"], string> = {
  DRAFT: "Pemohon perlu mengajukan tiket.",
  PENDING_DIRECTOR: "Menunggu Direktur menyetujui tiket.",
  PENDING_LOGISTIK: "Logistik menentukan pemenuhan atau vendor.",
  APPROVED_DIR: "Menunggu Finance memproses kebutuhan.",
  PROCESSED_FINANCE: "Menunggu Logistik menyiapkan pengiriman.",
  PROCESSED_LOGISTIC: "Menunggu proses logistik atau konfirmasi.",
  ASSIGNED_TO_MOVER: "Menunggu Mover mengantar barang.",
  IN_TRANSIT: "Menunggu barang tiba dan diterima.",
  WAITING_FINANCE_PAYMENT: "Menunggu Finance melakukan pembayaran.",
  COMPLETED: "Seluruh proses tiket selesai.",
  REJECTED: "Tiket ditolak dan dihentikan.",
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

const priorityLabels: Record<TicketPriority, string> = {
  LOW: "Rendah",
  MEDIUM: "Sedang",
  HIGH: "Tinggi",
  URGENT: "Mendesak",
};

const auditActionLabels: Record<string, string> = {
  CREATED: "Draft dibuat",
  UPDATED: "Detail tiket diperbarui",
  SUBMITTED: "Diajukan ke Direktur",
  APPROVED_BY_DIR: "Disetujui Direktur",
  REJECTED_BY_DIR: "Ditolak Direktur",
  REVISION_REQUESTED_BY_DIR: "Diminta revisi",
  LOGISTICS_EQUIPMENT_INTERNAL: "Alat internal disiapkan",
  LOGISTICS_EQUIPMENT_RENTAL: "Diteruskan ke vendor sewa",
  FINANCE_PAYMENT_PARTIAL: "Pembayaran sebagian dicatat",
  LOGISTICS_READY_WAREHOUSE: "Stok gudang siap; ke Mover",
  LOGISTICS_TICKET_ITEM_SKU_MAPPED: "Item ditautkan ke SKU",
  MATERIAL_CONTRACT_DELIVERY_RECORDED: "Surat Jalan kontrak dicatat",
  LOGISTICS_SWITCHED_TO_PURCHASE: "Dialihkan ke pengadaan",
  LOGISTICS_BUY_STORE: "Pembelian dikirim ke Finance",
  LOGISTICS_PO_CREATED: "PO dibuat; menunggu persetujuan",
  LOGISTICS_DIRECT_PURCHASE_CREATED: "Pembelian langsung ditautkan",
  DIRECT_PURCHASE_APPROVED: "Pembelian langsung disetujui",
  DIRECT_PURCHASE_PAYMENT: "Pembayaran pembelian dicatat",
  DIRECT_PURCHASE_RECEIVED: "Pembelian diterima Logistik",
  DOCUMENT_ISSUED: "Dokumen PO/DO terbit",
  FINANCE_PAYMENT_COMPLETED: "Pembayaran lunas",
  MOVER_DELIVERY_COMPLETED: "Barang diterima di lokasi",
  COMPLETED: "Tiket selesai",
};

function parseTicketDescription(description: string | null) {
  if (!description) {
    return {
      categoryFromDesc: null,
      notes: "",
      extraFields: [] as { label: string; value: string }[],
    };
  }
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
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

const formatCurrency = (amount: string | null) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(amount));

const getTicketStageNumber = (status: TicketRow["status"]): 1 | 2 | 3 | 4 => {
  if (status === TicketStatus.DRAFT) return 1;
  if (status === TicketStatus.PENDING_DIRECTOR) return 2;
  if (status === TicketStatus.COMPLETED) return 4;
  return 3;
};

const getPriorityBadgeClass = (priority: TicketPriority) =>
  priority === "URGENT"
    ? "border-rose-500/35 bg-rose-500/15 text-rose-500"
    : priority === "HIGH"
      ? "border-amber-500/35 bg-amber-500/15 text-amber-500"
      : priority === "MEDIUM"
        ? "border-sky-500/35 bg-sky-500/15 text-sky-500"
        : "border-border bg-muted text-muted-foreground";

const getContractItemDeliveredVolume = (
  ticket: TicketRow,
  materialContractId?: string | null,
) =>
  materialContractId
    ? (ticket.materialDeliveries ?? [])
        .filter((delivery) => delivery.contractId === materialContractId)
        .reduce((sum, delivery) => sum + delivery.quantityReceived, 0)
    : 0;

const hasOpenContractDelivery = (role: TicketPageRole, ticket: TicketRow) =>
  !(
    (role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
    isTicketProcessedByFinance(ticket)
  ) &&
  ticket.type === TicketType.MATERIAL &&
  (ticket.status === TicketStatus.APPROVED_DIR ||
    ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
    ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
    ticket.status === TicketStatus.PROCESSED_FINANCE ||
    ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
    ticket.status === TicketStatus.IN_TRANSIT) &&
  ticket.items.some(
    (item) =>
      item.categoryHint === TicketCategoryHint.CONTRACT &&
      item.status === FulfillmentStatus.PENDING,
  );

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
    role === UserRole.MOVER &&
    (ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      ticket.status === TicketStatus.IN_TRANSIT)
  ) {
    return "MOVER";
  }
  if (
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR) &&
    ticket.requestCategory === TicketRequestCategory.SHIPPING_COST &&
    (ticket.status === TicketStatus.APPROVED_DIR ||
      ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
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
    ticket.status !== TicketStatus.DRAFT &&
    ticket.status !== TicketStatus.PENDING_DIRECTOR &&
    ticket.status !== TicketStatus.REJECTED &&
    ticket.status !== TicketStatus.COMPLETED &&
    ticket.deliveryOrders?.some(
      (deliveryOrder) => deliveryOrder.status === DOStatus.IN_TRANSIT,
    ) &&
    (ticket.status === TicketStatus.IN_TRANSIT ||
      Boolean(ticket.purchaseOrders?.some((po) => Boolean(po.paidAt))))
  ) {
    return "EXPEDITION_RECEIPT";
  }
  if (
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      role === UserRole.DIRECTOR ||
      role === UserRole.DEPUTY_DIRECTOR) &&
    ticket.type === TicketType.MATERIAL &&
    (ticket.status === TicketStatus.APPROVED_DIR ||
      ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
      ticket.status === TicketStatus.PROCESSED_FINANCE ||
      ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      ticket.status === TicketStatus.IN_TRANSIT) &&
    ((ticket.purchaseOrders?.some((purchaseOrder) => Boolean(purchaseOrder.paidAt)) &&
      ticket.items.some(
        (item) =>
          item.categoryHint !== TicketCategoryHint.CONTRACT &&
          item.status !== FulfillmentStatus.PROCESSED_TO_DO &&
          !item.doItemId,
      )) ||
      ticket.purchaseOrders?.some(
        (purchaseOrder) =>
          purchaseOrder.status === POStatus.APPROVED &&
          !purchaseOrder.paidAt &&
          !purchaseOrder.vendorInvoiceUrl,
      ))
  ) {
    return "LOGISTICS";
  }
  if (
    canOperateFinanceActions(role) &&
    (ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
      (ticket.status === TicketStatus.APPROVED_DIR &&
        ticket.type !== TicketType.MATERIAL) ||
      Boolean(
        ticket.purchaseOrders?.some(
          (purchaseOrder) =>
            purchaseOrder.status === POStatus.APPROVED &&
            !purchaseOrder.paidAt &&
            Boolean(purchaseOrder.vendorInvoiceUrl),
        ),
      ))
  ) {
    return "FINANCE";
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
      label: "Bayar",
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
      label: "Bayar",
    };
  }
  const reviewPo = ticket.purchaseOrders?.find(
    (po) => po.status === POStatus.PENDING_FINANCE_REVIEW,
  );
  if (reviewPo) {
    return {
      href: `/apps/finance?tab=check&openSheet=${encodeURIComponent(reviewPo.publicCode)}`,
      label: "Periksa PO",
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

type ItemEditorModalState =
  | { mode: "add" }
  | { mode: "edit"; item: TicketRow["items"][number] }
  | { mode: "delete"; item: TicketRow["items"][number] }
  | null;

type AvailabilityItem = NonNullable<
  TicketActionResult["stockAvailability"]
>[number];

function TicketRowActionControls({
  ticket,
  role,
  variant,
  canRecordContractDo,
  isPending,
  busyId,
  onOpenDetail,
  onRunAction,
  onOpenWorkflow,
  onOpenLogisticsDo,
  onOpenContractDo,
  onPrintContractSj,
  onOpenManage,
}: {
  ticket: TicketRow;
  role: TicketPageRole;
  variant: "table" | "mobile";
  canRecordContractDo: boolean;
  isPending: boolean;
  busyId: string | null;
  onOpenDetail: (ticket: TicketRow) => void;
  onRunAction: (ticket: TicketRow, action: DirectAction) => void;
  onOpenWorkflow: (ticket: TicketRow) => void;
  onOpenLogisticsDo: (ticketId: string) => void;
  onOpenContractDo: (ticket: TicketRow) => void;
  onPrintContractSj: (ticket: TicketRow, initialDeliveryId?: string) => void;
  onOpenManage: (ticket: TicketRow, mode: TicketManageMode) => void;
}) {
  const isMobile = variant === "mobile";
  const action = actionFor(role, ticket);
  const workflow = workflowFor(role, ticket);
  const canSubmit = ticket.status === TicketStatus.DRAFT && ticket.canSubmit;
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

  const hasNonContractItems = ticket.items.some(
    (item) => item.categoryHint !== TicketCategoryHint.CONTRACT,
  );
  const hasPendingNonContractItems = ticket.items.some(
    (item) =>
      item.categoryHint !== TicketCategoryHint.CONTRACT &&
      item.status === FulfillmentStatus.PENDING,
  );
  const materialDeliveries = ticket.materialDeliveries ?? [];
  const hasMaterialDeliveries = materialDeliveries.length > 0;
  const isContractTicket =
    ticket.items.some(
      (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
    ) || hasMaterialDeliveries;
  const hasOpenContract =
    canRecordContractDo && hasOpenContractDelivery(role, ticket);
  const canManageLogisticsItems =
    (role === UserRole.LOGISTICS ||
      role === UserRole.ADMINISTRATIONS ||
      ((role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) &&
        !isTicketProcessedByFinance(ticket))) &&
    ticket.type === TicketType.MATERIAL &&
    (ticket.status === TicketStatus.APPROVED_DIR ||
      ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
      ticket.status === TicketStatus.PROCESSED_FINANCE ||
      ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      ticket.status === TicketStatus.IN_TRANSIT) &&
    ticket.items.length > 0 &&
    hasNonContractItems &&
    (workflow !== "LOGISTICS" || hasPendingNonContractItems);

  const financeTarget = canOperateFinanceActions(role)
    ? getFinanceActionTarget(ticket)
    : null;
  const { canEdit, canDelete } = getTicketManagementPermissions(ticket, role);

  const workflowShortLabels = {
    LOGISTICS: ticket.deliveryOrders?.length ? "Lanjut DO" : "Proses",
    LOGISTICS_DO: "Buat DO",
    EXPEDITION_RECEIPT: "Terima Barang",
    FINANCE: "Bayar",
    MOVER: "Konfirmasi Tiba",
  } as const;

  const workflowIcons = {
    LOGISTICS: PackageOpen,
    LOGISTICS_DO: Truck,
    EXPEDITION_RECEIPT: UploadCloud,
    FINANCE: CircleDollarSign,
    MOVER: Truck,
  } as const;

  const WorkflowIcon = workflow ? workflowIcons[workflow] : null;

  const mobilePrimaryMode:
    | "contractDo"
    | "workflow"
    | "finance"
    | "action"
    | "manageItems"
    | "printSj"
    | "detail" = hasOpenContract
    ? "contractDo"
    : workflow && WorkflowIcon
      ? "workflow"
      : financeTarget
        ? "finance"
        : visibleAction
          ? "action"
          : canManageLogisticsItems
            ? "manageItems"
            : isContractTicket && hasMaterialDeliveries && !hasOpenContract
              ? "printSj"
              : "detail";

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        isMobile ? "w-full justify-between" : "flex-nowrap justify-end",
      )}
    >
      {isMobile ? (
        mobilePrimaryMode === "contractDo" ? (
          <Button
            type="button"
            size="sm"
            variant="success"
            className="flex-1"
            onClick={() => onOpenContractDo(ticket)}
          >
            <Truck className="size-3.5" aria-hidden="true" />
            <span>Terbitkan SJ</span>
          </Button>
        ) : mobilePrimaryMode === "workflow" && workflow && WorkflowIcon ? (
          <Button
            type="button"
            size="sm"
            variant={
              workflow === "EXPEDITION_RECEIPT" ? "outlinesuccess" : "default"
            }
            className="flex-1"
            onClick={() => {
              if (workflow === "LOGISTICS_DO") {
                onOpenLogisticsDo(ticket.id);
                return;
              }
              onOpenWorkflow(ticket);
            }}
          >
            <WorkflowIcon className="size-3.5" aria-hidden="true" />
            <span>{workflowShortLabels[workflow]}</span>
          </Button>
        ) : mobilePrimaryMode === "finance" && financeTarget ? (
          <Button asChild size="sm" className="flex-1">
            <Link href={financeTarget.href}>
              <CircleDollarSign className="size-3.5" aria-hidden="true" />
              <span>{financeTarget.label}</span>
            </Link>
          </Button>
        ) : mobilePrimaryMode === "action" && visibleAction ? (
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={isPending && busyId === ticket.id}
            onClick={() => onRunAction(ticket, visibleAction)}
          >
            {visibleAction.label === "Setujui" ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Send className="size-3.5" aria-hidden="true" />
            )}
            <span>{visibleAction.label}</span>
          </Button>
        ) : mobilePrimaryMode === "manageItems" ? (
          <Button
            type="button"
            size="sm"
            variant="warning"
            className="flex-1"
            onClick={() => onOpenDetail(ticket)}
          >
            <ClipboardList className="size-3.5" aria-hidden="true" />
            <span>
              {hasPendingNonContractItems ? "Alokasi Item" : "Kelola Item"}
            </span>
          </Button>
        ) : mobilePrimaryMode === "printSj" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onPrintContractSj(ticket)}
          >
            <Printer className="size-3.5" aria-hidden="true" />
            <span>Cetak SJ</span>
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenDetail(ticket)}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            <span>Detail</span>
          </Button>
        )
      ) : (
        <>
          {hasOpenContract && (
            <Button
              type="button"
              size="icon"
              variant="success"
              aria-label="Terbitkan Surat Jalan Material Alam"
              title="Terbitkan Surat Jalan"
              onClick={() => onOpenContractDo(ticket)}
            >
              <Truck className="size-3.5" aria-hidden="true" />
            </Button>
          )}

          {isContractTicket && hasMaterialDeliveries && !hasOpenContract && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Cetak Surat Jalan Material Alam"
              title="Pratinjau / Cetak SJ"
              onClick={() => onPrintContractSj(ticket)}
            >
              <Printer className="size-3.5" aria-hidden="true" />
            </Button>
          )}

          {canManageLogisticsItems && (
            <Button
              type="button"
              size="icon"
              variant="warning"
              aria-label={hasPendingNonContractItems ? "Alokasi Item" : "Kelola Item"}
              title={hasPendingNonContractItems ? "Alokasi Item" : "Kelola Item"}
              onClick={() => onOpenDetail(ticket)}
            >
              <ClipboardList className="size-3.5" aria-hidden="true" />
            </Button>
          )}

          {workflow && WorkflowIcon ? (
            <Button
              type="button"
              size="icon"
              variant={workflow === "EXPEDITION_RECEIPT" ? "outlinesuccess" : "default"}
              aria-label={workflowShortLabels[workflow]}
              title={workflowShortLabels[workflow]}
              onClick={() => {
                if (workflow === "LOGISTICS_DO") {
                  onOpenLogisticsDo(ticket.id);
                  return;
                }
                onOpenWorkflow(ticket);
              }}
            >
              <WorkflowIcon className="size-3.5" aria-hidden="true" />
            </Button>
          ) : financeTarget ? (
            <Button
              asChild
              size="icon"
              aria-label={financeTarget.label}
            >
              <Link href={financeTarget.href}>
                <CircleDollarSign className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : visibleAction ? (
            <Button
              type="button"
              size="icon"
              aria-label={visibleAction.label}
              title={visibleAction.label}
              disabled={isPending && busyId === ticket.id}
              onClick={() => onRunAction(ticket, visibleAction)}
            >
              {visibleAction.label === "Setujui" ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Send className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          ) : null}
        </>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Menu aksi ${ticket.ticketNumber}`}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(!isMobile || mobilePrimaryMode !== "detail") && (
            <DropdownMenuItem onSelect={() => onOpenDetail(ticket)}>
              <Eye className="size-4" aria-hidden="true" />
              Detail
            </DropdownMenuItem>
          )}
          {isMobile &&
            canManageLogisticsItems &&
            mobilePrimaryMode !== "manageItems" && (
              <DropdownMenuItem onSelect={() => onOpenDetail(ticket)}>
                <ClipboardList className="size-4" aria-hidden="true" />
                {hasPendingNonContractItems ? "Alokasi Item" : "Kelola Item"}
              </DropdownMenuItem>
            )}
          {isMobile &&
            workflow &&
            WorkflowIcon &&
            mobilePrimaryMode !== "workflow" && (
              <DropdownMenuItem
                onSelect={() => {
                  if (workflow === "LOGISTICS_DO") {
                    onOpenLogisticsDo(ticket.id);
                    return;
                  }
                  onOpenWorkflow(ticket);
                }}
              >
                <WorkflowIcon className="size-4" aria-hidden="true" />
                {workflowShortLabels[workflow]}
              </DropdownMenuItem>
            )}
          {isMobile && financeTarget && mobilePrimaryMode !== "finance" && (
            <DropdownMenuItem asChild>
              <Link href={financeTarget.href}>
                <CircleDollarSign className="size-4" aria-hidden="true" />
                {financeTarget.label}
              </Link>
            </DropdownMenuItem>
          )}
          {isMobile && visibleAction && mobilePrimaryMode !== "action" && (
            <DropdownMenuItem
              disabled={isPending && busyId === ticket.id}
              onSelect={() => onRunAction(ticket, visibleAction)}
            >
              {visibleAction.label === "Setujui" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {visibleAction.label}
            </DropdownMenuItem>
          )}
          {hasOpenContract && (!isMobile || mobilePrimaryMode !== "contractDo") && (
            <DropdownMenuItem onSelect={() => onOpenContractDo(ticket)}>
              <Truck className="size-4" aria-hidden="true" />
              Terbitkan Surat Jalan
            </DropdownMenuItem>
          )}
          {hasMaterialDeliveries &&
            (!isMobile || mobilePrimaryMode !== "printSj") && (
              <DropdownMenuItem onSelect={() => onPrintContractSj(ticket)}>
                <Printer className="size-4" aria-hidden="true" />
                Cetak SJ
              </DropdownMenuItem>
            )}
          {showDoPrint && primaryDo && (
            <DropdownMenuItem asChild>
              <Link href={`/d/${primaryDo.publicCode}`}>
                <Printer className="size-4" aria-hidden="true" />
                Cetak DO
              </Link>
            </DropdownMenuItem>
          )}
          {(canEdit || canDelete) && <DropdownMenuSeparator />}
          {canEdit && (
            <DropdownMenuItem onSelect={() => onOpenManage(ticket, "edit")}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onSelect={() => onOpenManage(ticket, "delete")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Hapus
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TicketMobileCard({
  ticket,
  role,
  canRecordContractDo,
  isPending,
  busyId,
  onOpenDetail,
  onRunAction,
  onOpenWorkflow,
  onOpenLogisticsDo,
  onOpenContractDo,
  onPrintContractSj,
  onOpenManage,
}: {
  ticket: TicketRow;
  role: TicketPageRole;
  canRecordContractDo: boolean;
  isPending: boolean;
  busyId: string | null;
  onOpenDetail: (ticket: TicketRow) => void;
  onRunAction: (ticket: TicketRow, action: DirectAction) => void;
  onOpenWorkflow: (ticket: TicketRow) => void;
  onOpenLogisticsDo: (ticketId: string) => void;
  onOpenContractDo: (ticket: TicketRow) => void;
  onPrintContractSj: (ticket: TicketRow, initialDeliveryId?: string) => void;
  onOpenManage: (ticket: TicketRow, mode: TicketManageMode) => void;
}) {
  const stageNum = getTicketStageNumber(ticket.status);
  const priorityBadgeClass = getPriorityBadgeClass(ticket.priority);
  const hasAttachment =
    (ticket.receiptUrls?.length ?? 0) > 0 ||
    Boolean(
      ticket.attachmentUrl ||
        ticket.purchaseReceiptUrl ||
        ticket.transferReceiptUrl ||
        ticket.deliveryReceiptUrl ||
        (ticket as TicketRowWithDeliveryOrderReceipt).deliveryOrderReceiptUrl,
    );

  return (
    <article
      onClick={() => onOpenDetail(ticket)}
      className="cursor-pointer rounded-xl border border-border/80 bg-card p-3 shadow-2xs transition-colors hover:border-primary/40 active:bg-muted/30 sm:p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="type-p3 inline-flex rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono font-semibold text-amber-500">
            {ticket.ticketNumber}
          </span>
          <span
            className={`type-p3 inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${priorityBadgeClass}`}
          >
            {priorityLabels[ticket.priority]}
          </span>
        </div>
        <span className="type-p3 text-muted-foreground">
          {format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm", {
            locale: id,
          })}
        </span>
      </div>

      <h3 className="type-h3 mt-2 line-clamp-2 text-foreground">
        {ticket.title}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">
          {ticket.ticketType === EQUIPMENT_REQUEST_TYPE
            ? "Alat & Kendaraan"
            : typeLabels[ticket.type]}
        </Badge>
        <span className="type-p3 inline-flex max-w-full items-center truncate rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-600 dark:text-sky-400">
          {ticket.project
            ? `${ticket.project.kelompokTani} — ${ticket.project.title}`
            : "Kantor Pusat / Overhead"}
        </span>
        {ticket.items.length > 0 && (
          <Badge variant="secondary">{ticket.items.length} Item</Badge>
        )}
        {hasAttachment && (
          <Badge variant="lightSuccess" className="gap-1">
            <Paperclip className="size-3" aria-hidden="true" />
            Nota/Bukti
          </Badge>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={statusVariants[ticket.status]}>
              {statusLabels[ticket.status]}
            </Badge>
            {ticket.status !== TicketStatus.REJECTED && (
              <span className="type-p3 shrink-0 font-semibold text-muted-foreground">
                · Tahap {stageNum}/4
              </span>
            )}
          </div>
          <p className="type-p3 text-muted-foreground">
            Pemohon: <strong className="text-foreground">{ticket.requester.name}</strong>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="type-p3 block uppercase tracking-wider text-muted-foreground">
            Estimasi
          </span>
          <span className="type-p1 font-extrabold tabular-nums text-foreground">
            {formatCurrency(ticket.totalAmount)}
          </span>
        </div>
      </div>

      <div
        className="mt-2.5 border-t border-border/60 pt-2"
        onClick={(event) => event.stopPropagation()}
      >
        <TicketRowActionControls
          ticket={ticket}
          role={role}
          variant="mobile"
          canRecordContractDo={canRecordContractDo}
          isPending={isPending}
          busyId={busyId}
          onOpenDetail={onOpenDetail}
          onRunAction={onRunAction}
          onOpenWorkflow={onOpenWorkflow}
          onOpenLogisticsDo={onOpenLogisticsDo}
          onOpenContractDo={onOpenContractDo}
          onPrintContractSj={onPrintContractSj}
          onOpenManage={onOpenManage}
        />
      </div>
    </article>
  );
}

function TicketDesktopRow({
  ticket,
  role,
  canRecordContractDo,
  isPending,
  busyId,
  onOpenDetail,
  onRunAction,
  onOpenWorkflow,
  onOpenLogisticsDo,
  onOpenContractDo,
  onPrintContractSj,
  onOpenManage,
}: {
  ticket: TicketRow;
  role: TicketPageRole;
  canRecordContractDo: boolean;
  isPending: boolean;
  busyId: string | null;
  onOpenDetail: (ticket: TicketRow) => void;
  onRunAction: (ticket: TicketRow, action: DirectAction) => void;
  onOpenWorkflow: (ticket: TicketRow) => void;
  onOpenLogisticsDo: (ticketId: string) => void;
  onOpenContractDo: (ticket: TicketRow) => void;
  onPrintContractSj: (ticket: TicketRow, initialDeliveryId?: string) => void;
  onOpenManage: (ticket: TicketRow, mode: TicketManageMode) => void;
}) {
  const stageNum = getTicketStageNumber(ticket.status);
  const priorityBadgeClass = getPriorityBadgeClass(ticket.priority);
  const hasAttachment =
    (ticket.receiptUrls?.length ?? 0) > 0 ||
    Boolean(
      ticket.attachmentUrl ||
        ticket.purchaseReceiptUrl ||
        ticket.transferReceiptUrl ||
        ticket.deliveryReceiptUrl ||
        (ticket as TicketRowWithDeliveryOrderReceipt).deliveryOrderReceiptUrl,
    );

  return (
    <TableRow
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-muted/30"
      onClick={() => onOpenDetail(ticket)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail(ticket);
        }
      }}
    >
      <TableCell className="min-w-36 whitespace-nowrap align-top">
        <span className="type-p3 inline-flex rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono font-medium text-amber-500">
          {ticket.ticketNumber}
        </span>
        <span className="type-p3 mt-1 block text-muted-foreground">
          {format(new Date(ticket.createdAt), "d MMM yyyy, HH:mm", {
            locale: id,
          })}
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
          <span className="type-p3 font-medium text-muted-foreground">
            {ticket.requester.name}
          </span>
          <span
            className={`type-p3 inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${priorityBadgeClass}`}
          >
            {priorityLabels[ticket.priority]}
          </span>
        </div>
      </TableCell>

      <TableCell className="max-w-[260px] whitespace-normal break-words align-top lg:max-w-[360px]">
        <p className="type-p1 line-clamp-2 break-words font-semibold text-foreground">
          {ticket.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            {ticket.ticketType === EQUIPMENT_REQUEST_TYPE
              ? "Alat & Kendaraan"
              : typeLabels[ticket.type]}
          </Badge>
          <span className="type-p3 inline-flex max-w-full items-center truncate rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-600 dark:text-sky-400">
            {ticket.project
              ? `${ticket.project.kelompokTani} — ${ticket.project.title}`
              : "Kantor Pusat / Overhead"}
          </span>
          {hasAttachment && (
            <Badge variant="lightSuccess" className="gap-1">
              <Paperclip className="size-3" aria-hidden="true" />
              Bukti
            </Badge>
          )}
          {ticket.items.some(
            (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
          ) && <Badge variant="lightInfo">Kontrak Alam</Badge>}
          {ticket.items.length > 0 && (
            <Badge variant="secondary">{ticket.items.length} Item</Badge>
          )}
        </div>
      </TableCell>

      <TableCell className="type-p2 hidden align-top font-medium lg:table-cell">
        {ticket.requester.name}
      </TableCell>

      <TableCell className="hidden align-top text-center lg:table-cell">
        <span
          className={`type-p3 inline-flex items-center rounded-md border px-2 py-0.5 font-medium ${priorityBadgeClass}`}
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
              <span className="type-p3 font-semibold text-muted-foreground">
                {stageNum}/4
              </span>
            </div>
          )}
        </div>
      </TableCell>

      <TableCell className="type-p1 whitespace-nowrap align-top text-right font-bold tabular-nums">
        {formatCurrency(ticket.totalAmount)}
      </TableCell>

      <TableCell
        className="sticky right-0 z-10 w-[124px] border-l border-border/50 bg-card/95 align-top backdrop-blur-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <TicketRowActionControls
          ticket={ticket}
          role={role}
          variant="table"
          canRecordContractDo={canRecordContractDo}
          isPending={isPending}
          busyId={busyId}
          onOpenDetail={onOpenDetail}
          onRunAction={onRunAction}
          onOpenWorkflow={onOpenWorkflow}
          onOpenLogisticsDo={onOpenLogisticsDo}
          onOpenContractDo={onOpenContractDo}
          onPrintContractSj={onPrintContractSj}
          onOpenManage={onOpenManage}
        />
      </TableCell>
    </TableRow>
  );
}

function TicketDetailItemCard({
  ticket,
  item,
  canSplitFulfillment,
  canExecutiveManageTicket,
  selected,
  onToggleSelect,
  onEditItem,
  onDeleteItem,
}: {
  ticket: TicketRow;
  item: TicketRow["items"][number];
  canSplitFulfillment: boolean;
  canExecutiveManageTicket: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onEditItem: (item: TicketRow["items"][number]) => void;
  onDeleteItem: (item: TicketRow["items"][number]) => void;
}) {
  const activeDirectPurchase =
    item.status === FulfillmentStatus.PENDING
      ? ticket.directStockPurchases?.find(
          (purchase) =>
            purchase.status === "PENDING_RECEIPT" &&
            (purchase.items ?? []).some((purchaseItem) => {
              if (item.stockItemId && purchaseItem.stockItemId) {
                return purchaseItem.stockItemId === item.stockItemId;
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

  const deliveredContractVolume =
    item.categoryHint === TicketCategoryHint.CONTRACT
      ? getContractItemDeliveredVolume(ticket, item.materialContractId)
      : 0;

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {canSplitFulfillment && (
            <Checkbox
              className="mt-0.5"
              checked={selected}
              disabled={
                item.status !== FulfillmentStatus.PENDING ||
                item.categoryHint === TicketCategoryHint.CONTRACT
              }
              aria-label={`Pilih ${item.itemName}`}
              onCheckedChange={(checked) => onToggleSelect(checked === true)}
            />
          )}
          <div className="min-w-0">
            <p className="type-p2 font-semibold text-foreground">
              {item.itemName}
            </p>
            {item.categoryHint === TicketCategoryHint.CONTRACT &&
              item.materialContract && (
                <p className="type-p3 text-muted-foreground">
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
                : "Menunggu Surat Jalan"
            : item.status === FulfillmentStatus.PENDING
              ? activeDirectPurchase
                ? `Dipesan · ${activeDirectPurchase.purchaseNumber}`
                : "Menunggu"
              : item.status === FulfillmentStatus.PROCESSED_TO_DO
                ? "Dipenuhi DO"
                : "Diproses PO"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-muted/30 p-2.5">
        <div>
          <span className="type-p3 block uppercase tracking-wide text-muted-foreground">
            Jumlah
          </span>
          <p className="type-p2 font-semibold text-foreground">
            {item.quantity} {item.unit}
          </p>
        </div>
        <div>
          <span className="type-p3 block uppercase tracking-wide text-muted-foreground">
            Harga Satuan
          </span>
          <p className="type-p2 font-semibold tabular-nums text-foreground">
            {formatCurrency(item.estimatedCost)}
          </p>
        </div>
        <div>
          <span className="type-p3 block uppercase tracking-wide text-muted-foreground">
            Sumber
          </span>
          <p className="type-p2 font-medium text-foreground">
            {item.categoryHint === TicketCategoryHint.WAREHOUSE
              ? "Stok Gudang"
              : item.categoryHint === TicketCategoryHint.CONTRACT
                ? "Kontrak Alam"
                : "Pembelian"}
          </p>
        </div>
        <div>
          <span className="type-p3 block uppercase tracking-wide text-muted-foreground">
            Target Tiba
          </span>
          <p className="type-p2 text-foreground">
            {item.expectedDeliveryDate ?? "—"}
          </p>
        </div>
      </div>

      {canExecutiveManageTicket && (
        <div className="flex items-center justify-end gap-1.5 border-t border-border/60 pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onEditItem(item)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            disabled={ticket.items.length <= 1}
            onClick={() => onDeleteItem(item)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Hapus
          </Button>
        </div>
      )}
    </div>
  );
}

function TicketDetailItemRow({
  ticket,
  item,
  canSplitFulfillment,
  canExecutiveManageTicket,
  selected,
  onToggleSelect,
  onEditItem,
  onDeleteItem,
}: {
  ticket: TicketRow;
  item: TicketRow["items"][number];
  canSplitFulfillment: boolean;
  canExecutiveManageTicket: boolean;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onEditItem: (item: TicketRow["items"][number]) => void;
  onDeleteItem: (item: TicketRow["items"][number]) => void;
}) {
  const activeDirectPurchase =
    item.status === FulfillmentStatus.PENDING
      ? ticket.directStockPurchases?.find(
          (purchase) =>
            purchase.status === "PENDING_RECEIPT" &&
            (purchase.items ?? []).some((purchaseItem) => {
              if (item.stockItemId && purchaseItem.stockItemId) {
                return purchaseItem.stockItemId === item.stockItemId;
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

  const deliveredContractVolume =
    item.categoryHint === TicketCategoryHint.CONTRACT
      ? getContractItemDeliveredVolume(ticket, item.materialContractId)
      : 0;

  return (
    <TableRow>
      {canSplitFulfillment && (
        <TableCell>
          <Checkbox
            checked={selected}
            disabled={
              item.status !== FulfillmentStatus.PENDING ||
              item.categoryHint === TicketCategoryHint.CONTRACT
            }
            aria-label={`Pilih ${item.itemName}`}
            onCheckedChange={(checked) => onToggleSelect(checked === true)}
          />
        </TableCell>
      )}
      <TableCell className="font-medium">
        <div className="type-p2 font-medium text-foreground">
          {item.itemName}
        </div>
        {item.categoryHint === TicketCategoryHint.CONTRACT &&
          item.materialContract && (
            <div className="type-p3 text-muted-foreground">
              {item.materialContract.contractNumber} ·{" "}
              {item.materialContract.vendorName}
            </div>
          )}
      </TableCell>
      <TableCell className="type-p2 whitespace-nowrap">
        {item.quantity} {item.unit}
      </TableCell>
      <TableCell className="type-p2 whitespace-nowrap tabular-nums">
        {formatCurrency(item.estimatedCost)}
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {item.categoryHint === TicketCategoryHint.WAREHOUSE
            ? "Stok Gudang"
            : item.categoryHint === TicketCategoryHint.CONTRACT
              ? "Kontrak Alam"
              : "Pembelian"}
        </Badge>
      </TableCell>
      <TableCell className="type-p3 whitespace-nowrap">
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
          {item.categoryHint === TicketCategoryHint.CONTRACT
            ? item.status === FulfillmentStatus.PROCESSED_TO_DO
              ? `Dipenuhi (${formatMaterialVolume(deliveredContractVolume, item.unit)})`
              : deliveredContractVolume > 0
                ? `Parsial (${formatMaterialVolume(deliveredContractVolume, item.unit)} / ${formatMaterialVolume(item.quantity, item.unit)})`
                : "Menunggu Surat Jalan"
            : item.status === FulfillmentStatus.PENDING
              ? activeDirectPurchase
                ? `Dipesan · ${activeDirectPurchase.purchaseNumber}`
                : "Menunggu"
              : item.status === FulfillmentStatus.PROCESSED_TO_DO
                ? "Dipenuhi DO"
                : "Diproses PO"}
        </Badge>
      </TableCell>
      {canExecutiveManageTicket && (
        <TableCell className="whitespace-nowrap text-right">
          <div className="inline-flex items-center justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEditItem(item)}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={ticket.items.length <= 1}
              onClick={() => onDeleteItem(item)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Hapus
            </Button>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function StockAvailabilityRow({
  item,
  availability,
  disabled,
  onOpenSkuMapper,
}: {
  item: TicketRow["items"][number];
  availability?: AvailabilityItem;
  disabled: boolean;
  onOpenSkuMapper: (
    item: TicketRow["items"][number],
    currentStockId?: string | null,
  ) => void;
}) {
  return (
    <TableRow>
      <TableCell className="type-p2 align-top font-medium whitespace-normal break-words">
        {item.itemName}
      </TableCell>
      <TableCell className="type-p2 align-top whitespace-nowrap tabular-nums">
        {item.quantity} {item.unit}
      </TableCell>
      <TableCell className="type-p2 align-top whitespace-nowrap tabular-nums">
        {availability
          ? `${availability.availableQuantity} ${item.unit}`
          : "Belum diperiksa"}
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                availability?.ready ? "lightSuccess" : "lightWarning"
              }
            >
              {availability
                ? availability.pendingPurchaseNumber
                  ? "Sedang Dipesan"
                  : availability.ready
                    ? "Stok Ready"
                    : "Perlu Pesan"
                : "Menunggu"}
            </Badge>
            {availability?.stockItemSku && (
              <span className="type-p3 text-muted-foreground">
                SKU: {availability.stockItemSku}
              </span>
            )}
          </div>
          {availability?.message && (
            <p className="type-p3 text-muted-foreground">
              {availability.message}
            </p>
          )}
          {availability && !availability.pendingPurchaseNumber && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onOpenSkuMapper(item, availability.stockItemId)}
            >
              Tautkan SKU
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function TicketItemEditorModal({
  ticket,
  modalState,
  stockItems,
  onClose,
  onSaved,
}: {
  ticket: TicketRow;
  modalState: NonNullable<ItemEditorModalState>;
  stockItems: TicketStockItemOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = modalState.mode === "edit";
  const isDelete = modalState.mode === "delete";
  const targetItem =
    modalState.mode === "edit" || modalState.mode === "delete"
      ? modalState.item
      : null;
  const isContractItem =
    targetItem?.categoryHint === TicketCategoryHint.CONTRACT;

  const defaultDeliveryDate =
    ticket.items.find((i) => i.expectedDeliveryDate)?.expectedDeliveryDate ||
    new Date().toISOString().slice(0, 10);

  const [stockId, setStockId] = useState(targetItem?.stockItemId ?? "");
  const [name, setName] = useState(targetItem?.itemName ?? "");
  const [quantity, setQuantity] = useState(
    targetItem ? String(targetItem.quantity) : "1",
  );
  const [unit, setUnit] = useState(targetItem?.unit ?? "pcs");
  const [cost, setCost] = useState(targetItem?.estimatedCost ?? "");
  const [categoryHint, setCategoryHint] = useState<TicketCategoryHint>(
    targetItem?.categoryHint ?? TicketCategoryHint.WAREHOUSE,
  );
  const [deliveryDate, setDeliveryDate] = useState(
    targetItem?.expectedDeliveryDate ?? (isEdit ? "" : defaultDeliveryDate),
  );
  const [pending, setPending] = useState(false);

  const stockOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "__MANUAL__", label: "Ketik manual (tanpa SKU)" },
      ...stockItems.map((s) => ({
        value: s.id,
        label: `${s.sku} — ${s.name} (${s.unit})`,
        keywords: [s.sku, s.name, s.unit],
      })),
    ],
    [stockItems],
  );

  if (isDelete && targetItem) {
    const confirmDelete = async () => {
      if (pending) return;
      setPending(true);
      try {
        const result = await deleteTicketItemByExecutive(
          ticket.id,
          targetItem.id,
        );
        if (result.success) {
          toast.success(result.message);
          onClose();
          onSaved();
        } else {
          toast.error(result.message);
        }
      } catch (err) {
        console.error("Delete ticket item failed:", err);
        toast.error("Gagal menghapus barang.");
      } finally {
        setPending(false);
      }
    };

    return (
      <GlobalModal
        isOpen
        onClose={() => {
          if (!pending) onClose();
        }}
        title="Hapus Barang?"
        description="Item akan dihapus dari rincian tiket ini."
        className="sm:max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void confirmDelete()}
            >
              {pending ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      >
        <p className="type-p2 text-foreground">
          Yakin ingin menghapus <strong>{targetItem.itemName}</strong> (
          {targetItem.quantity} {targetItem.unit}) dari tiket{" "}
          <strong>{ticket.ticketNumber}</strong>?
        </p>
      </GlobalModal>
    );
  }

  const handleSave = async () => {
    const qty = Number(quantity);
    if (!name.trim() || !unit.trim() || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Nama barang, satuan, dan jumlah (> 0) wajib diisi.");
      return;
    }
    setPending(true);
    try {
      const result = isEdit && targetItem
        ? await updateTicketItemByExecutive(ticket.id, targetItem.id, {
            stockItemId: stockId || null,
            itemName: name.trim(),
            quantity: qty,
            unit: unit.trim(),
            estimatedCost: cost.trim() !== "" ? Number(cost) : null,
            categoryHint,
            expectedDeliveryDate: deliveryDate.trim() || null,
          })
        : await addTicketItemByExecutive(ticket.id, {
            stockItemId: stockId || null,
            itemName: name.trim(),
            quantity: qty,
            unit: unit.trim(),
            estimatedCost: cost.trim() !== "" ? Number(cost) : null,
            categoryHint,
            expectedDeliveryDate: deliveryDate.trim() || null,
          });
      if (result.success) {
        toast.success(result.message);
        onClose();
        onSaved();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error("Save ticket item failed:", err);
      toast.error("Gagal menyimpan barang.");
    } finally {
      setPending(false);
    }
  };

  return (
    <GlobalModal
      isOpen
      onClose={() => {
        if (!pending) onClose();
      }}
      title={isEdit ? "Edit Barang Tiket" : "Tambah Barang Tiket"}
      description="Lengkapi rincian item barang untuk tiket ini."
      className="sm:max-w-xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={
              pending ||
              !name.trim() ||
              !unit.trim() ||
              !(Number(quantity) > 0)
            }
            onClick={() => void handleSave()}
          >
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!isEdit && stockItems.length > 0 && (
          <div className="space-y-1.5">
            <Label className="type-p2 font-medium">
              Pilih dari Katalog Stok (Opsional)
            </Label>
            <Combobox
              options={stockOptions}
              value={stockId || "__MANUAL__"}
              placeholder="Pilih SKU atau ketik manual..."
              searchPlaceholder="Cari SKU atau nama barang..."
              emptyText="SKU tidak ditemukan."
              onValueChange={(val) => {
                if (val === "__MANUAL__" || !val) {
                  setStockId("");
                  return;
                }
                setStockId(val);
                const found = stockItems.find((s) => s.id === val);
                if (found) {
                  setName(found.name);
                  setUnit(found.unit);
                  if (found.unitPrice && Number(found.unitPrice) > 0) {
                    setCost(String(Number(found.unitPrice)));
                  }
                }
              }}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="type-p2 font-medium">
              Nama Barang <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              maxLength={160}
              placeholder="Contoh: Semen 40 Kg"
              disabled={isContractItem || pending}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-p2 font-medium">
              Jumlah <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min="0.01"
              step="any"
              value={quantity}
              disabled={pending}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-p2 font-medium">
              Satuan <span className="text-destructive">*</span>
            </Label>
            <Input
              value={unit}
              maxLength={32}
              placeholder="zak / pcs / m3"
              disabled={isContractItem || pending}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="type-p2 font-medium">Harga Satuan (Rp)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              placeholder="Opsional"
              value={cost}
              disabled={pending}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          {!isContractItem && (
            <div className="space-y-1.5">
              <Label className="type-p2 font-medium">Sumber</Label>
              <Select
                value={categoryHint}
                disabled={pending}
                onValueChange={(value) =>
                  setCategoryHint(value as TicketCategoryHint)
                }
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TicketCategoryHint.WAREHOUSE}>
                    Stok Gudang
                  </SelectItem>
                  <SelectItem value={TicketCategoryHint.PURCHASE}>
                    Pembelian
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="type-p2 font-medium">Target Tiba</Label>
            <DatePicker
              value={deliveryDate}
              clearable
              disabled={pending}
              onValueChange={setDeliveryDate}
              placeholder="Pilih tanggal target tiba"
            />
          </div>
        </div>
      </div>
    </GlobalModal>
  );
}

function SkuMappingModal({
  target,
  stockItems,
  pending,
  onClose,
  onConfirm,
}: {
  target: {
    item: TicketRow["items"][number];
    currentStockId?: string | null;
  };
  stockItems: TicketStockItemOption[];
  pending: boolean;
  onClose: () => void;
  onConfirm: (ticketItemId: string, stockItemId: string) => void;
}) {
  const [selectedSkuId, setSelectedSkuId] = useState(
    target.currentStockId ?? "",
  );
  const options = useMemo<ComboboxOption[]>(
    () =>
      stockItems.map((s) => ({
        value: s.id,
        label: `${s.sku} — ${s.name} (${s.unit})`,
        keywords: [s.sku, s.name, s.unit],
      })),
    [stockItems],
  );

  return (
    <GlobalModal
      isOpen
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Tautkan ke SKU Gudang"
      description={`Pilih SKU katalog stok untuk item "${target.item.itemName}".`}
      className="sm:max-w-md"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Batal
          </Button>
          <Button
            type="button"
            disabled={pending || !selectedSkuId}
            onClick={() => onConfirm(target.item.id, selectedSkuId)}
          >
            {pending ? "Menautkan..." : "Tautkan SKU"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label className="type-p2 font-medium">Katalog SKU Gudang</Label>
        <Combobox
          options={options}
          value={selectedSkuId}
          onValueChange={setSelectedSkuId}
          placeholder="Pilih SKU gudang..."
          searchPlaceholder="Ketik kode SKU atau nama barang..."
          emptyText="SKU tidak ditemukan."
        />
      </div>
    </GlobalModal>
  );
}

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

  const [activeManageModal, setActiveManageModal] = useState<{
    ticket: TicketRow;
    mode: TicketManageMode;
  } | null>(null);
  const [itemEditorModal, setItemEditorModal] =
    useState<ItemEditorModalState>(null);
  const [skuMapTarget, setSkuMapTarget] = useState<{
    item: TicketRow["items"][number];
    currentStockId?: string | null;
  } | null>(null);

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
  const [workflowTicket, setWorkflowTicket] = useState<TicketRow | null>(null);
  const [contractDoModalTicket, setContractDoModalTicket] =
    useState<TicketRow | null>(null);
  const [contractSjPreview, setContractSjPreview] = useState<{
    deliveries: PrintableMaterialDelivery[];
    initialDeliveryId?: string;
  } | null>(null);
  const [contractSjAttachTarget, setContractSjAttachTarget] =
    useState<AttachableMaterialDelivery | null>(null);
  const [deletingDeliveryId, setDeletingDeliveryId] = useState<string | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mobilePage, setMobilePage] = useState(1);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canRecordContractDo = canRecordMaterialDeliveries(role);
  const canAttachContractProof =
    canManageMaterialContracts(role) ||
    canOperateLogisticsActions(role) ||
    canBillAndPayVendorContracts(role);

  const openContractSjPreview = (
    ticket: TicketRow,
    initialDeliveryId?: string,
  ) => {
    const deliveries = ticket.materialDeliveries ?? [];
    if (deliveries.length === 0) return;
    setContractSjPreview({
      deliveries: deliveries.map((d) => ({
        id: d.id,
        publicCode: (d as { publicCode?: string | null }).publicCode ?? null,
        doNumber: d.doNumber,
        deliveryDate: d.deliveryDate,
        materialType: d.materialType,
        vendorName: d.vendorName,
        quantityReceived: d.quantityReceived,
        unit: d.unit,
      })),
      initialDeliveryId: initialDeliveryId ?? deliveries[0]?.id,
    });
  };

  const openReceiptPreview = (receipt: { label: string; url: string }) => {
    setReceiptPreviewError(false);
    setSelectedReceipt(receipt);
  };
  const closeReceiptPreview = () => {
    setReceiptPreviewError(false);
    setSelectedReceipt(null);
  };

  const selectedItemIds =
    selectedTicket && itemSelection?.ticketId === selectedTicket.id
      ? itemSelection.itemIds
      : [];

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
    (selectedTicket.status === TicketStatus.APPROVED_DIR ||
      selectedTicket.status === TicketStatus.PROCESSED_LOGISTIC ||
      selectedTicket.status === TicketStatus.WAITING_FINANCE_PAYMENT ||
      selectedTicket.status === TicketStatus.PROCESSED_FINANCE ||
      selectedTicket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      selectedTicket.status === TicketStatus.IN_TRANSIT) &&
    Boolean(
      selectedTicket.items.some(
        (item) => item.categoryHint !== TicketCategoryHint.CONTRACT,
      ),
    );

  const openTicketSheet = (ticket: TicketRow) => {
    setSelectedReceipt(null);
    setDoDialogOpen(false);
    setPoDialogOpen(false);
    setItemEditorModal(null);
    setSkuMapTarget(null);
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
    setItemEditorModal(null);
    setSkuMapTarget(null);
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
      if (result.success) {
        toast.success(result.message);
        setDoDialogOpen(false);
        setStockAvailability([]);
        setSelectedTicket(null);
        setItemSelection(null);
        router.refresh();
      } else {
        setFulfillmentMessage(result.message);
        toast.error(result.message);
      }
    } catch (error) {
      console.error("Ticket stock fulfillment failed:", error);
      setFulfillmentMessage("Pemenuhan stok gagal. Coba kembali.");
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
            ? (result.moverAssigneeId ?? "")
            : "",
        );
        setDoDialogOpen(true);
      }
    } catch (error) {
      console.error("Ticket stock availability check failed:", error);
      setFulfillmentMessage("Saldo gudang gagal diperiksa.");
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
        toast.error(mappingResult.message);
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
            : (stockCheck.readyItemIds ?? []);
        const nextIds = mappedReady
          ? [...new Set([...previousIds, ticketItemId])]
          : previousIds;
        return { ticketId, itemIds: nextIds };
      });
      setSkuMapTarget(null);
      toast.success(mappingResult.message);
      router.refresh();
      setMoverOptions(stockCheck.movers ?? []);
      setVehicleOptions(stockCheck.vehicles ?? []);
      setSelectedVehicleId(
        stockCheck.vehicles?.some((v) => v.id === selectedVehicleId)
          ? selectedVehicleId
          : (stockCheck.vehicles?.[0]?.id ?? ""),
      );
      setSelectedMoverId(
        stockCheck.movers?.some((m) => m.id === selectedMoverId)
          ? selectedMoverId
          : stockCheck.movers?.some((m) => m.id === stockCheck.moverAssigneeId)
            ? (stockCheck.moverAssigneeId ?? "")
            : "",
      );
    } catch (error) {
      console.error("Ticket item SKU mapping failed:", error);
      setFulfillmentMessage("Item tiket gagal ditautkan ke SKU.");
    } finally {
      setFulfillmentPending(false);
    }
  };

  const handleDeleteContractDelivery = (
    deliveryId: string,
    doNumber: string,
  ) => {
    if (deletingDeliveryId) return;
    setDeletingDeliveryId(deliveryId);
    startTransition(async () => {
      try {
        const result = await deleteUnbilledMaterialDelivery(deliveryId);
        if (result.success) {
          toast.success(
            result.message || `Surat Jalan ${doNumber} berhasil dihapus.`,
          );
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Delete material delivery failed:", error);
        toast.error("Gagal menghapus Surat Jalan material alam.");
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

  const runAction = (ticket: TicketRow, action: DirectAction) => {
    setBusyId(ticket.id);
    startTransition(async () => {
      try {
        const result = await action.run(ticket);
        if (result.success) {
          toast.success(result.message);
          setSelectedTicket(null);
          setItemSelection(null);
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Ticket workflow action failed:", error);
        toast.error("Aksi tiket gagal. Silakan coba kembali.");
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
      toast.success(result.message || "Keputusan alat disimpan.");
      setEquipmentDecisionOpen(false);
      setSelectedTicket(null);
      router.refresh();
    } catch (error) {
      console.error("Logistics equipment decision failed:", error);
      setEquipmentDecisionError("Pemrosesan gagal. Coba kembali.");
    } finally {
      setEquipmentDecisionPending(false);
    }
  };

  const printPurchaseOrder = async (ticketId: string, publicCode?: string) => {
    const toastId = toast.loading("Menyiapkan PDF Purchase Order...");
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
        toast.error(errorMessage, { id: toastId });
        return;
      }
      pdfUrl = URL.createObjectURL(await response.blob());
      toast.dismiss(toastId);
      await printUrlInFrame(pdfUrl);
    } catch (error) {
      console.error("Purchase order PDF download failed:", error);
      toast.error("PDF PO gagal disiapkan.", { id: toastId });
    } finally {
      if (pdfUrl) {
        const urlToRevoke = pdfUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 60_000);
      }
    }
  };

  const MOBILE_PAGE_SIZE = 10;
  const safeMobilePage = Math.min(
    mobilePage,
    Math.max(1, Math.ceil(tickets.length / MOBILE_PAGE_SIZE)),
  );
  const visibleMobileTickets = tickets.slice(
    (safeMobilePage - 1) * MOBILE_PAGE_SIZE,
    safeMobilePage * MOBILE_PAGE_SIZE,
  );

  const selectedTicketPermissions = selectedTicket
    ? getTicketManagementPermissions(selectedTicket, role)
    : null;

  return (
    <div className="my-2">
      {!hideSearch && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-96">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              className="h-9 pl-9"
              value={ticketSearch}
              onChange={(event) => searchTickets(event.target.value)}
              placeholder="Cari nomor tiket, judul, proyek, pemohon..."
              aria-label="Cari tiket"
            />
          </div>
          {ticketSearch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => searchTickets("")}
            >
              Reset Cari
            </Button>
          )}
        </div>
      )}

      {/* TAMPILAN KARTU MOBILE (< 768px) */}
      <div className="space-y-3 md:hidden">
        {visibleMobileTickets.map((ticket) => (
          <TicketMobileCard
            key={`mobile-${ticket.id}`}
            ticket={ticket}
            role={role}
            canRecordContractDo={canRecordContractDo}
            isPending={isPending}
            busyId={busyId}
            onOpenDetail={openTicketSheet}
            onRunAction={runAction}
            onOpenWorkflow={setWorkflowTicket}
            onOpenLogisticsDo={(ticketId) =>
              router.push(
                `/apps/orders/new?type=do&ticketId=${encodeURIComponent(ticketId)}`,
              )
            }
            onOpenContractDo={setContractDoModalTicket}
            onPrintContractSj={openContractSjPreview}
            onOpenManage={(target, mode) =>
              setActiveManageModal({ ticket: target, mode })
            }
          />
        ))}
        {tickets.length === 0 && (
          <EmptyState
            title="Belum ada tiket"
            description="Tidak ada tiket permintaan yang cocok dengan filter saat ini."
          />
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
        {tickets.length === 0 ? (
          <EmptyState
            title="Belum ada tiket"
            description="Tidak ada tiket permintaan yang cocok dengan filter saat ini."
          />
        ) : (
          <Table itemLabel="tiket">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="type-p3 w-40 uppercase tracking-wider">
                  No. Tiket &amp; Tanggal
                </TableHead>
                <TableHead className="type-p3 min-w-60 uppercase tracking-wider">
                  Permintaan &amp; Proyek
                </TableHead>
                <TableHead className="type-p3 hidden uppercase tracking-wider lg:table-cell">
                  Pemohon
                </TableHead>
                <TableHead className="type-p3 hidden text-center uppercase tracking-wider lg:table-cell">
                  Prioritas
                </TableHead>
                <TableHead className="type-p3 min-w-44 uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="type-p3 text-right uppercase tracking-wider">
                  Estimasi
                </TableHead>
                <TableHead className="type-p3 sticky right-0 z-10 w-[124px] border-l border-border/50 bg-card/95 text-center uppercase tracking-wider backdrop-blur-sm">
                  Aksi
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TicketDesktopRow
                  key={ticket.id}
                  ticket={ticket}
                  role={role}
                  canRecordContractDo={canRecordContractDo}
                  isPending={isPending}
                  busyId={busyId}
                  onOpenDetail={openTicketSheet}
                  onRunAction={runAction}
                  onOpenWorkflow={setWorkflowTicket}
                  onOpenLogisticsDo={(ticketId) =>
                    router.push(
                      `/apps/orders/new?type=do&ticketId=${encodeURIComponent(ticketId)}`,
                    )
                  }
                  onOpenContractDo={setContractDoModalTicket}
                  onPrintContractSj={openContractSjPreview}
                  onOpenManage={(target, mode) =>
                    setActiveManageModal({ ticket: target, mode })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modal Detail Tiket */}
      <GlobalModal
        isOpen={selectedTicket !== null}
        onClose={closeTicketSheet}
        title={
          selectedTicket ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="type-p3 rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 font-mono font-extrabold text-primary">
                {selectedTicket.ticketNumber}
              </span>
              <span className="type-h2 line-clamp-1 text-foreground">
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
                  ? "Alat & Kendaraan"
                  : selectedTicket.requestCategory
                    ? requestCategoryLabels[selectedTicket.requestCategory]
                    : typeLabels[selectedTicket.type]
              } · Prioritas ${priorityLabels[selectedTicket.priority]} · ${statusLabels[selectedTicket.status]}`
            : ""
        }
        className="sm:max-w-4xl lg:max-w-5xl"
        footer={
          selectedTicket
            ? (() => {
                const canPrintPo =
                  selectedTicket.type === TicketType.MATERIAL &&
                  !(
                    selectedTicket.items.length > 0 &&
                    selectedTicket.items.every(
                      (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
                    ) &&
                    (selectedTicket.purchaseOrders?.length ?? 0) === 0
                  ) &&
                  (role === UserRole.LOGISTICS ||
                    role === UserRole.DIRECTOR ||
                    role === UserRole.DEPUTY_DIRECTOR ||
                    role === UserRole.ADMINISTRATIONS);
                const canIssueContractDo =
                  canRecordContractDo &&
                  hasOpenContractDelivery(role, selectedTicket);
                const sjCount = selectedTicket.materialDeliveries?.length ?? 0;
                const isLockedFinance = Boolean(
                  selectedTicketPermissions?.processedByFinance && isExecutive,
                );
                const canEditTicket =
                  !isLockedFinance && Boolean(selectedTicketPermissions?.canEdit);
                const canDeleteTicket =
                  !isLockedFinance &&
                  Boolean(selectedTicketPermissions?.canDelete);

                const action =
                  actionFor(role, selectedTicket) ??
                  (selectedTicket.status === TicketStatus.DRAFT &&
                  selectedTicket.canSubmit
                    ? {
                        label: "Ajukan",
                        run: submitTicketRequest,
                      }
                    : null);
                const workflow = workflowFor(role, selectedTicket);
                const isEquipmentLogistics =
                  canOperateLogisticsActions(role) &&
                  selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE &&
                  (selectedTicket.status === "PENDING_LOGISTIK" ||
                    selectedTicket.status === TicketStatus.APPROVED_DIR ||
                    selectedTicket.status === TicketStatus.PROCESSED_LOGISTIC);
                const financeTarget = canOperateFinanceActions(role)
                  ? getFinanceActionTarget(selectedTicket)
                  : null;

                let primaryCta: React.ReactNode = null;
                let contractDoUsedAsPrimary = false;

                if (isEquipmentLogistics) {
                  primaryCta = (
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
                      Proses Alat
                    </Button>
                  );
                } else if (workflow) {
                  const labels = {
                    LOGISTICS: "Proses Logistik",
                    LOGISTICS_DO: "Buat DO",
                    EXPEDITION_RECEIPT: "Terima Barang",
                    FINANCE: "Bayar",
                    MOVER: "Konfirmasi Tiba",
                  };
                  primaryCta = (
                    <Button
                      type="button"
                      onClick={() => {
                        setSelectedTicket(null);
                        setItemSelection(null);
                        if (workflow === "LOGISTICS_DO") {
                          router.push(
                            `/apps/orders/new?type=do&ticketId=${encodeURIComponent(selectedTicket.id)}`,
                          );
                          return;
                        }
                        setWorkflowTicket(selectedTicket);
                      }}
                    >
                      {labels[workflow]}
                    </Button>
                  );
                } else if (financeTarget) {
                  primaryCta = (
                    <Button asChild>
                      <Link href={financeTarget.href}>
                        {financeTarget.label}
                      </Link>
                    </Button>
                  );
                } else if (action) {
                  primaryCta = (
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => runAction(selectedTicket, action)}
                    >
                      {isPending ? "Memproses..." : action.label}
                    </Button>
                  );
                } else if (canIssueContractDo) {
                  contractDoUsedAsPrimary = true;
                  primaryCta = (
                    <Button
                      type="button"
                      variant="success"
                      onClick={() => setContractDoModalTicket(selectedTicket)}
                    >
                      <Truck className="size-4" aria-hidden="true" />
                      Terbitkan Surat Jalan
                    </Button>
                  );
                }

                const hasSecondaryMenu =
                  canPrintPo ||
                  (canIssueContractDo && !contractDoUsedAsPrimary) ||
                  sjCount > 0 ||
                  canEditTicket ||
                  canDeleteTicket;

                return (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeTicketSheet}
                    >
                      Tutup
                    </Button>
                    {hasSecondaryMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                            Opsi
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canIssueContractDo && !contractDoUsedAsPrimary && (
                            <DropdownMenuItem
                              onSelect={() =>
                                setContractDoModalTicket(selectedTicket)
                              }
                            >
                              <Truck className="size-4" aria-hidden="true" />
                              Terbitkan Surat Jalan
                            </DropdownMenuItem>
                          )}
                          {canPrintPo && (
                            <DropdownMenuItem
                              onSelect={() =>
                                printPurchaseOrder(
                                  selectedTicket.id,
                                  selectedTicket.purchaseOrders?.[0]?.publicCode,
                                )
                              }
                            >
                              <Printer className="size-4" aria-hidden="true" />
                              Cetak PO
                            </DropdownMenuItem>
                          )}
                          {sjCount > 0 && (
                            <DropdownMenuItem
                              onSelect={() => openContractSjPreview(selectedTicket)}
                            >
                              <Printer className="size-4" aria-hidden="true" />
                              Cetak SJ ({sjCount})
                            </DropdownMenuItem>
                          )}
                          {(canEditTicket || canDeleteTicket) &&
                            (canPrintPo ||
                              sjCount > 0 ||
                              (canIssueContractDo && !contractDoUsedAsPrimary)) && (
                              <DropdownMenuSeparator />
                            )}
                          {canEditTicket && (
                            <DropdownMenuItem
                              onSelect={() =>
                                setActiveManageModal({
                                  ticket: selectedTicket,
                                  mode: "edit",
                                })
                              }
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {canDeleteTicket && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() =>
                                setActiveManageModal({
                                  ticket: selectedTicket,
                                  mode: "delete",
                                })
                              }
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                              Hapus
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {primaryCta}
                  </>
                );
              })()
            : undefined
        }
      >
        {selectedTicket &&
          (() => {
            const parsedDesc = parseTicketDescription(
              selectedTicket.description,
            );
            const categoryDisplay =
              selectedTicket.ticketType === EQUIPMENT_REQUEST_TYPE
                ? "Alat & Kendaraan"
                : (selectedTicket.requestCategory &&
                    requestCategoryLabels[selectedTicket.requestCategory]) ||
                  parsedDesc.categoryFromDesc ||
                  typeLabels[selectedTicket.type];

            return (
              <div className="space-y-4">
                {selectedTicket.equipmentDetails && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                    <h3 className="type-h3 text-foreground">
                      Detail Alat &amp; Kendaraan
                    </h3>
                    <dl className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <dt className="type-p3 text-muted-foreground">
                          Alat / Kendaraan
                        </dt>
                        <dd className="type-p2 font-medium">
                          {selectedTicket.equipmentDetails.equipmentName || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="type-p3 text-muted-foreground">
                          Tanggal Pakai
                        </dt>
                        <dd className="type-p2 font-medium">
                          {selectedTicket.equipmentDetails.startDate || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="type-p3 text-muted-foreground">
                          Lama Pakai
                        </dt>
                        <dd className="type-p2 font-medium">
                          {selectedTicket.equipmentDetails.duration ?? "—"}{" "}
                          {selectedTicket.equipmentDetails.timeUnit}
                        </dd>
                      </div>
                      {selectedTicket.equipmentDetails.fulfillmentSource && (
                        <div>
                          <dt className="type-p3 text-muted-foreground">
                            Pemenuhan
                          </dt>
                          <dd className="type-p2 font-medium">
                            {selectedTicket.equipmentDetails
                              .fulfillmentSource === "INTERNAL"
                              ? "Alat internal"
                              : "Sewa vendor"}
                          </dd>
                        </div>
                      )}
                      {selectedTicket.equipmentDetails.vendorName && (
                        <div>
                          <dt className="type-p3 text-muted-foreground">
                            Vendor
                          </dt>
                          <dd className="type-p2 font-medium">
                            {selectedTicket.equipmentDetails.vendorName}
                          </dd>
                        </div>
                      )}
                      {selectedTicket.equipmentDetails.quotedCost != null && (
                        <div>
                          <dt className="type-p3 text-muted-foreground">
                            Estimasi Sewa
                          </dt>
                          <dd className="type-p2 font-semibold text-primary">
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

                <div className="rounded-xl border border-border bg-muted/20 p-2.5 sm:p-3.5">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
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
                          className={`rounded-lg border px-2.5 py-1.5 sm:px-3 sm:py-2 ${
                            isDone
                              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-500"
                              : isActive
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card/50 text-muted-foreground"
                          }`}
                        >
                          <p className="type-p2 font-bold">{s.title}</p>
                          <p className="type-p3 opacity-80">{s.sub}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 sm:mt-3 sm:px-3 sm:py-2">
                    <span className="type-p3 font-semibold text-foreground">
                      Status: {statusLabels[selectedTicket.status]}
                    </span>
                    <span className="type-p3 text-muted-foreground">
                      {nextStepLabels[selectedTicket.status]}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5">
                  <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                      Pemohon
                    </p>
                    <p className="type-p2 mt-0.5 truncate font-bold text-foreground sm:mt-1">
                      {selectedTicket.requester.name}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-2.5 sm:p-3">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                      Tanggal Pengajuan
                    </p>
                    <p className="type-p2 mt-0.5 font-bold text-foreground sm:mt-1">
                      {format(
                        new Date(selectedTicket.createdAt),
                        "d MMM yyyy, HH:mm",
                        { locale: id },
                      )}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 sm:col-span-1 sm:p-3">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                      {selectedTicket.type === TicketType.MATERIAL
                        ? "Total Estimasi"
                        : "Nominal Pengajuan"}
                    </p>
                    <p className="type-kpi mt-0.5 text-primary sm:mt-1">
                      {formatCurrency(selectedTicket.totalAmount)}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-border bg-card p-2.5 sm:p-3">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                      Proyek &amp; Lokasi Kerja
                    </p>
                    <p className="type-p2 mt-0.5 font-bold text-foreground sm:mt-1">
                      {selectedTicket.project
                        ? `${selectedTicket.project.kelompokTani} — ${selectedTicket.project.title}`
                        : "Non-Proyek / Operasional"}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-border bg-card p-2.5 sm:col-span-1 sm:p-3">
                    <p className="type-p3 font-semibold uppercase tracking-wider text-muted-foreground">
                      {selectedTicket.items.length > 0
                        ? "Pemenuhan Barang"
                        : "Kategori"}
                    </p>
                    <p className="type-p2 mt-0.5 font-bold text-foreground sm:mt-1">
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

                {(parsedDesc.notes ||
                  parsedDesc.extraFields.length > 0 ||
                  selectedTicket.requestCategory ===
                    TicketRequestCategory.APH) && (
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
                        Keterangan &amp; Rincian
                      </h3>
                      <Badge variant="outline">{categoryDisplay}</Badge>
                    </div>

                    {parsedDesc.notes && (
                      <div className="type-p2 whitespace-pre-wrap rounded-lg border border-border/70 bg-muted/25 px-3.5 py-2.5 text-foreground">
                        {parsedDesc.notes}
                      </div>
                    )}

                    {parsedDesc.extraFields.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {parsedDesc.extraFields.map((field, idx) => (
                          <div
                            key={`${field.label}-${idx}`}
                            className="rounded-lg border border-border bg-muted/20 px-3 py-2"
                          >
                            <span className="type-p3 block text-muted-foreground">
                              {field.label}
                            </span>
                            <span className="type-p2 mt-0.5 block font-semibold text-foreground">
                              {field.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {selectedTicket.requestCategory ===
                      TicketRequestCategory.APH && (
                      <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
                        <h4 className="type-p2 font-semibold text-foreground">
                          Detail Pembayaran APH
                        </h4>
                        <p className="type-p3 text-muted-foreground">
                          Metode:{" "}
                          <span className="font-semibold text-foreground">
                            {selectedTicket.requestPaymentMethod ===
                            POPaymentMethod.CASH
                              ? "Tunai (Cash)"
                              : "Transfer Bank"}
                          </span>
                        </p>
                        {selectedTicket.requestPaymentMethod ===
                          POPaymentMethod.TRANSFER && (
                          <p className="type-p3 text-muted-foreground">
                            Tujuan Transfer:{" "}
                            <span className="font-semibold text-foreground">
                              {selectedTicket.transferDestination || "—"}
                            </span>
                          </p>
                        )}
                        {selectedTicket.requestPaymentDescription && (
                          <p className="type-p3 whitespace-pre-wrap text-muted-foreground">
                            {selectedTicket.requestPaymentDescription}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(selectedTicket.recipientName ||
                  selectedTicket.bankName ||
                  selectedTicket.accountNumber ||
                  selectedTicket.transferReceiptUrl) && (
                  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
                        Rekening Tujuan
                      </h3>
                      {selectedTicket.transferReceiptUrl && (() => {
                        const assetMeta = parseClientAssetCode(selectedTicket.transferReceiptUrl);
                        return (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                            onClick={() =>
                              openReceiptPreview({
                                label: "Bukti Transfer",
                                url: selectedTicket.transferReceiptUrl!,
                              })
                            }
                          >
                            <Eye className="size-3.5" aria-hidden="true" />
                            Bukti Transfer
                            {assetMeta && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                {assetMeta.assetCode}
                              </span>
                            )}
                          </Button>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div className="rounded-lg border border-border bg-muted/25 p-3">
                        <span className="type-p3 block text-muted-foreground">
                          Nama Penerima
                        </span>
                        <span className="type-p2 mt-0.5 block font-bold text-foreground">
                          {selectedTicket.recipientName || "—"}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/25 p-3">
                        <span className="type-p3 block text-muted-foreground">
                          Bank Tujuan
                        </span>
                        <span className="type-p2 mt-0.5 block font-bold uppercase text-foreground">
                          {selectedTicket.bankName || "—"}
                        </span>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/25 p-3">
                        <span className="type-p3 block text-muted-foreground">
                          Nomor Rekening
                        </span>
                        <span className="type-p2 mt-0.5 block font-mono font-bold text-primary">
                          {selectedTicket.accountNumber || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {(selectedTicket.attachmentUrl ||
                  selectedTicket.receiptUrls.length > 0 ||
                  selectedTicket.paymentProofUrl ||
                  selectedTicket.purchaseReceiptUrl ||
                  selectedTicket.deliveryReceiptUrl ||
                  (selectedTicket as TicketRowWithDeliveryOrderReceipt)
                    .deliveryOrderReceiptUrl) && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="type-p3 mb-2.5 font-bold uppercase tracking-wider text-muted-foreground">
                      Lampiran &amp; Bukti Dokumen
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedTicket.attachmentUrl && (
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={selectedTicket.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                            Lampiran
                          </a>
                        </Button>
                      )}
                      {selectedTicket.receiptUrls.map((url, index) => {
                        const assetMeta = parseClientAssetCode(url);
                        return (
                          <Button
                            key={`${selectedTicket.id}-receipt-${index}-${url}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                            onClick={() =>
                              openReceiptPreview({
                                label: `Bukti Pengajuan ${index + 1}`,
                                url,
                              })
                            }
                          >
                            <Eye className="size-3.5" aria-hidden="true" />
                            Bukti #{index + 1}
                            {assetMeta && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                {assetMeta.assetCode}
                              </span>
                            )}
                          </Button>
                        );
                      })}
                      {[
                        ["Bukti Pembayaran", selectedTicket.paymentProofUrl],
                        ["Bukti Pembelian", selectedTicket.purchaseReceiptUrl],
                        ["Bukti Pengiriman", selectedTicket.deliveryReceiptUrl],
                        [
                          "Bukti Surat Jalan / DO",
                          (selectedTicket as TicketRowWithDeliveryOrderReceipt)
                            .deliveryOrderReceiptUrl ?? null,
                        ],
                      ]
                        .filter((receipt): receipt is [string, string] =>
                          Boolean(receipt[1]),
                        )
                        .map(([label, url]) => {
                          const assetMeta = parseClientAssetCode(url);
                          return (
                            <Button
                              key={`${selectedTicket.id}-${label}-${url}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                              onClick={() => openReceiptPreview({ label, url })}
                            >
                              <Eye className="size-3.5" aria-hidden="true" />
                              {label}
                              {assetMeta && (
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                  {assetMeta.assetCode}
                                </span>
                              )}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {(selectedTicket.purchaseOrders?.length ?? 0) > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedTicket.purchaseOrders!.map((po) => (
                      <div
                        key={po.publicCode}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3.5"
                      >
                        <div>
                          <p className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
                            Purchase Order
                          </p>
                          <p className="type-p2 mt-0.5 font-bold text-foreground">
                            {po.poNumber} · {po.vendorName}
                          </p>
                          <Badge
                            variant={po.paidAt ? "lightSuccess" : "lightWarning"}
                            className="mt-1"
                          >
                            {po.paidAt ? "Lunas" : po.status}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            printPurchaseOrder(selectedTicket.id, po.publicCode)
                          }
                        >
                          <Printer className="size-3.5" aria-hidden="true" />
                          Cetak PO
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

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
                              <p className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
                                Surat Jalan (DO)
                              </p>
                              <p className="type-p2 mt-0.5 font-bold text-foreground">
                                {deliveryOrder.doNumber}
                              </p>
                            </div>
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/d/${deliveryOrder.publicCode}`}>
                                <FileText className="size-3.5" aria-hidden="true" />
                                Cetak DO
                              </Link>
                            </Button>
                          </div>
                          {hasOrderPhotos && (
                            <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                              {deliveryOrder.arrivalPhotoUrl && (() => {
                                const assetMeta = parseClientAssetCode(deliveryOrder.arrivalPhotoUrl);
                                return (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                    onClick={() =>
                                      openReceiptPreview({
                                        label: `Foto Material Tiba · ${deliveryOrder.doNumber}`,
                                        url: deliveryOrder.arrivalPhotoUrl!,
                                      })
                                    }
                                  >
                                    <Eye className="size-3.5" aria-hidden="true" />
                                    Foto Tiba
                                    {assetMeta && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                        {assetMeta.assetCode}
                                      </span>
                                    )}
                                  </Button>
                                );
                              })()}
                              {deliveryOrder.deliveryReceiptUrl && (() => {
                                const assetMeta = parseClientAssetCode(deliveryOrder.deliveryReceiptUrl);
                                return (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                    onClick={() =>
                                      openReceiptPreview({
                                        label: `Bukti DO · ${deliveryOrder.doNumber}`,
                                        url: deliveryOrder.deliveryReceiptUrl!,
                                      })
                                    }
                                  >
                                    <Eye className="size-3.5" aria-hidden="true" />
                                    Bukti DO
                                    {assetMeta && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                        {assetMeta.assetCode}
                                      </span>
                                    )}
                                  </Button>
                                );
                              })()}
                              {deliveryOrder.receiptPhotos?.map(
                                (photo, photoIdx) => {
                                  const assetMeta = parseClientAssetCode(photo.url);
                                  return (
                                    <Button
                                      key={photo.id}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                      onClick={() =>
                                        openReceiptPreview({
                                          label: `Serah Terima #${photoIdx + 1} · ${deliveryOrder.doNumber}`,
                                          url: photo.url,
                                        })
                                      }
                                    >
                                      <Eye className="size-3.5" aria-hidden="true" />
                                      Foto #{photoIdx + 1}
                                      {assetMeta && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                          {assetMeta.assetCode}
                                        </span>
                                      )}
                                    </Button>
                                  );
                                },
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {selectedTicket.directStockPurchases?.map((purchase) => {
                      const stageLabel =
                        purchase.status === "RECEIVED"
                          ? "Diterima"
                          : purchase.hasFinanceProof
                            ? "Siap Diterima"
                            : purchase.vendorInvoiceUrl
                              ? "Menunggu Finance"
                              : purchase.isApprovedByDirector
                                ? "Menunggu Invoice"
                                : "Menunggu Direktur";
                      const purchasePhotoUrls =
                        purchase.receivedPhotos &&
                        purchase.receivedPhotos.length > 0
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
                              <p className="type-p3 font-bold uppercase tracking-wider text-muted-foreground">
                                Pembelian Langsung
                              </p>
                              <p className="type-p2 mt-0.5 font-bold text-foreground">
                                {purchase.purchaseNumber} · {purchase.vendorName}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {formatCurrency(purchase.totalAmount)} ·{" "}
                                {stageLabel}
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
                                canOperateFinanceActions(role) &&
                                purchase.isApprovedByDirector &&
                                Boolean(purchase.vendorInvoiceUrl) &&
                                !purchase.hasFinanceProof && (
                                  <Button asChild size="sm">
                                    <Link
                                      href={`/apps/finance?tab=payment&openSheet=${encodeURIComponent(purchase.id)}`}
                                    >
                                      Bayar
                                    </Link>
                                  </Button>
                                )}
                              {purchase.status === "PENDING_RECEIPT" &&
                                !canOperateFinanceActions(role) && (
                                  <Button asChild size="sm" variant="outline">
                                    <Link href="/apps/logistics?tab=stock">
                                      Kelola Stok
                                    </Link>
                                  </Button>
                                )}
                            </div>
                          </div>
                          {(purchase.vendorInvoiceUrl ||
                            purchasePhotoUrls.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                              {purchase.vendorInvoiceUrl && (() => {
                                const assetMeta = parseClientAssetCode(purchase.vendorInvoiceUrl);
                                return (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                    onClick={() =>
                                      openReceiptPreview({
                                        label: `Invoice · ${purchase.purchaseNumber}`,
                                        url: purchase.vendorInvoiceUrl!,
                                      })
                                    }
                                  >
                                    <Eye className="size-3.5" aria-hidden="true" />
                                    Invoice
                                    {assetMeta && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                        {assetMeta.assetCode}
                                      </span>
                                    )}
                                  </Button>
                                );
                              })()}
                              {purchasePhotoUrls.map((photoUrl, photoIdx) => {
                                const assetMeta = parseClientAssetCode(photoUrl);
                                return (
                                  <Button
                                    key={`${purchase.id}-photo-${photoIdx}`}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                    onClick={() =>
                                      openReceiptPreview({
                                        label: `Foto Tiba #${photoIdx + 1} · ${purchase.purchaseNumber}`,
                                        url: photoUrl,
                                      })
                                    }
                                  >
                                    <Eye className="size-3.5" aria-hidden="true" />
                                    Foto #{photoIdx + 1}
                                    {assetMeta && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                        {assetMeta.assetCode}
                                      </span>
                                    )}
                                  </Button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(selectedTicket.items.some(
                  (item) => item.categoryHint === TicketCategoryHint.CONTRACT,
                ) ||
                  (selectedTicket.materialDeliveries?.length ?? 0) > 0) && (
                  <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="type-h3 text-foreground">
                          Surat Jalan Material Alam (Kontrak Payung)
                        </h3>
                        <p className="type-p3 text-muted-foreground">
                          Armada &amp; mover disediakan langsung oleh vendor kontrak payung.
                          Tugas kita menerbitkan Surat Jalan resmi tanpa PO/DO armada internal.
                        </p>
                      </div>
                      {canRecordContractDo &&
                        hasOpenContractDelivery(role, selectedTicket) && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              setContractDoModalTicket(selectedTicket)
                            }
                          >
                            <Truck className="size-3.5" aria-hidden="true" />
                            Terbitkan Surat Jalan
                          </Button>
                        )}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {selectedTicket.items
                        .filter(
                          (item) =>
                            item.categoryHint === TicketCategoryHint.CONTRACT,
                        )
                        .map((item) => {
                          const delivered = getContractItemDeliveredVolume(
                            selectedTicket,
                            item.materialContractId,
                          );
                          const remaining = Math.max(
                            0,
                            item.quantity - delivered,
                          );
                          const isDone =
                            item.status === FulfillmentStatus.PROCESSED_TO_DO ||
                            remaining <= 0;
                          return (
                            <div
                              key={`contract-progress-${item.id}`}
                              className="space-y-1.5 rounded-lg border border-border/80 bg-muted/20 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="type-p2 font-bold text-foreground">
                                    {item.itemName}
                                  </p>
                                  {item.materialContract && (
                                    <p className="type-p3 text-muted-foreground">
                                      {item.materialContract.contractNumber} ·{" "}
                                      {item.materialContract.vendorName} ·{" "}
                                      {formatCurrency(
                                        String(item.materialContract.unitPrice),
                                      )}
                                      /{item.unit}
                                    </p>
                                  )}
                                </div>
                                <Badge
                                  variant={isDone ? "lightSuccess" : "lightWarning"}
                                >
                                  {isDone ? "Terpenuhi" : "Aktif"}
                                </Badge>
                              </div>
                              <div className="type-p3 flex flex-wrap items-center justify-between gap-2 pt-1 text-muted-foreground">
                                <span>
                                  Diminta:{" "}
                                  <strong className="text-foreground">
                                    {formatMaterialVolume(
                                      item.quantity,
                                      item.unit,
                                    )}
                                  </strong>
                                </span>
                                <span>
                                  Terkirim:{" "}
                                  <strong className="text-emerald-500">
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
                      <>
                        <div className="space-y-2.5 md:hidden">
                          {selectedTicket.materialDeliveries!.map((delivery) => {
                            const hasSjMenu =
                              canAttachContractProof ||
                              Boolean(delivery.proofUrl) ||
                              (canRecordContractDo &&
                                delivery.billingStatus === "UNBILLED");
                            return (
                              <div
                                key={delivery.id}
                                className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="type-p2 font-mono font-bold text-primary">
                                      {delivery.doNumber}
                                    </p>
                                    <p className="type-p3 text-muted-foreground">
                                      {delivery.deliveryDate} ·{" "}
                                      {delivery.vehiclePlate || "-"}
                                      {delivery.driverName
                                        ? ` (${delivery.driverName})`
                                        : ""}
                                    </p>
                                    <p className="type-p3 text-muted-foreground">
                                      {delivery.materialType} ·{" "}
                                      {delivery.vendorName} (
                                      {delivery.contractNumber})
                                    </p>
                                  </div>
                                  <Badge
                                    className="shrink-0"
                                    variant={
                                      delivery.billingStatus === "BILLED"
                                        ? "lightSuccess"
                                        : "lightWarning"
                                    }
                                  >
                                    {delivery.billingStatus}
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5">
                                  <span className="type-p2 font-semibold tabular-nums">
                                    {formatMaterialVolume(
                                      delivery.quantityReceived,
                                      delivery.unit,
                                    )}
                                  </span>
                                  <span className="type-p2 font-mono font-bold tabular-nums">
                                    {formatCurrency(
                                      String(delivery.estimatedAmount),
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() =>
                                      openContractSjPreview(
                                        selectedTicket,
                                        delivery.id,
                                      )
                                    }
                                  >
                                    <Printer
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Pratinjau SJ
                                  </Button>
                                  {hasSjMenu && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          aria-label={`Menu aksi ${delivery.doNumber}`}
                                        >
                                          <MoreHorizontal
                                            className="size-4"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {canAttachContractProof && (
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              setContractSjAttachTarget({
                                                id: delivery.id,
                                                publicCode:
                                                  (
                                                    delivery as {
                                                      publicCode?: string | null;
                                                    }
                                                  ).publicCode ?? null,
                                                doNumber: delivery.doNumber,
                                                vehiclePlate:
                                                  delivery.vehiclePlate,
                                                driverName: delivery.driverName,
                                                proofUrl: delivery.proofUrl,
                                                vendorName: delivery.vendorName,
                                                materialType:
                                                  delivery.materialType,
                                              })
                                            }
                                          >
                                            <Upload
                                              className="size-4"
                                              aria-hidden="true"
                                            />
                                            {delivery.proofUrl
                                              ? "Update Lampiran"
                                              : "Lampirkan Foto/Plat"}
                                          </DropdownMenuItem>
                                        )}
                                        {delivery.proofUrl && (
                                          <DropdownMenuItem
                                            onSelect={() =>
                                              openReceiptPreview({
                                                label: `Bukti Surat Jalan ${delivery.doNumber}`,
                                                url: delivery.proofUrl!,
                                              })
                                            }
                                          >
                                            <Eye
                                              className="size-4"
                                              aria-hidden="true"
                                            />
                                            Lihat Foto
                                          </DropdownMenuItem>
                                        )}
                                        {canRecordContractDo &&
                                          delivery.billingStatus ===
                                            "UNBILLED" && (
                                            <>
                                              {(canAttachContractProof ||
                                                Boolean(delivery.proofUrl)) && (
                                                <DropdownMenuSeparator />
                                              )}
                                              <DropdownMenuItem
                                                disabled={
                                                  isPending ||
                                                  deletingDeliveryId ===
                                                    delivery.id
                                                }
                                                className="text-destructive focus:text-destructive"
                                                onSelect={() =>
                                                  handleDeleteContractDelivery(
                                                    delivery.id,
                                                    delivery.doNumber,
                                                  )
                                                }
                                              >
                                                <Trash2
                                                  className="size-4"
                                                  aria-hidden="true"
                                                />
                                                Hapus
                                              </DropdownMenuItem>
                                            </>
                                          )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="hidden md:block">
                          <Table pagination={false}>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead className="type-p3">Tanggal</TableHead>
                                <TableHead className="type-p3">No. SJ &amp; Armada Vendor</TableHead>
                                <TableHead className="type-p3">Kontrak</TableHead>
                                <TableHead className="type-p3 text-right">
                                  Volume
                                </TableHead>
                                <TableHead className="type-p3 text-right">
                                  Nilai
                                </TableHead>
                                <TableHead className="type-p3">Tagihan</TableHead>
                                <TableHead className="type-p3 text-right">
                                  Aksi
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedTicket.materialDeliveries!.map((delivery) => (
                                <TableRow key={delivery.id}>
                                  <TableCell className="type-p3 whitespace-nowrap">
                                    {delivery.deliveryDate}
                                  </TableCell>
                                  <TableCell>
                                    <div className="type-p2 font-semibold">
                                      {delivery.doNumber}
                                    </div>
                                    <div className="type-p3 text-muted-foreground">
                                      {delivery.vehiclePlate || "-"}
                                      {delivery.driverName
                                        ? ` · ${delivery.driverName}`
                                        : ""}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="type-p2 font-medium">
                                      {delivery.materialType} · {delivery.vendorName}
                                    </div>
                                    <div className="type-p3 text-muted-foreground">
                                      {delivery.contractNumber}
                                    </div>
                                  </TableCell>
                                  <TableCell className="type-p2 whitespace-nowrap text-right font-semibold">
                                    {formatMaterialVolume(
                                      delivery.quantityReceived,
                                      delivery.unit,
                                    )}
                                  </TableCell>
                                  <TableCell className="type-p2 whitespace-nowrap text-right font-medium">
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
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        title="Pratinjau / Cetak Surat Jalan"
                                        onClick={() =>
                                          openContractSjPreview(
                                            selectedTicket,
                                            delivery.id,
                                          )
                                        }
                                      >
                                        <Printer
                                          className="size-3.5"
                                          aria-hidden="true"
                                        />
                                        Pratinjau / Cetak SJ
                                      </Button>
                                      {canAttachContractProof && (
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          aria-label={`Lampirkan Foto / Plat / Supir ${delivery.doNumber}`}
                                          title="Lampirkan Foto / Plat / Supir"
                                          onClick={() =>
                                            setContractSjAttachTarget({
                                              id: delivery.id,
                                              publicCode:
                                                (
                                                  delivery as {
                                                    publicCode?: string | null;
                                                  }
                                                ).publicCode ?? null,
                                              doNumber: delivery.doNumber,
                                              vehiclePlate: delivery.vehiclePlate,
                                              driverName: delivery.driverName,
                                              proofUrl: delivery.proofUrl,
                                              vendorName: delivery.vendorName,
                                              materialType: delivery.materialType,
                                            })
                                          }
                                        >
                                          <Upload
                                            className="size-3.5"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                      )}
                                      {delivery.proofUrl && (
                                        <Button
                                          type="button"
                                          size="icon"
                                          variant="outline"
                                          aria-label={`Lihat bukti ${delivery.doNumber}`}
                                          title="Lihat Foto Bukti"
                                          onClick={() =>
                                            openReceiptPreview({
                                              label: `Bukti Surat Jalan ${delivery.doNumber}`,
                                              url: delivery.proofUrl!,
                                            })
                                          }
                                        >
                                          <Eye className="size-3.5" aria-hidden="true" />
                                        </Button>
                                      )}
                                      {canRecordContractDo &&
                                        delivery.billingStatus === "UNBILLED" && (
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="outline"
                                            disabled={
                                              isPending ||
                                              deletingDeliveryId === delivery.id
                                            }
                                            aria-label={`Hapus Surat Jalan ${delivery.doNumber}`}
                                            title="Hapus Surat Jalan belum ditagih"
                                            onClick={() =>
                                              handleDeleteContractDelivery(
                                                delivery.id,
                                                delivery.doNumber,
                                              )
                                            }
                                          >
                                            <Trash2
                                              className="size-3.5 text-destructive"
                                              aria-hidden="true"
                                            />
                                          </Button>
                                        )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    ) : (
                      <EmptyState
                        variant="inline"
                        title="Belum ada Surat Jalan"
                        description="Belum ada Surat Jalan material alam diterbitkan untuk tiket ini."
                      />
                    )}
                  </section>
                )}

                {(selectedTicket.items.length > 0 ||
                  (canExecutiveManageTicket &&
                    selectedTicket.type === TicketType.MATERIAL)) && (
                  <section className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="type-h3 text-foreground">
                            Rincian Item ({selectedTicket.items.length})
                          </h3>
                          {isExecutive && selectedTicketFinanceLocked && (
                            <Badge variant="lightWarning" className="gap-1">
                              <Lock className="size-3" aria-hidden="true" />
                              Terkunci Finance
                            </Badge>
                          )}
                        </div>
                        {canSplitFulfillment && (
                          <p className="type-p3 text-muted-foreground">
                            Centang item untuk memeriksa stok (DO) atau membuat
                            PO / pembelian langsung.
                          </p>
                        )}
                      </div>

                      {(canExecutiveManageTicket || canSplitFulfillment) && (
                        <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center [&>*:only-child]:col-span-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                          {canExecutiveManageTicket && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={fulfillmentPending}
                              onClick={() => setItemEditorModal({ mode: "add" })}
                            >
                              <Plus className="size-3.5" aria-hidden="true" />
                              Tambah Item
                            </Button>
                          )}
                          {canSplitFulfillment && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  selectedStockItems.length === 0 ||
                                  fulfillmentPending
                                }
                                onClick={prepareWarehouseFulfillment}
                              >
                                <PackageOpen
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                Cek Stok ({selectedStockItems.length})
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={
                                  selectedStockItems.length === 0 ||
                                  fulfillmentPending
                                }
                                onClick={() => {
                                  if (
                                    !selectedTicket ||
                                    selectedStockItems.length === 0
                                  )
                                    return;
                                  setFulfillmentMessage("");
                                  setStockAvailability([]);
                                  setItemSelection({
                                    ticketId: selectedTicket.id,
                                    itemIds: selectedStockItems.map((i) => i.id),
                                  });
                                  setPurchaseMode("DIRECT_PURCHASE");
                                  setPoDialogOpen(true);
                                }}
                              >
                                <ShoppingCart
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                                <span className="sm:hidden">
                                  PO / Belanja ({selectedStockItems.length})
                                </span>
                                <span className="hidden sm:inline">
                                  Buat PO / Belanja ({selectedStockItems.length})
                                </span>
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5 md:hidden">
                      {canSplitFulfillment &&
                        pendingTicketItemIds.length > 0 && (
                          <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3 py-2">
                            <Label className="type-p3 flex cursor-pointer items-center gap-2 font-medium text-foreground">
                              <Checkbox
                                checked={
                                  allPendingItemsSelected
                                    ? true
                                    : somePendingItemsSelected
                                      ? "indeterminate"
                                      : false
                                }
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
                              <span>
                                Pilih Semua ({pendingTicketItemIds.length})
                              </span>
                            </Label>
                          </div>
                        )}
                      {selectedTicket.items.map((item) => (
                        <TicketDetailItemCard
                          key={item.id}
                          ticket={selectedTicket}
                          item={item}
                          canSplitFulfillment={canSplitFulfillment}
                          canExecutiveManageTicket={canExecutiveManageTicket}
                          selected={selectedItemIds.includes(item.id)}
                          onToggleSelect={(checked) =>
                            setItemSelection({
                              ticketId: selectedTicket.id,
                              itemIds: checked
                                ? [...selectedItemIds, item.id]
                                : selectedItemIds.filter((id) => id !== item.id),
                            })
                          }
                          onEditItem={(target) =>
                            setItemEditorModal({ mode: "edit", item: target })
                          }
                          onDeleteItem={(target) =>
                            setItemEditorModal({ mode: "delete", item: target })
                          }
                        />
                      ))}
                    </div>

                    <div className="hidden md:block">
                      <Table pagination={false}>
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
                                  aria-label="Pilih semua item"
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
                            <TableHead className="type-p3">Nama Item</TableHead>
                            <TableHead className="type-p3">Jumlah</TableHead>
                            <TableHead className="type-p3">Harga</TableHead>
                            <TableHead className="type-p3">Sumber</TableHead>
                            <TableHead className="type-p3">Target Tiba</TableHead>
                            <TableHead className="type-p3">Status</TableHead>
                            {canExecutiveManageTicket && (
                              <TableHead className="type-p3 text-right">
                                Aksi
                              </TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedTicket.items.map((item) => (
                            <TicketDetailItemRow
                              key={item.id}
                              ticket={selectedTicket}
                              item={item}
                              canSplitFulfillment={canSplitFulfillment}
                              canExecutiveManageTicket={canExecutiveManageTicket}
                              selected={selectedItemIds.includes(item.id)}
                              onToggleSelect={(checked) =>
                                setItemSelection({
                                  ticketId: selectedTicket.id,
                                  itemIds: checked
                                    ? [...selectedItemIds, item.id]
                                    : selectedItemIds.filter(
                                        (id) => id !== item.id,
                                      ),
                                })
                              }
                              onEditItem={(target) =>
                                setItemEditorModal({
                                  mode: "edit",
                                  item: target,
                                })
                              }
                              onDeleteItem={(target) =>
                                setItemEditorModal({
                                  mode: "delete",
                                  item: target,
                                })
                              }
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                )}

                {(selectedTicket.paymentTransactions?.length ?? 0) > 0 && (
                  <div className="space-y-2.5 rounded-xl border border-border bg-card p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="type-h3 text-foreground">
                        Riwayat Pembayaran
                      </h3>
                      {(() => {
                        const paid = selectedTicket.paymentTransactions!.reduce(
                          (sum, payment) => sum + payment.amount,
                          0,
                        );
                        return (
                          <Badge variant="secondary">
                            {selectedTicket.paymentTransactions!.length} transaksi
                            · {formatCurrency(String(paid))}
                          </Badge>
                        );
                      })()}
                    </div>

                    <div className="space-y-2 md:hidden">
                      {selectedTicket.paymentTransactions!.map((payment) => (
                        <div
                          key={payment.id}
                          className="space-y-1.5 rounded-xl border border-border/80 bg-muted/15 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="type-p2 truncate font-semibold text-foreground">
                                {payment.reference}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {payment.paidAt
                                  ? new Date(payment.paidAt).toLocaleDateString(
                                      "id-ID",
                                    )
                                  : "—"}{" "}
                                · {payment.transferDestination}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0">
                              {payment.paymentType === PaymentType.DOWN_PAYMENT
                                ? "DP"
                                : payment.paymentType ===
                                    PaymentType.PROGRESS_PAYMENT
                                  ? "Termin"
                                  : "Pelunasan"}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="type-p2 font-mono font-bold tabular-nums text-foreground">
                              {formatCurrency(String(payment.amount))}
                            </span>
                            {payment.proofOfTransferUrl && (() => {
                              const assetMeta = parseClientAssetCode(payment.proofOfTransferUrl);
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                  onClick={() =>
                                    openReceiptPreview({
                                      label: `Bukti Pembayaran · ${selectedTicket.ticketNumber}`,
                                      url: payment.proofOfTransferUrl!,
                                    })
                                  }
                                >
                                  <Eye className="size-3.5" aria-hidden="true" />
                                  Lihat Bukti
                                  {assetMeta && (
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                      {assetMeta.assetCode}
                                    </span>
                                  )}
                                </Button>
                              );
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block">
                      <Table pagination={false}>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="type-p3">Tanggal</TableHead>
                            <TableHead className="type-p3">Referensi</TableHead>
                            <TableHead className="type-p3">Tipe</TableHead>
                            <TableHead className="type-p3 text-right">
                              Jumlah
                            </TableHead>
                            <TableHead className="type-p3">
                              Tujuan Transfer
                            </TableHead>
                            <TableHead className="type-p3 text-right">
                              Bukti
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedTicket.paymentTransactions!.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="type-p3 whitespace-nowrap">
                                {payment.paidAt
                                  ? new Date(payment.paidAt).toLocaleDateString(
                                      "id-ID",
                                    )
                                  : "—"}
                              </TableCell>
                              <TableCell className="type-p2 font-medium">
                                {payment.reference}
                              </TableCell>
                              <TableCell className="type-p3">
                                {payment.paymentType === PaymentType.DOWN_PAYMENT
                                  ? "DP"
                                  : payment.paymentType ===
                                      PaymentType.PROGRESS_PAYMENT
                                    ? "Termin"
                                    : "Pelunasan"}
                              </TableCell>
                              <TableCell className="type-p2 text-right font-semibold tabular-nums">
                                {formatCurrency(String(payment.amount))}
                              </TableCell>
                              <TableCell className="type-p3">
                                {payment.transferDestination}
                              </TableCell>
                              <TableCell className="text-right">
                                {payment.proofOfTransferUrl ? (() => {
                                  const assetMeta = parseClientAssetCode(payment.proofOfTransferUrl);
                                  return (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      title={assetMeta ? `${assetMeta.kindLabel} (${assetMeta.assetCode})` : undefined}
                                      onClick={() =>
                                        openReceiptPreview({
                                          label: `Bukti Pembayaran · ${selectedTicket.ticketNumber}`,
                                          url: payment.proofOfTransferUrl!,
                                        })
                                      }
                                    >
                                      <Eye className="size-3.5" aria-hidden="true" />
                                      Bukti
                                      {assetMeta && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground/80">
                                          {assetMeta.assetCode}
                                        </span>
                                      )}
                                    </Button>
                                  );
                                })() : (
                                  "—"
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <h3 className="type-h3 text-foreground">
                    Riwayat Aktivitas ({selectedTicket.auditLogs.length})
                  </h3>
                  <ol className="space-y-3 border-l-2 border-primary/30 pl-4">
                    {selectedTicket.auditLogs.map((log) => (
                      <li key={log.id} className="relative">
                        <span className="absolute -left-[1.35rem] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="type-p2 font-semibold text-foreground">
                            {auditActionLabels[log.action] ?? log.action}
                          </p>
                          <span className="type-p3 text-muted-foreground">
                            {log.user.name} ·{" "}
                            {format(
                              new Date(log.createdAt),
                              "d MMM yyyy, HH:mm",
                              { locale: id },
                            )}
                          </span>
                        </div>
                        {log.notes && (
                          <p className="type-p3 mt-0.5 text-muted-foreground">
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

      {/* Hoisted Item Editor Modal */}
      {selectedTicket && itemEditorModal && (
        <TicketItemEditorModal
          key={`${selectedTicket.id}:${itemEditorModal.mode}:${itemEditorModal.mode !== "add" ? itemEditorModal.item.id : "new"}`}
          ticket={selectedTicket}
          modalState={itemEditorModal}
          stockItems={stockItems}
          onClose={() => setItemEditorModal(null)}
          onSaved={() => router.refresh()}
        />
      )}

      {/* Hoisted Ticket Edit / Delete Modal */}
      <TicketManagementModal
        ticket={activeManageModal?.ticket ?? null}
        mode={activeManageModal?.mode ?? null}
        role={role}
        onClose={() => setActiveManageModal(null)}
        onTicketDeleted={() => {
          if (selectedTicket?.id === activeManageModal?.ticket.id) {
            closeTicketSheet();
          }
        }}
      />

      {/* Hoisted Equipment Decision Modal */}
      <GlobalModal
        isOpen={equipmentDecisionOpen}
        onClose={() => {
          if (equipmentDecisionPending) return;
          setEquipmentDecisionOpen(false);
          setEquipmentDecisionError("");
        }}
        title="Proses Permintaan Alat"
        description="Tentukan pemenuhan alat internal atau sewa vendor."
        className="sm:max-w-xl"
        footer={
          <>
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
              onClick={() => void processEquipmentLogisticsDecision()}
              disabled={
                equipmentDecisionPending ||
                (equipmentSource === "EXTERNAL_VENDOR" &&
                  (!equipmentVendorName.trim() ||
                    !equipmentQuotedCost ||
                    Number(equipmentQuotedCost) <= 0))
              }
            >
              {equipmentDecisionPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
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
            <Label
              htmlFor="equipment-source-internal"
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
                equipmentSource === "INTERNAL"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <RadioGroupItem value="INTERNAL" id="equipment-source-internal" />
              <span>
                <span className="type-p2 block font-semibold">
                  Alat Internal
                </span>
                <span className="type-p3 mt-1 block text-muted-foreground">
                  Gunakan aset perusahaan.
                </span>
              </span>
            </Label>
            <Label
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
                <span className="type-p2 block font-semibold">
                  Sewa Vendor
                </span>
                <span className="type-p3 mt-1 block text-muted-foreground">
                  Kirim estimasi ke Finance.
                </span>
              </span>
            </Label>
          </RadioGroup>

          {equipmentSource === "EXTERNAL_VENDOR" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="type-p2 font-medium">Nama Vendor</Label>
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
              </div>
              <div className="space-y-1.5">
                <Label className="type-p2 font-medium">
                  Estimasi Biaya (Rp)
                </Label>
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
              </div>
            </div>
          )}

          {equipmentDecisionError && (
            <p className="type-p2 text-destructive" role="alert">
              {equipmentDecisionError}
            </p>
          )}
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
        title="Pemenuhan Stok Gudang"
        description="Periksa stok barang, tautkan SKU bila perlu, lalu terbitkan DO atau alihkan ke PO."
        className="sm:max-w-4xl"
        footer={(() => {
          const hasPendingPurchaseLink = stockAvailability.some((a) =>
            Boolean(a.pendingPurchaseNumber),
          );
          const hasReady = readyStockItems.length > 0;
          const hasNeedsOrder = needsOrderTicketItemIds.length > 0;
          const isUnchecked = stockAvailability.length === 0;

          const openDirectBuy = () => {
            if (!selectedTicket || selectedStockItems.length === 0) return;
            setFulfillmentMessage("");
            setDoDialogOpen(false);
            setStockAvailability([]);
            setItemSelection({
              ticketId: selectedTicket.id,
              itemIds: selectedStockItems.map((i) => i.id),
            });
            setPurchaseMode("DIRECT_PURCHASE");
            setPoDialogOpen(true);
          };

          const primaryCta = hasReady ? (
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
                : `Terbitkan DO (${readyStockItems.length})`}
            </Button>
          ) : hasNeedsOrder ? (
            <Button
              type="button"
              variant="secondary"
              onClick={openPurchaseOrderForUnavailableItems}
              disabled={fulfillmentPending}
            >
              Buat PO ({needsOrderTicketItemIds.length})
            </Button>
          ) : isUnchecked ? (
            <Button
              type="button"
              variant="secondary"
              onClick={openDirectBuy}
              disabled={fulfillmentPending || selectedStockItems.length === 0}
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              Beli Langsung ({selectedStockItems.length})
            </Button>
          ) : hasPendingPurchaseLink ? (
            <Button asChild type="button" variant="outline">
              <Link href="/apps/logistics?tab=stock">Kelola Stok</Link>
            </Button>
          ) : null;

          const hasSecondaryMenu =
            isUnchecked ||
            (hasReady && hasNeedsOrder) ||
            (hasPendingPurchaseLink && (hasReady || hasNeedsOrder || isUnchecked));

          return (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDoDialogOpen(false)}
                disabled={fulfillmentPending}
              >
                Batal
              </Button>
              {hasSecondaryMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={fulfillmentPending}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                      Opsi
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isUnchecked && (
                      <DropdownMenuItem
                        disabled={fulfillmentPending}
                        onSelect={prepareWarehouseFulfillment}
                      >
                        <RefreshCw className="size-4" aria-hidden="true" />
                        Periksa Ulang
                      </DropdownMenuItem>
                    )}
                    {hasReady && hasNeedsOrder && (
                      <DropdownMenuItem
                        disabled={fulfillmentPending}
                        onSelect={openPurchaseOrderForUnavailableItems}
                      >
                        <ShoppingCart className="size-4" aria-hidden="true" />
                        Buat PO ({needsOrderTicketItemIds.length})
                      </DropdownMenuItem>
                    )}
                    {hasPendingPurchaseLink && (
                      <DropdownMenuItem asChild>
                        <Link href="/apps/logistics?tab=stock">Kelola Stok</Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {primaryCta}
            </>
          );
        })()}
      >
        <div className="space-y-4">
          {(() => {
            const stockCheckItems =
              stockAvailability.length > 0
                ? (selectedTicket?.items.filter((item) =>
                    stockAvailability.some(
                      (availability) => availability.ticketItemId === item.id,
                    ),
                  ) ?? [])
                : selectedStockItems;

            return (
              <>
                <div className="space-y-2 md:hidden">
                  {stockCheckItems.map((item) => {
                    const availability = stockAvailability.find(
                      (entry) => entry.ticketItemId === item.id,
                    );
                    return (
                      <div
                        key={item.id}
                        className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="type-p2 font-semibold text-foreground">
                              {item.itemName}
                            </p>
                            {availability?.stockItemSku && (
                              <p className="type-p3 text-muted-foreground">
                                SKU: {availability.stockItemSku}
                              </p>
                            )}
                          </div>
                          <Badge
                            className="shrink-0"
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
                                  : "Perlu Pesan"
                              : "Menunggu"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <div>
                            <span className="type-p3 text-muted-foreground">
                              Diminta
                            </span>
                            <p className="type-p2 font-semibold tabular-nums">
                              {item.quantity} {item.unit}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="type-p3 text-muted-foreground">
                              Tersedia
                            </span>
                            <p className="type-p2 font-semibold tabular-nums">
                              {availability
                                ? `${availability.availableQuantity} ${item.unit}`
                                : "Belum diperiksa"}
                            </p>
                          </div>
                        </div>

                        {availability?.message && (
                          <p className="type-p3 text-muted-foreground">
                            {availability.message}
                          </p>
                        )}

                        {availability && !availability.pendingPurchaseNumber && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={fulfillmentPending || stockItems.length === 0}
                            onClick={() =>
                              setSkuMapTarget({
                                item,
                                currentStockId: availability.stockItemId,
                              })
                            }
                          >
                            Tautkan SKU
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block">
                  <Table pagination={false}>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="type-p3">Barang</TableHead>
                        <TableHead className="type-p3">Jumlah</TableHead>
                        <TableHead className="type-p3">Tersedia</TableHead>
                        <TableHead className="type-p3">Status &amp; SKU</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockCheckItems.map((item) => (
                        <StockAvailabilityRow
                          key={item.id}
                          item={item}
                          availability={stockAvailability.find(
                            (entry) => entry.ticketItemId === item.id,
                          )}
                          disabled={fulfillmentPending || stockItems.length === 0}
                          onOpenSkuMapper={(targetItem, currentStockId) =>
                            setSkuMapTarget({
                              item: targetItem,
                              currentStockId,
                            })
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}

          {readyStockItems.length > 0 && (
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="type-p2 font-semibold">
                  Mover Pengiriman
                </Label>
                <Select
                  value={selectedMoverId}
                  onValueChange={setSelectedMoverId}
                  disabled={fulfillmentPending || moverOptions.length === 0}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Pilih petugas Mover" />
                  </SelectTrigger>
                  <SelectContent>
                    {moverOptions.map((mover) => (
                      <SelectItem key={mover.id} value={mover.id}>
                        {mover.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {moverOptions.length === 0 && (
                  <p className="type-p3 text-destructive" role="alert">
                    Belum ada Mover aktif.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="type-p2 font-semibold">
                  Kendaraan Operasional
                </Label>
                <Select
                  value={selectedVehicleId}
                  onValueChange={setSelectedVehicleId}
                  disabled={fulfillmentPending || vehicleOptions.length === 0}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Pilih kendaraan" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleOptions.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.plateNumber} · {vehicle.vehicleType}
                        {vehicle.brand ? ` · ${vehicle.brand}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleOptions.length === 0 && (
                  <p className="type-p3 text-destructive" role="alert">
                    Tidak ada kendaraan siap.
                  </p>
                )}
              </div>
            </div>
          )}

          {fulfillmentMessage && (
            <p className="type-p2 text-destructive" role="alert">
              {fulfillmentMessage}
            </p>
          )}
        </div>
      </GlobalModal>

      {/* Hoisted SKU Mapping Modal */}
      {skuMapTarget && (
        <SkuMappingModal
          key={skuMapTarget.item.id}
          target={skuMapTarget}
          stockItems={stockItems}
          pending={fulfillmentPending}
          onClose={() => setSkuMapTarget(null)}
          onConfirm={(ticketItemId, stockItemId) =>
            void mapTicketItemToSku(ticketItemId, stockItemId)
          }
        />
      )}

      {/* Modal Pilih Mode Pengadaan (PO / Pembelian Langsung) */}
      <GlobalModal
        isOpen={poDialogOpen}
        onClose={() => {
          setPoDialogOpen(false);
          setFulfillmentMessage("");
        }}
        title="Pengadaan Barang"
        description="Pilih jalur pengadaan untuk barang yang belum tersedia di gudang."
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
            <Label
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
                <span className="type-p2 block font-semibold">
                  Purchase Order (PO)
                </span>
                <span className="type-p3 mt-1 block text-muted-foreground">
                  Pengadaan resmi melalui PO vendor.
                </span>
              </span>
            </Label>
            <Label
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
                <span className="type-p2 block font-semibold">
                  Pembelian Langsung
                </span>
                <span className="type-p3 mt-1 block text-muted-foreground">
                  Pembelian langsung ke toko tanpa PO.
                </span>
              </span>
            </Label>
          </RadioGroup>

          {selectedTicket &&
          selectedTicketItems.length > 0 &&
          purchaseMode === "PURCHASE_ORDER" ? (
            <CreatePOForm
              key={`${selectedTicket.id}:${selectedTicketItems.map((item) => item.id).join(",")}`}
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
              key={`direct:${selectedTicket.id}:${selectedTicketItems.map((item) => item.id).join(",")}`}
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
            <p className="type-p2 text-destructive" role="alert">
              Tidak ada barang yang perlu dipesan.
            </p>
          )}
        </div>
      </GlobalModal>

      {/* Modal Pratinjau Bukti Dokumen */}
      <GlobalModal
        isOpen={selectedReceipt !== null}
        onClose={closeReceiptPreview}
        title={selectedReceipt?.label ?? "Pratinjau Dokumen"}
        description="Pratinjau dokumen atau foto bukti."
        className="max-w-4xl"
        footer={
          selectedReceipt ? (
            <>
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
                  <Download className="size-4" aria-hidden="true" />
                  {photoDownloadLabel(selectedReceipt.url).replace(
                    "foto",
                    "bukti",
                  )}
                </a>
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedReceipt && (
          <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
            {/\.(jpe?g|png|webp)$/i.test(
              selectedReceipt.url.split(/[?#]/, 1)[0],
            ) && receiptPreviewError ? (
              <p className="type-p2 p-8 text-muted-foreground" role="status">
                Foto tidak dapat dimuat.
              </p>
            ) : /\.(jpe?g|png|webp)$/i.test(
                selectedReceipt.url.split(/[?#]/, 1)[0],
              ) ? (
              // eslint-disable-next-line @next/next/no-img-element
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
                <FileText className="size-12 text-muted-foreground" aria-hidden="true" />
                <p className="type-p2 text-muted-foreground">
                  Pratinjau tidak tersedia. Unduh melalui tombol di bawah.
                </p>
              </div>
            )}
          </div>
        )}
      </GlobalModal>

      {/* Hoisted Workflow Action Modals */}
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
            key={`logistics-${workflowTicket.id}`}
            open={workflowFor(role, workflowTicket) === "LOGISTICS"}
            ticket={workflowTicket}
            vendors={vendors}
            stockItems={stockItems}
            vehicles={vehicles}
            onOpenChange={(open) => {
              if (!open) setWorkflowTicket(null);
            }}
            onOpenContractDo={() => {
              const target = workflowTicket;
              setWorkflowTicket(null);
              if (target) setContractDoModalTicket(target);
            }}
            onSuccess={() => {
              setWorkflowTicket(null);
              router.refresh();
            }}
          />
          <FinanceActionModal
            key={`finance-${workflowTicket.id}`}
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
            key={`mover-${workflowTicket.id}`}
            open={workflowFor(role, workflowTicket) === "MOVER"}
            ticketId={workflowTicket.id}
            deliveryOrders={workflowTicket.deliveryOrders}
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

      {/* Hoisted Material Contract DO Modal */}
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
                router.refresh();
              }}
            />
          );
        })()}

      <MaterialDeliveryPrintModal
        deliveries={contractSjPreview?.deliveries ?? []}
        initialDeliveryId={contractSjPreview?.initialDeliveryId}
        onClose={() => setContractSjPreview(null)}
      />

      <MaterialDeliveryAttachModal
        delivery={contractSjAttachTarget}
        onClose={() => setContractSjAttachTarget(null)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
