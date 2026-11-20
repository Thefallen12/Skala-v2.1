"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileUp,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import CardBox from "@/app/components/shared/CardBox";
import TicketListing from "@/app/components/apps/tickets/TicketListing";
import type { VehicleSummary } from "@/app/actions/vehicles";
import type {
  ContractTicketDeliveryOption,
  MaterialContractRow,
  TicketMaterialContractOption,
} from "@/lib/material-contracts";
import CreateTicketModal from "@/app/components/apps/tickets/CreateTicketModal";
import CreatePurchaseModal from "@/app/components/forms/CreatePurchaseModal";
import type { VendorBankAccountOption } from "@/lib/vendor-bank-accounts";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import { TicketRequestCategory, TicketStatus } from "@prisma/client";
import { getCountableTickets } from "./ticket-statistics";
import { MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS } from "@/lib/direct-stock-purchase-photo-config";
import { getJakartaDateKey, shiftDateKey } from "@/lib/habit-date";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { compressFieldImageFile } from "@/lib/image-compression-client";
import {
  deleteLogisticsStockItem,
  importLogisticsStockCsv,
  receiveDirectStockPurchase,
  replaceDirectStockPurchaseInvoice,
  saveLogisticsStockItem,
  submitDirectStockPurchaseInvoice,
} from "@/app/actions/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePaginationControls,
  TableRow,
} from "@/components/ui/table";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import {
  parseClientAssetCode,
  photoDownloadHref,
  photoDownloadLabel,
  photoDownloadLinkProps,
  withLocalPhotoPreview,
} from "@/lib/photo-urls";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const statusLabels: Record<TicketRow["status"], string> = {
  [TicketStatus.DRAFT]: "Draf",
  [TicketStatus.PENDING_DIRECTOR]: "Menunggu Direktur",
  PENDING_LOGISTIK: "Menunggu Logistik",
  [TicketStatus.APPROVED_DIR]: "Disetujui Direktur",
  [TicketStatus.PROCESSED_FINANCE]: "Diproses Finance",
  [TicketStatus.PROCESSED_LOGISTIC]: "Diproses Logistik",
  [TicketStatus.ASSIGNED_TO_MOVER]: "Ditugaskan ke Mover",
  [TicketStatus.IN_TRANSIT]: "Dalam Perjalanan",
  [TicketStatus.WAITING_FINANCE_PAYMENT]: "Menunggu Finance",
  [TicketStatus.COMPLETED]: "Selesai",
  [TicketStatus.REJECTED]: "Ditolak",
};

const statusColors: Record<TicketRow["status"], string> = {
  [TicketStatus.DRAFT]: "var(--color-muted-foreground)",
  [TicketStatus.PENDING_DIRECTOR]: "var(--color-warning)",
  PENDING_LOGISTIK: "var(--color-warning)",
  [TicketStatus.APPROVED_DIR]: "var(--color-success)",
  [TicketStatus.PROCESSED_FINANCE]: "var(--color-info)",
  [TicketStatus.PROCESSED_LOGISTIC]: "var(--color-primary)",
  [TicketStatus.ASSIGNED_TO_MOVER]: "var(--color-secondary)",
  [TicketStatus.IN_TRANSIT]: "var(--color-info)",
  [TicketStatus.WAITING_FINANCE_PAYMENT]: "var(--color-warning)",
  [TicketStatus.COMPLETED]: "var(--color-success)",
  [TicketStatus.REJECTED]: "var(--color-error)",
};

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const periods = [
  { days: 7, label: "7H" },
  { days: 30, label: "30H" },
  { days: 90, label: "90H" },
] as const;

const dateLabel = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
});

const stockDateLabel = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

type LogisticsStockItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  stockQuantity: string;
  minimumStock: string;
  unitPrice: string;
  createdAt: string;
};

type DirectStockPurchaseRow = {
  id: string;
  purchaseNumber: string;
  vendorName: string;
  status: "PENDING_RECEIPT" | "RECEIVED";
  isApprovedByDirector: boolean;
  totalAmount: string;
  hasFinanceProof: boolean;
  createdAt: string;
  receivedAt: string | null;
  arrivalPhotoUrl: string | null;
  receivedPhotos: string[];
  vendorInvoiceUrl: string | null;
  vendorInvoiceUploadedAt: string | null;
  vendorInvoiceUploadedBy: { name: string | null } | null;
  items: { id: string; itemName: string; quantity: string; unit: string }[];
  receivedBy: { name: string | null } | null;
  ticket: { id: string; ticketNumber: string; title: string } | null;
};

type PurchaseTicketOption = {
  id: string;
  ticketNumber: string;
  title: string;
  items?: {
    ticketItemId: string;
    stockItemId?: string | null;
    itemName: string;
    quantity: number;
    unit: string;
    estimatedCost?: string | null;
  }[];
};

type LogisticsVendor = {
  id: string;
  name: string;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts: VendorBankAccountOption[];
};

function getDirectPurchaseStatusLabel(purchase: DirectStockPurchaseRow): string {
  if (purchase.status === "RECEIVED") return "Diterima";
  if (!purchase.isApprovedByDirector) return "Menunggu Direktur";
  if (!purchase.vendorInvoiceUrl) return "Menunggu Nota";
  if (!purchase.hasFinanceProof) return "Menunggu Finance";
  return "Siap Diterima";
}

function canUploadDirectPurchaseInvoice(
  purchase: DirectStockPurchaseRow,
): boolean {
  return (
    !purchase.vendorInvoiceUrl &&
    purchase.isApprovedByDirector &&
    purchase.status === "PENDING_RECEIPT"
  );
}

function canReplaceDirectPurchaseInvoice(
  purchase: DirectStockPurchaseRow,
): boolean {
  return Boolean(purchase.vendorInvoiceUrl) && purchase.isApprovedByDirector;
}

function canReceiveDirectPurchase(
  purchase: DirectStockPurchaseRow,
  canCreatePurchaseOrder: boolean,
): boolean {
  return (
    canCreatePurchaseOrder &&
    purchase.status === "PENDING_RECEIPT" &&
    purchase.isApprovedByDirector &&
    purchase.hasFinanceProof
  );
}

function StockItemMobileCard({
  item,
  canManage,
  onEdit,
  onDetail,
  onDuplicate,
  onDelete,
}: {
  item: LogisticsStockItem;
  canManage: boolean;
  onEdit: (item: LogisticsStockItem) => void;
  onDetail: (item: LogisticsStockItem) => void;
  onDuplicate: (item: LogisticsStockItem) => void;
  onDelete: (item: LogisticsStockItem) => void;
}) {
  const quantity = Number(item.stockQuantity);
  const minimum = Number(item.minimumStock);
  const isOutOfStock = quantity <= 0;
  const isLowStock = !isOutOfStock && quantity <= minimum;

  return (
    <div className="space-y-2.5 rounded-xl border border-border/80 bg-card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 rounded-md border border-border bg-muted p-2 text-muted-foreground">
            <Boxes className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="type-p1 truncate font-semibold text-foreground">
              {item.name}
            </p>
            <p className="type-p3 text-muted-foreground">SKU: {item.sku}</p>
          </div>
        </div>
        <Badge
          variant={
            isOutOfStock
              ? "lightError"
              : isLowStock
                ? "lightWarning"
                : "lightSuccess"
          }
          className="shrink-0"
        >
          {isOutOfStock ? "Habis" : isLowStock ? "Menipis" : "Aman"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5">
        <div>
          <span className="type-p3 text-muted-foreground">Stok</span>
          <p className="type-p2 font-semibold text-foreground">
            {new Intl.NumberFormat("id-ID").format(quantity)} {item.unit}
          </p>
        </div>
        <div>
          <span className="type-p3 text-muted-foreground">Harga</span>
          <p className="type-p2 font-semibold tabular-nums text-foreground">
            {currency.format(Number(item.unitPrice))}
          </p>
        </div>
        <div>
          <span className="type-p3 text-muted-foreground">Nilai</span>
          <p className="type-p2 font-semibold tabular-nums text-foreground">
            {currency.format(quantity * Number(item.unitPrice))}
          </p>
        </div>
      </div>

      {canManage && (
        <div className="flex items-center gap-1.5 border-t border-border/60 pt-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onDetail(item)}
          >
            <Eye className="size-3.5" aria-hidden="true" />
            Detail
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={`Menu aksi ${item.name}`}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(item)}>
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDuplicate(item)}>
                <Copy className="size-4" aria-hidden="true" />
                Duplikat
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(item)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Hapus
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function DirectPurchaseMobileCard({
  purchase,
  canManage,
  canReplaceInvoice,
  onOpenInvoiceModal,
  onOpenReplaceInvoiceModal,
  onOpenDetailModal,
  onOpenReceiveModal,
}: {
  purchase: DirectStockPurchaseRow;
  canManage: boolean;
  canReplaceInvoice: boolean;
  onOpenInvoiceModal: (purchase: DirectStockPurchaseRow) => void;
  onOpenReplaceInvoiceModal: (purchase: DirectStockPurchaseRow) => void;
  onOpenDetailModal: (purchase: DirectStockPurchaseRow) => void;
  onOpenReceiveModal: (purchase: DirectStockPurchaseRow) => void;
}) {
  const itemNamesSummary = purchase.items
    .map((item) => item.itemName)
    .join(", ");
  const itemQtySummary = purchase.items
    .map((item) => `${item.quantity} ${item.unit}`)
    .join(" · ");
  const needsInvoice =
    canManage && canUploadDirectPurchaseInvoice(purchase);
  const canReplace =
    canReplaceInvoice && canReplaceDirectPurchaseInvoice(purchase);
  const readyToReceive = canReceiveDirectPurchase(purchase, canManage);
  const primaryIsDetail = !needsInvoice && !readyToReceive;
  const hasMenu = !primaryIsDetail || canReplace;

  return (
    <div className="space-y-2 rounded-xl border border-border/80 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="type-p2 font-mono font-bold text-primary">
            {purchase.purchaseNumber}
          </p>
          <p className="type-p3 text-muted-foreground">
            {purchase.vendorName} ·{" "}
            {stockDateLabel.format(new Date(purchase.createdAt))}
          </p>
          {purchase.ticket && (
            <Badge variant="outline" className="mt-1">
              {purchase.ticket.ticketNumber}
            </Badge>
          )}
        </div>
        <Badge
          variant={
            purchase.status === "RECEIVED" ? "lightSuccess" : "lightWarning"
          }
          className="shrink-0"
        >
          {getDirectPurchaseStatusLabel(purchase)}
        </Badge>
      </div>

      <div>
        <p className="type-p2 font-medium text-foreground">
          {itemNamesSummary}
        </p>
        <p className="type-p3 text-muted-foreground">{itemQtySummary}</p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <span className="type-p1 shrink-0 font-mono font-bold tabular-nums text-foreground">
          {currency.format(Number(purchase.totalAmount))}
        </span>
        <div className="flex items-center gap-1.5">
          {needsInvoice ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenInvoiceModal(purchase)}
            >
              <Upload className="size-3.5" aria-hidden="true" />
              Unggah Nota
            </Button>
          ) : readyToReceive ? (
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenReceiveModal(purchase)}
            >
              <PackageOpen className="size-3.5" aria-hidden="true" />
              Terima
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenDetailModal(purchase)}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              Detail
            </Button>
          )}
          {hasMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={`Menu aksi ${purchase.purchaseNumber}`}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!primaryIsDetail && (
                  <DropdownMenuItem onSelect={() => onOpenDetailModal(purchase)}>
                    <Eye className="size-4" aria-hidden="true" />
                    Detail
                  </DropdownMenuItem>
                )}
                {canReplace && (
                  <DropdownMenuItem
                    onSelect={() => onOpenReplaceInvoiceModal(purchase)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    Ganti Foto/Bon
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LogisticsWorkspace({
  tickets,
  projects,
  role,
  vendors = [],
  vehicles = [],
  mode = "logistics",
  stockItems = [],
  stockPurchases = [],
  purchaseTickets = [],
  materialContracts = [],
  materialDeliveryContracts = [],
  contractTickets = [],
  initialAction,
  initialOpenSheet,
}: {
  tickets: TicketRow[];
  projects: TicketProjectOption[];
  role: TicketPageRole;
  vendors?: LogisticsVendor[];
  vehicles?: VehicleSummary[];
  mode?: "logistics" | "stock";
  stockItems?: LogisticsStockItem[];
  stockPurchases?: DirectStockPurchaseRow[];
  purchaseTickets?: PurchaseTicketOption[];
  materialContracts?: TicketMaterialContractOption[];
  materialDeliveryContracts?: MaterialContractRow[];
  contractTickets?: ContractTicketDeliveryOption[];
  initialAction?: "ticket" | "stock-purchase";
  initialOpenSheet?: string;
}) {
  const [period, setPeriod] = useState<(typeof periods)[number]["days"]>(30);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(Boolean(initialAction));
  const [mobileChartsOpen, setMobileChartsOpen] = useState(false);

  // Hoisted Single Action Controllers for Direct Purchases & Stock
  const [directPurchaseModal, setDirectPurchaseModal] = useState<{
    purchase: DirectStockPurchaseRow;
    mode: "invoice" | "replace-invoice" | "detail";
  } | null>(null);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [invoiceDocKind, setInvoiceDocKind] = useState<"INV" | "BON">("INV");
  const [isInvoicePreparing, setIsInvoicePreparing] = useState(false);
  const [isInvoicePending, startInvoiceTransition] = useTransition();

  const [receivingPurchase, setReceivingPurchase] =
    useState<DirectStockPurchaseRow | null>(null);
  const [receivingPurchaseSubmitting, setReceivingPurchaseSubmitting] =
    useState(false);
  const [receivingFiles, setReceivingFiles] = useState<File[]>([]);

  const [stockReceiptPreview, setStockReceiptPreview] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const [stockReceiptPreviewFailed, setStockReceiptPreviewFailed] =
    useState(false);

  const [stockQuery, setStockQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [stockPage, setStockPage] = useState(1);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFiles, setCsvFiles] = useState<File[]>([]);
  const [stockImporting, setStockImporting] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockSubmitting, setStockSubmitting] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockDetail, setStockDetail] = useState<LogisticsStockItem | null>(
    null,
  );
  const [stockDeleteTarget, setStockDeleteTarget] =
    useState<LogisticsStockItem | null>(null);
  const [stockDeleteSubmitting, setStockDeleteSubmitting] = useState(false);

  const [stockDraft, setStockDraft] = useState({
    sku: "",
    name: "",
    unit: "pcs",
    stockQuantity: "0",
    minimumStock: "0",
    unitPrice: "0",
  });
  const router = useRouter();
  const today = getJakartaDateKey();
  const startDate = shiftDateKey(today, 1 - period);

  const periodTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        const dateKey = getJakartaDateKey(new Date(ticket.createdAt));
        return (
          ticket.id === initialOpenSheet ||
          (dateKey >= startDate && dateKey <= today)
        );
      }),
    [initialOpenSheet, startDate, tickets, today],
  );

  const visibleTickets = useMemo(
    () =>
      periodTickets
        .filter(
          (ticket) =>
            ticket.id === initialOpenSheet ||
            ((statusFilter === "ALL" ||
              (statusFilter === "PENDING_LOGISTICS" &&
                (ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
                  ticket.status === TicketStatus.PROCESSED_FINANCE)) ||
              (statusFilter === "IN_DELIVERY" &&
                (ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
                  ticket.status === TicketStatus.IN_TRANSIT)) ||
              ticket.status === statusFilter) &&
              (!search.trim() ||
                `${ticket.ticketNumber} ${ticket.title} ${ticket.requester.name} ${
                  ticket.project?.title ?? ""
                } ${ticket.items.map((item) => item.itemName).join(" ")}`
                  .toLocaleLowerCase("id-ID")
                  .includes(search.trim().toLocaleLowerCase("id-ID")))),
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [initialOpenSheet, periodTickets, search, statusFilter],
  );

  const trend = useMemo(() => {
    const days = Array.from({ length: period }, (_, index) =>
      shiftDateKey(startDate, index),
    );
    const orders = days.map(() => 0);
    const amounts = days.map(() => 0);
    const dayIndex = new Map(days.map((day, index) => [day, index]));
    for (const ticket of periodTickets) {
      if (ticket.status === TicketStatus.REJECTED) continue;
      const index = dayIndex.get(getJakartaDateKey(new Date(ticket.createdAt)));
      if (index === undefined) continue;
      orders[index] += 1;
      amounts[index] += Number(ticket.totalAmount ?? 0);
    }
    return {
      labels: days.map((day) =>
        dateLabel.format(new Date(`${day}T12:00:00+07:00`)),
      ),
      orders,
      amounts,
    };
  }, [period, periodTickets, startDate]);

  const countableTickets = useMemo(
    () => getCountableTickets(tickets),
    [tickets],
  );
  const statusCounts = useMemo(
    () =>
      Object.values(TicketStatus)
        .map((status) => ({
          status,
          count: countableTickets.filter((ticket) => ticket.status === status)
            .length,
        }))
        .filter((entry) => entry.count > 0),
    [countableTickets],
  );

  const pendingCount = tickets.filter(
    (ticket) =>
      ticket.status === TicketStatus.PROCESSED_LOGISTIC ||
      ticket.status === TicketStatus.PROCESSED_FINANCE,
  ).length;
  const deliveryCount = tickets.filter(
    (ticket) =>
      ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      ticket.status === TicketStatus.IN_TRANSIT,
  ).length;
  const totalValue = tickets.reduce(
    (sum, ticket) =>
      ticket.status === TicketStatus.REJECTED
        ? sum
        : sum + Number(ticket.totalAmount ?? 0),
    0,
  );

  const chartOptions = {
    chart: {
      type: "area" as const,
      toolbar: { show: false },
      fontFamily: "inherit",
      foreColor: "#7C8FAC",
      zoom: { enabled: false },
    },
    colors: ["var(--color-primary)", "var(--color-info)"],
    dataLabels: { enabled: false },
    stroke: { curve: "smooth" as const, width: [3, 3] },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.24, opacityTo: 0.02, stops: [0, 95] },
    },
    grid: { borderColor: "rgba(124,143,172,0.18)", strokeDashArray: 3 },
    xaxis: {
      categories: trend.labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickAmount: Math.min(period, 10),
    },
    yaxis: [
      {
        title: { text: "Jumlah pesanan" },
        min: 0,
        forceNiceScale: true,
        labels: { formatter: (value: number) => `${Math.round(value)}` },
      },
      {
        opposite: true,
        title: { text: "Nilai (Rp)" },
        min: 0,
        forceNiceScale: true,
        labels: {
          formatter: (value: number) =>
            new Intl.NumberFormat("id-ID", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(value),
        },
      },
    ],
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        { formatter: (value: number) => `${value} pesanan` },
        { formatter: (value: number) => currency.format(value) },
      ],
    },
    legend: { show: false },
  };

  const statusChartOptions = {
    chart: { type: "donut" as const, fontFamily: "inherit" },
    labels: statusCounts.map(({ status }) => statusLabels[status]),
    colors: statusCounts.map(({ status }) => statusColors[status]),
    dataLabels: { enabled: false },
    legend: { show: false },
    stroke: { colors: ["var(--color-card)"] },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            name: { show: true },
            value: {
              show: true,
              formatter: (value: string) => `${value} pesanan`,
            },
            total: {
              show: true,
              label: "Total",
              formatter: () => `${countableTickets.length}`,
            },
          },
        },
      },
    },
    tooltip: { y: { formatter: (value: number) => `${value} pesanan` } },
  };

  const exportCsv = () => {
    const headers = [
      "Nomor tiket",
      "Pesanan material",
      "Pemohon",
      "Proyek",
      "Status",
      "Jumlah",
      "Nilai estimasi",
      "Tanggal",
    ];
    const rows = visibleTickets.map((ticket) => [
      ticket.ticketNumber,
      ticket.title,
      ticket.requester.name,
      ticket.project
        ? `${ticket.project.kelompokTani} - ${ticket.project.title}`
        : "",
      statusLabels[ticket.status],
      ticket.items
        .map((item) => `${item.itemName}: ${item.quantity} ${item.unit}`)
        .join("; "),
      ticket.totalAmount ?? "",
      getJakartaDateKey(new Date(ticket.createdAt)),
    ]);
    const escape = (value: string) => {
      const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [headers, ...rows]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-logistik-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const stats = [
    {
      label: "Total Pesanan",
      value: countableTickets.length,
      note: "Klik untuk melihat seluruh tiket",
      filter: "ALL",
      Icon: ClipboardList,
      color: "text-primary",
      background: "bg-lightprimary",
    },
    {
      label: "Menunggu Logistik",
      value: pendingCount,
      note: "Klik untuk melihat tiket pending",
      filter: "PENDING_LOGISTICS",
      Icon: PackageOpen,
      color: "text-warning",
      background: "bg-lightwarning",
    },
    {
      label: "Dalam Pengiriman",
      value: deliveryCount,
      note: "Klik untuk tiket dalam kirim",
      filter: "IN_DELIVERY",
      Icon: Truck,
      color: "text-info",
      background: "bg-lightinfo",
    },
    {
      label: "Total Nilai",
      value: currency.format(totalValue),
      note: "Akumulasi pesanan aktif",
      filter: "ALL",
      Icon: CircleDollarSign,
      color: "text-success",
      background: "bg-lightsuccess",
    },
  ];

  const handleReplaceInvoiceFilesChange = async (files: File[]) => {
    const rawFile = files[0];
    if (!rawFile) {
      setInvoiceFiles([]);
      return;
    }
    setIsInvoicePreparing(true);
    try {
      const prepared = await compressFieldImageFile(rawFile, {
        allowPdfPassthrough: true,
      });
      setInvoiceFiles([prepared]);
    } catch (error) {
      setInvoiceFiles([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Berkas invoice/bon tidak dapat diproses.",
      );
    } finally {
      setIsInvoicePreparing(false);
    }
  };

  const handleUploadDirectPurchaseInvoice = (event: FormEvent) => {
    event.preventDefault();
    if (!directPurchaseModal || isInvoicePreparing) return;
    const file = invoiceFiles[0];
    if (!file) {
      toast.error("Pilih berkas nota/invoice terlebih dahulu.");
      return;
    }
    const purchaseId = directPurchaseModal.purchase.id;
    const isReplacing = directPurchaseModal.mode === "replace-invoice";
    startInvoiceTransition(async () => {
      try {
        const prepared = await compressFieldImageFile(file, {
          allowPdfPassthrough: true,
        });
        const formData = new FormData();
        formData.set("purchaseId", purchaseId);
        formData.set("docKind", invoiceDocKind);
        formData.set("invoicePhoto", prepared, prepared.name);
        const result = isReplacing
          ? await replaceDirectStockPurchaseInvoice(formData)
          : await submitDirectStockPurchaseInvoice(formData);
        if (result.success) {
          toast.success(result.message);
          setInvoiceFiles([]);
          setDirectPurchaseModal(null);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Saving direct purchase invoice failed:", error);
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "Invoice/bon gagal disimpan. Coba kembali.",
        );
      }
    });
  };

  const submitStockPurchaseReceipt = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!receivingPurchase) return;
    if (receivingFiles.length === 0) {
      toast.error("Pilih minimal 1 foto bukti penerimaan barang.");
      return;
    }
    const formData = new FormData();
    formData.set("purchaseId", receivingPurchase.id);
    setReceivingPurchaseSubmitting(true);
    try {
      for (const file of receivingFiles) {
        const compressed = await compressFieldImageFile(file);
        formData.append("receivedPhotos", compressed, compressed.name);
      }
      const result = await receiveDirectStockPurchase(formData);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setReceivingPurchase(null);
      setReceivingFiles([]);
      requestNotificationFeedRefresh();
      router.refresh();
    } catch (error) {
      console.error("Receiving direct stock purchase failed:", error);
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Penerimaan barang gagal dicatat.",
      );
    } finally {
      setReceivingPurchaseSubmitting(false);
    }
  };

  if (mode === "stock") {
    const canCreatePurchaseOrder =
      role === "LOGISTICS" ||
      role === "ADMINISTRATIONS" ||
      role === "DIRECTOR" ||
      role === "DEPUTY_DIRECTOR";
    const canReplacePurchaseInvoice =
      canCreatePurchaseOrder || role === "FINANCE";
    const lowStockCount = stockItems.filter(
      (item) => Number(item.stockQuantity) <= Number(item.minimumStock),
    ).length;
    const outOfStockCount = stockItems.filter(
      (item) => Number(item.stockQuantity) <= 0,
    ).length;
    const availableStockCount = stockItems.length - outOfStockCount;
    const totalInventoryValue = stockItems.reduce(
      (total, item) =>
        total + Number(item.stockQuantity) * Number(item.unitPrice),
      0,
    );
    const stockGroups = [
      {
        label: "Stok Aman",
        count: stockItems.filter(
          (item) => Number(item.stockQuantity) > Number(item.minimumStock),
        ).length,
        color: "var(--color-success)",
      },
      {
        label: "Stok Menipis",
        count: stockItems.filter(
          (item) =>
            Number(item.stockQuantity) > 0 &&
            Number(item.stockQuantity) <= Number(item.minimumStock),
        ).length,
        color: "var(--color-warning)",
      },
      {
        label: "Habis",
        count: outOfStockCount,
        color: "var(--color-error)",
      },
    ];
    const visibleStockItems = stockItems.filter((item) => {
      const query = stockQuery.trim().toLocaleLowerCase("id-ID");
      const matchesSearch =
        !query ||
        `${item.name} ${item.sku} ${item.unit}`
          .toLocaleLowerCase("id-ID")
          .includes(query);
      const quantity = Number(item.stockQuantity);
      const minimum = Number(item.minimumStock);
      const matchesFilter =
        stockFilter === "ALL" ||
        (stockFilter === "LOW" && quantity > 0 && quantity <= minimum) ||
        (stockFilter === "EMPTY" && quantity <= 0) ||
        (stockFilter === "AVAILABLE" && quantity > minimum);
      return matchesSearch && matchesFilter;
    });
    const stockPageSize = 5;
    const stockPageCount = Math.max(
      1,
      Math.ceil(visibleStockItems.length / stockPageSize),
    );
    const currentStockPage = Math.min(stockPage, stockPageCount);
    const paginatedStockItems = visibleStockItems.slice(
      (currentStockPage - 1) * stockPageSize,
      currentStockPage * stockPageSize,
    );

    const stockChartOptions = {
      chart: {
        type: "bar" as const,
        toolbar: { show: false },
        fontFamily: "inherit",
        foreColor: "#7C8FAC",
      },
      colors: ["var(--color-primary)", "var(--color-warning)"],
      plotOptions: { bar: { borderRadius: 4, columnWidth: "48%" } },
      dataLabels: { enabled: false },
      grid: { borderColor: "rgba(124,143,172,0.18)", strokeDashArray: 3 },
      xaxis: {
        categories: stockItems.map((item) => item.name),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { rotate: -20, trim: true },
      },
      yaxis: { min: 0, forceNiceScale: true },
      legend: { position: "top" as const },
      tooltip: {
        y: {
          formatter: (value: number) =>
            new Intl.NumberFormat("id-ID").format(value),
        },
      },
    };

    const stockDistributionOptions = {
      chart: { type: "donut" as const, fontFamily: "inherit" },
      labels: stockGroups.map((group) => group.label),
      colors: stockGroups.map((group) => group.color),
      dataLabels: { enabled: false },
      legend: { show: false },
      stroke: { colors: ["var(--color-card)"] },
      plotOptions: {
        pie: {
          donut: {
            size: "70%",
            labels: {
              show: true,
              name: { show: true },
              value: {
                show: true,
                formatter: (value: string) => `${value} barang`,
              },
              total: {
                show: true,
                label: "Jenis Barang",
                formatter: () => `${stockItems.length}`,
              },
            },
          },
        },
      },
      tooltip: { y: { formatter: (value: number) => `${value} barang` } },
    };

    const openStockEditor = (item?: LogisticsStockItem) => {
      setEditingStockId(item?.id ?? null);
      setStockDraft(
        item
          ? {
              sku: item.sku,
              name: item.name,
              unit: item.unit,
              stockQuantity: item.stockQuantity,
              minimumStock: item.minimumStock,
              unitPrice: item.unitPrice,
            }
          : {
              sku: "",
              name: "",
              unit: "pcs",
              stockQuantity: "0",
              minimumStock: "0",
              unitPrice: "0",
            },
      );
      setStockDialogOpen(true);
    };

    const saveStockItem = async () => {
      setStockSubmitting(true);
      try {
        const result = await saveLogisticsStockItem({
          ...stockDraft,
          ...(editingStockId ? { id: editingStockId } : {}),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setStockDialogOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Saving logistics stock item failed:", error);
        toast.error("Barang gagal disimpan. Periksa koneksi lalu coba kembali.");
      } finally {
        setStockSubmitting(false);
      }
    };

    const handleImportStockCsv = async () => {
      const file = csvFiles[0];
      if (!file) {
        toast.error("Pilih berkas CSV terlebih dahulu.");
        return;
      }
      if (file.size > 1_000_000) {
        toast.error("File CSV tidak boleh melebihi 1 MB.");
        return;
      }
      setStockImporting(true);
      try {
        const result = await importLogisticsStockCsv(await file.text());
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setCsvFiles([]);
        setCsvModalOpen(false);
        setStockPage(1);
        router.refresh();
      } catch (error) {
        console.error("Importing logistics stock CSV failed:", error);
        toast.error("Impor CSV gagal. Periksa file lalu coba kembali.");
      } finally {
        setStockImporting(false);
      }
    };

    const duplicateStockItem = async (item: LogisticsStockItem) => {
      const suffix = `-COPY-${Date.now().toString(36).toUpperCase()}`;
      try {
        const result = await saveLogisticsStockItem({
          sku: `${item.sku.slice(0, 64 - suffix.length)}${suffix}`,
          name: `${item.name} (Salinan)`.slice(0, 120),
          unit: item.unit,
          stockQuantity: item.stockQuantity,
          minimumStock: item.minimumStock,
          unitPrice: item.unitPrice,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Duplicating logistics stock item failed:", error);
        toast.error("Barang gagal diduplikat. Silakan coba kembali.");
      }
    };

    const confirmDeleteStockItem = async () => {
      if (!stockDeleteTarget) return;
      setStockDeleteSubmitting(true);
      try {
        const result = await deleteLogisticsStockItem(stockDeleteTarget.id);
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setStockDeleteTarget(null);
        router.refresh();
      } catch (error) {
        console.error("Deleting logistics stock item failed:", error);
        toast.error("Barang gagal dihapus. Periksa koneksi lalu coba kembali.");
      } finally {
        setStockDeleteSubmitting(false);
      }
    };

    const exportStockCsv = () => {
      const headers = [
        "SKU",
        "Nama Barang",
        "Satuan",
        "Stok",
        "Batas Minimum",
        "Harga Satuan",
        "Kategori",
        "Tanggal Dibuat",
        "Nilai Persediaan",
      ];
      const rows = visibleStockItems.map((item) => [
        item.sku,
        item.name,
        item.unit,
        item.stockQuantity,
        item.minimumStock,
        item.unitPrice,
        "Material",
        stockDateLabel.format(new Date(item.createdAt)),
        String(Number(item.stockQuantity) * Number(item.unitPrice)),
      ]);
      const escape = (value: string) => {
        const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const csv = [headers, ...rows]
        .map((row) => row.map(escape).join(","))
        .join("\r\n");
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `stok-logistik-${today}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="my-2 space-y-4 sm:my-4 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="type-h2 text-foreground">Katalog &amp; Stok Gudang</h2>
            <p className="type-p3 mt-0.5 text-muted-foreground sm:type-p2 sm:mt-1">
              {canCreatePurchaseOrder
                ? "Kelola katalog material, pantau ketersediaan, dan catat pembelian langsung."
                : "Pantau persediaan material dan status pemenuhannya."}
            </p>
          </div>
          <div>
            <div className="flex w-full items-center gap-2 sm:hidden">
              {canCreatePurchaseOrder ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPurchaseOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Pembelian
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label="Menu katalog stok"
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openStockEditor()}>
                        <Plus className="size-4" aria-hidden="true" />
                        Tambah Barang
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setCsvFiles([]);
                          setCsvModalOpen(true);
                        }}
                      >
                        <FileUp className="size-4" aria-hidden="true" />
                        Import CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={exportStockCsv}>
                        <Download className="size-4" aria-hidden="true" />
                        Export CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={exportStockCsv}
                >
                  <Download className="size-4" aria-hidden="true" />
                  Export
                </Button>
              )}
            </div>

            <div className="hidden flex-wrap gap-2 sm:flex">
              {canCreatePurchaseOrder && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCsvFiles([]);
                    setCsvModalOpen(true);
                  }}
                >
                  <FileUp className="size-4" aria-hidden="true" />
                  Import CSV
                </Button>
              )}
              {canCreatePurchaseOrder && (
                <Button
                  type="button"
                  onClick={() => setPurchaseOpen(true)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Pembelian
                </Button>
              )}
              <Button type="button" variant="outline" onClick={exportStockCsv}>
                <Download className="size-4" aria-hidden="true" />
                Export
              </Button>
              {canCreatePurchaseOrder && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openStockEditor()}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Barang
                </Button>
              )}
            </div>

            {canCreatePurchaseOrder && (
              <CreatePurchaseModal
                open={purchaseOpen}
                onOpenChange={setPurchaseOpen}
                initialType={
                  initialAction === "ticket"
                    ? "PURCHASE_ORDER"
                    : "DIRECT_PURCHASE"
                }
                vendors={vendors}
                stockItems={stockItems}
                tickets={purchaseTickets}
                onCreated={(message) => {
                  toast.success(message);
                  setPurchaseOpen(false);
                }}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {[
            {
              label: "Total Barang",
              value: stockItems.length,
              note: "SKU material terdaftar",
              Icon: Boxes,
              background: "bg-lightprimary",
              color: "text-primary",
            },
            {
              label: "Stok Tersedia",
              value: availableStockCount,
              note: "Barang dengan stok di atas nol",
              Icon: PackageOpen,
              background: "bg-lightsuccess",
              color: "text-success",
            },
            {
              label: "Stok Menipis",
              value: lowStockCount,
              note: "Menyentuh batas minimum",
              Icon: AlertTriangle,
              background: "bg-lightwarning",
              color: "text-warning",
            },
            {
              label: "Nilai Persediaan",
              value: currency.format(totalInventoryValue),
              note: "Estimasi nilai stok saat ini",
              Icon: CircleDollarSign,
              background: "bg-lightinfo",
              color: "text-info",
            },
          ].map(({ label, value, note, Icon, background, color }) => (
            <CardBox key={label} className="p-3 sm:p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="type-p3 truncate font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p
                    className="type-kpi mt-1 truncate"
                    title={String(value)}
                  >
                    {value}
                  </p>
                  <p className="type-p3 mt-1 hidden text-muted-foreground sm:block">
                    {note}
                  </p>
                </div>
                <span className={`shrink-0 rounded-md p-1.5 sm:p-2 ${background} ${color}`}>
                  <Icon className="size-4 sm:size-5" aria-hidden="true" />
                </span>
              </div>
            </CardBox>
          ))}
        </div>

        <div className="sm:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full justify-between"
            aria-expanded={mobileChartsOpen}
            onClick={() => setMobileChartsOpen((prev) => !prev)}
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" aria-hidden="true" />
              {mobileChartsOpen
                ? "Sembunyikan Grafik Ringkasan"
                : "Tampilkan Grafik Ringkasan"}
            </span>
            <ChevronDown
              className={`size-4 transition-transform ${mobileChartsOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>

        <div
          className={
            mobileChartsOpen
              ? "grid gap-4 sm:gap-6 xl:grid-cols-3"
              : "hidden sm:grid sm:gap-6 xl:grid-cols-3"
          }
        >
          <CardBox className="overflow-hidden p-0 xl:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h3 className="type-h3 font-semibold">Stok per Material</h3>
              <p className="type-p2 mt-1 text-muted-foreground">
                Perbandingan jumlah tersedia dengan batas minimum
              </p>
            </div>
            <div className="min-h-[300px] p-4">
              {stockItems.length ? (
                <Chart
                  options={stockChartOptions}
                  series={[
                    {
                      name: "Stok tersedia",
                      data: stockItems.map((item) => Number(item.stockQuantity)),
                    },
                    {
                      name: "Batas minimum",
                      data: stockItems.map((item) => Number(item.minimumStock)),
                    },
                  ]}
                  type="bar"
                  height={280}
                  width="100%"
                />
              ) : (
                <EmptyState
                  icon={Boxes}
                  variant="inline"
                  title="Belum Ada Data Persediaan"
                  description="Tambahkan barang baru untuk melihat grafik perbandingan stok."
                />
              )}
            </div>
          </CardBox>

          <CardBox className="overflow-hidden p-0">
            <div className="border-b border-border px-5 py-4">
              <h3 className="type-h3 font-semibold">Kondisi Persediaan</h3>
              <p className="type-p2 mt-1 text-muted-foreground">
                Jumlah barang berdasarkan tingkat stok
              </p>
            </div>
            {stockItems.length ? (
              <>
                <div className="p-3">
                  <Chart
                    options={stockDistributionOptions}
                    series={stockGroups.map((group) => group.count)}
                    type="donut"
                    height={220}
                    width="100%"
                  />
                </div>
                <div className="space-y-2 px-5 pb-5">
                  {stockGroups.map((group) => (
                    <div
                      key={group.label}
                      className="type-p2 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                        {group.label}
                      </span>
                      <span className="font-medium tabular-nums">
                        {group.count}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                icon={Boxes}
                variant="inline"
                title="Belum Ada Data Stok"
                description="Belum ada data kondisi persediaan."
              />
            )}
          </CardBox>
        </div>

        <CardBox className="gap-0 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-3.5 py-3 sm:gap-3 sm:px-5 sm:py-4">
            <div>
              <h3 className="type-h3 font-semibold">Katalog Material</h3>
              <p className="type-p3 mt-0.5 text-muted-foreground sm:type-p2 sm:mt-1">
                {canCreatePurchaseOrder
                  ? "Kelola katalog barang dan pantau kebutuhan restock."
                  : "Stok ditampilkan dalam mode baca saja untuk role Anda."}
              </p>
            </div>
            <div className="grid w-full grid-cols-[1fr_8.5rem] gap-2 sm:flex sm:w-auto">
              <div className="relative min-w-0">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={stockQuery}
                  onChange={(event) => {
                    setStockQuery(event.target.value);
                    setStockPage(1);
                  }}
                  placeholder="Cari barang..."
                  aria-label="Cari barang persediaan"
                  className="w-full pl-9 sm:w-52"
                />
              </div>
              <Select
                value={stockFilter}
                onValueChange={(value) => {
                  setStockFilter(value);
                  setStockPage(1);
                }}
              >
                <SelectTrigger
                  aria-label="Filter kondisi stok"
                  className="w-full sm:w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua stok</SelectItem>
                  <SelectItem value="AVAILABLE">Stok aman</SelectItem>
                  <SelectItem value="LOW">Stok menipis</SelectItem>
                  <SelectItem value="EMPTY">Stok habis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {stockItems.length ? (
            <div className="space-y-4 p-3 sm:p-5">
              {!visibleStockItems.length ? (
                <EmptyState
                  icon={Search}
                  title="Barang Tidak Ditemukan"
                  description="Tidak ada barang yang cocok dengan pencarian atau filter."
                />
              ) : (
                <>
                  <div className="space-y-2.5 md:hidden">
                    {paginatedStockItems.map((item) => (
                      <StockItemMobileCard
                        key={item.id}
                        item={item}
                        canManage={canCreatePurchaseOrder}
                        onEdit={openStockEditor}
                        onDetail={setStockDetail}
                        onDuplicate={(target) => void duplicateStockItem(target)}
                        onDelete={setStockDeleteTarget}
                      />
                    ))}
                  </div>

                  <div className="hidden md:block">
                    <Table pagination={false}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Satuan</TableHead>
                          <TableHead>Harga</TableHead>
                          <TableHead>Stok</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Dibuat</TableHead>
                          <TableHead>Nilai Stok</TableHead>
                          {canCreatePurchaseOrder && <TableHead>Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedStockItems.map((item) => {
                          const quantity = Number(item.stockQuantity);
                          const minimum = Number(item.minimumStock);
                          const isOutOfStock = quantity <= 0;
                          const isLowStock =
                            !isOutOfStock && quantity <= minimum;
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <span className="rounded-md border border-border bg-muted p-2 text-muted-foreground">
                                    <Boxes className="size-4" aria-hidden="true" />
                                  </span>
                                  <span>
                                    <span className="type-p2 block font-medium">
                                      {item.name}
                                    </span>
                                    <span className="type-p3 text-muted-foreground">
                                      SKU: {item.sku}
                                    </span>
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="gray">Material</Badge>
                              </TableCell>
                              <TableCell className="type-p2">
                                {item.unit}
                              </TableCell>
                              <TableCell className="type-p2 tabular-nums">
                                {currency.format(Number(item.unitPrice))}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    isOutOfStock
                                      ? "lightError"
                                      : isLowStock
                                        ? "lightWarning"
                                        : "lightInfo"
                                  }
                                >
                                  {new Intl.NumberFormat("id-ID").format(
                                    quantity,
                                  )}{" "}
                                  {item.unit}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    isOutOfStock
                                      ? "lightError"
                                      : isLowStock
                                        ? "lightWarning"
                                        : "lightSuccess"
                                  }
                                >
                                  {isOutOfStock
                                    ? "Habis"
                                    : isLowStock
                                      ? "Menipis"
                                      : "Aman"}
                                </Badge>
                              </TableCell>
                              <TableCell className="type-p2">
                                {stockDateLabel.format(
                                  new Date(item.createdAt),
                                )}
                              </TableCell>
                              <TableCell className="type-p2 tabular-nums">
                                {currency.format(
                                  quantity * Number(item.unitPrice),
                                )}
                              </TableCell>
                              {canCreatePurchaseOrder && (
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        aria-label={`Aksi untuk ${item.name}`}
                                      >
                                        <MoreHorizontal aria-hidden="true" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-44"
                                    >
                                      <DropdownMenuItem
                                        onSelect={() => openStockEditor(item)}
                                      >
                                        <Pencil aria-hidden="true" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onSelect={() => setStockDetail(item)}
                                      >
                                        <Eye aria-hidden="true" />
                                        Detail
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onSelect={() =>
                                          void duplicateStockItem(item)
                                        }
                                      >
                                        <Copy aria-hidden="true" />
                                        Duplikat
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onSelect={() =>
                                          setStockDeleteTarget(item)
                                        }
                                      >
                                        <Trash2 aria-hidden="true" />
                                        Hapus
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              <TablePaginationControls
                count={visibleStockItems.length}
                pageSize={stockPageSize}
                page={currentStockPage}
                itemLabel="barang"
                onPageChange={setStockPage}
              />
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <EmptyState
                icon={Boxes}
                title="Belum Ada Barang Persediaan"
                description="Tambahkan barang baru ke katalog material untuk mulai memantau stok gudang."
                action={
                  canCreatePurchaseOrder ? (
                    <Button type="button" onClick={() => openStockEditor()}>
                      <Plus className="size-4" aria-hidden="true" />
                      + Barang
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </CardBox>

        {/* Pembelian Langsung — ZERO Components Inside Rows, ZERO Circular Back-Links */}
        <CardBox className="gap-0 overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <h3 className="type-h3 font-semibold">Pembelian Langsung</h3>
            <p className="type-p2 mt-1 text-muted-foreground">
              Stok diperbarui setelah Logistik mengunggah nota dan mencatat penerimaan barang.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {stockPurchases.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="Belum Ada Pembelian Langsung"
                description="Catat pembelian langsung melalui tombol + Pembelian di bagian atas."
              />
            ) : (
              <>
                <div className="space-y-2.5 md:hidden">
                  {stockPurchases.map((purchase) => (
                    <DirectPurchaseMobileCard
                      key={purchase.id}
                      purchase={purchase}
                      canManage={canCreatePurchaseOrder}
                      canReplaceInvoice={canReplacePurchaseInvoice}
                      onOpenInvoiceModal={(target) => {
                        setInvoiceFiles([]);
                        setDirectPurchaseModal({
                          purchase: target,
                          mode: "invoice",
                        });
                      }}
                      onOpenReplaceInvoiceModal={(target) => {
                        setInvoiceFiles([]);
                        setDirectPurchaseModal({
                          purchase: target,
                          mode: "replace-invoice",
                        });
                      }}
                      onOpenDetailModal={(target) => {
                        setInvoiceFiles([]);
                        setDirectPurchaseModal({
                          purchase: target,
                          mode: "detail",
                        });
                      }}
                      onOpenReceiveModal={(target) => {
                        setReceivingFiles([]);
                        setReceivingPurchase(target);
                      }}
                    />
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table itemLabel="pembelian langsung">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pembelian &amp; Vendor</TableHead>
                        <TableHead>Tiket</TableHead>
                        <TableHead>Barang</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Nota / Penerimaan</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockPurchases.map((purchase) => {
                        const itemNamesSummary = purchase.items
                          .map((item) => item.itemName)
                          .join(", ");
                        const itemQtySummary = purchase.items
                          .map((item) => `${item.quantity} ${item.unit}`)
                          .join(" · ");
                        const needsInvoice =
                          canCreatePurchaseOrder &&
                          canUploadDirectPurchaseInvoice(purchase);
                        const canReplaceInvoice =
                          canReplacePurchaseInvoice &&
                          canReplaceDirectPurchaseInvoice(purchase);
                        const readyToReceive = canReceiveDirectPurchase(
                          purchase,
                          canCreatePurchaseOrder,
                        );

                        return (
                          <TableRow key={purchase.id}>
                            <TableCell className="whitespace-normal">
                              <p className="type-p2 font-mono font-semibold text-foreground">
                                {purchase.purchaseNumber}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {purchase.vendorName} ·{" "}
                                {stockDateLabel.format(
                                  new Date(purchase.createdAt),
                                )}
                              </p>
                            </TableCell>
                            <TableCell className="max-w-[180px] whitespace-normal">
                              {purchase.ticket ? (
                                <div className="space-y-0.5">
                                  <Badge variant="outline">
                                    {purchase.ticket.ticketNumber}
                                  </Badge>
                                  <p className="type-p3 truncate text-muted-foreground">
                                    {purchase.ticket.title}
                                  </p>
                                </div>
                              ) : (
                                <span className="type-p3 text-muted-foreground">
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[180px] whitespace-normal">
                              <p
                                className="type-p2 line-clamp-2 font-medium"
                                title={itemNamesSummary}
                              >
                                {itemNamesSummary}
                              </p>
                              <p className="type-p3 text-muted-foreground">
                                {itemQtySummary}
                              </p>
                            </TableCell>
                            <TableCell className="type-p2 text-right font-semibold tabular-nums">
                              {currency.format(Number(purchase.totalAmount))}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  purchase.status === "RECEIVED"
                                    ? "lightSuccess"
                                    : "lightWarning"
                                }
                              >
                                {getDirectPurchaseStatusLabel(purchase)}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="space-y-0.5">
                                {purchase.vendorInvoiceUrl ? (
                                  <p className="type-p3 font-medium text-emerald-700 dark:text-emerald-300">
                                    Nota diunggah
                                    {purchase.vendorInvoiceUploadedBy?.name
                                      ? ` (${purchase.vendorInvoiceUploadedBy.name})`
                                      : ""}
                                  </p>
                                ) : (
                                  <p className="type-p3 text-muted-foreground">
                                    Belum ada nota
                                  </p>
                                )}
                                {purchase.receivedAt && (
                                  <p className="type-p3 text-muted-foreground">
                                    Diterima{" "}
                                    {stockDateLabel.format(
                                      new Date(purchase.receivedAt),
                                    )}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                {needsInvoice ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setInvoiceFiles([]);
                                      setDirectPurchaseModal({
                                        purchase,
                                        mode: "invoice",
                                      });
                                    }}
                                  >
                                    <Upload
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Unggah Nota
                                  </Button>
                                ) : readyToReceive ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      setReceivingFiles([]);
                                      setReceivingPurchase(purchase);
                                    }}
                                  >
                                    <PackageOpen
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Terima
                                  </Button>
                                ) : null}
                                {canReplaceInvoice && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setInvoiceFiles([]);
                                      setDirectPurchaseModal({
                                        purchase,
                                        mode: "replace-invoice",
                                      });
                                    }}
                                  >
                                    <Pencil
                                      className="size-3.5"
                                      aria-hidden="true"
                                    />
                                    Ganti Foto Invoice/Bon
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setInvoiceFiles([]);
                                    setDirectPurchaseModal({
                                      purchase,
                                      mode: "detail",
                                    });
                                  }}
                                >
                                  Detail
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </CardBox>

        {/* HOISTED SINGLE DIRECT PURCHASE MODAL (Unggah Nota / Ganti Nota / Detail) */}
        <GlobalModal
          isOpen={directPurchaseModal !== null}
          onClose={() => {
            if (!isInvoicePending && !isInvoicePreparing) {
              setDirectPurchaseModal(null);
              setInvoiceFiles([]);
            }
          }}
          title={
            directPurchaseModal?.mode === "replace-invoice"
              ? `Ganti Foto Invoice/Bon · ${directPurchaseModal.purchase.purchaseNumber}`
              : directPurchaseModal?.mode === "invoice"
                ? `Unggah Nota · ${directPurchaseModal.purchase.purchaseNumber}`
                : `Detail Pembelian · ${directPurchaseModal?.purchase.purchaseNumber ?? ""}`
          }
          description={directPurchaseModal?.purchase.vendorName}
          className="sm:max-w-lg"
          footer={
            directPurchaseModal ? (
              directPurchaseModal.mode === "invoice" ||
              directPurchaseModal.mode === "replace-invoice" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isInvoicePending || isInvoicePreparing}
                    onClick={() => {
                      setDirectPurchaseModal(null);
                      setInvoiceFiles([]);
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    form="hoisted-direct-purchase-invoice-form"
                    disabled={
                      isInvoicePending ||
                      isInvoicePreparing ||
                      invoiceFiles.length === 0
                    }
                  >
                    {directPurchaseModal.mode === "replace-invoice"
                      ? isInvoicePending
                        ? "Menyimpan..."
                        : "Simpan Invoice/Bon Baru"
                      : isInvoicePending
                        ? "Mengirim..."
                        : "Kirim ke Keuangan"}
                  </Button>
                </>
              ) : (() => {
                const canUpload =
                  canCreatePurchaseOrder &&
                  canUploadDirectPurchaseInvoice(directPurchaseModal.purchase);
                const canReplace =
                  canReplacePurchaseInvoice &&
                  canReplaceDirectPurchaseInvoice(directPurchaseModal.purchase);
                const canReceive = canReceiveDirectPurchase(
                  directPurchaseModal.purchase,
                  canCreatePurchaseOrder,
                );
                const hasPrimaryOtherThanReplace = canUpload || canReceive;

                return (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDirectPurchaseModal(null)}
                    >
                      Tutup
                    </Button>
                    {canReplace && hasPrimaryOtherThanReplace && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline">
                            <MoreHorizontal className="size-4" aria-hidden="true" />
                            Opsi
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setInvoiceFiles([]);
                              setDirectPurchaseModal({
                                purchase: directPurchaseModal.purchase,
                                mode: "replace-invoice",
                              });
                            }}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            Ganti Foto/Bon
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {canUpload ? (
                      <Button
                        type="button"
                        onClick={() => {
                          setInvoiceFiles([]);
                          setDirectPurchaseModal({
                            purchase: directPurchaseModal.purchase,
                            mode: "invoice",
                          });
                        }}
                      >
                        <Upload className="size-4" aria-hidden="true" />
                        Unggah Nota
                      </Button>
                    ) : canReceive ? (
                      <Button
                        type="button"
                        onClick={() => {
                          const target = directPurchaseModal.purchase;
                          setDirectPurchaseModal(null);
                          setReceivingFiles([]);
                          setReceivingPurchase(target);
                        }}
                      >
                        <PackageOpen className="size-4" aria-hidden="true" />
                        Terima Barang
                      </Button>
                    ) : canReplace ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setInvoiceFiles([]);
                          setDirectPurchaseModal({
                            purchase: directPurchaseModal.purchase,
                            mode: "replace-invoice",
                          });
                        }}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                        Ganti Foto/Bon
                      </Button>
                    ) : null}
                  </>
                );
              })()
            ) : undefined
          }
        >
          {directPurchaseModal ? (
            directPurchaseModal.mode === "invoice" ||
            directPurchaseModal.mode === "replace-invoice" ? (
              <form
                key={`${directPurchaseModal.mode}:${directPurchaseModal.purchase.id}`}
                id="hoisted-direct-purchase-invoice-form"
                className="space-y-4"
                onSubmit={handleUploadDirectPurchaseInvoice}
              >
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-3">
                  <div>
                    <p className="type-p3 text-muted-foreground">Total Belanja</p>
                    <p className="type-h3 font-bold tabular-nums text-primary">
                      {currency.format(
                        Number(directPurchaseModal.purchase.totalAmount),
                      )}
                    </p>
                  </div>
                  {invoiceFiles[0] ? (
                    <InvoiceFilePreview
                      file={invoiceFiles[0]}
                      title={`Pratinjau Nota · ${directPurchaseModal.purchase.purchaseNumber}`}
                    />
                  ) : null}
                </div>

                {directPurchaseModal.mode === "replace-invoice" &&
                  directPurchaseModal.purchase.vendorInvoiceUrl && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <p className="type-p3 text-muted-foreground">
                        Berkas invoice/bon lama akan diganti tanpa mengubah rincian pembelian.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setStockReceiptPreviewFailed(false);
                          setStockReceiptPreview({
                            url: directPurchaseModal.purchase.vendorInvoiceUrl!,
                            label: `${directPurchaseModal.purchase.purchaseNumber} · Invoice / BON`,
                          });
                        }}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        Lihat Lama
                        {(() => {
                          const assetMeta = parseClientAssetCode(
                            directPurchaseModal.purchase.vendorInvoiceUrl,
                          );
                          return assetMeta ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                              {assetMeta.assetCode}
                            </span>
                          ) : null;
                        })()}
                      </Button>
                    </div>
                  )}

                <div className="space-y-1.5">
                  <Label htmlFor="direct-purchase-doc-kind" className="type-p2 font-semibold">
                    Jenis Dokumen
                  </Label>
                  <Select
                    value={invoiceDocKind}
                    onValueChange={(value) =>
                      setInvoiceDocKind(value as "INV" | "BON")
                    }
                    disabled={isInvoicePending || isInvoicePreparing}
                  >
                    <SelectTrigger id="direct-purchase-doc-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INV">Invoice / Faktur Vendor (INV)</SelectItem>
                      <SelectItem value="BON">Bon / Nota Pembelian (BON)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="type-p2 font-semibold">
                    {directPurchaseModal.mode === "replace-invoice"
                      ? "Berkas Invoice / Bon Pengganti"
                      : "Berkas Invoice / Bon Faktur"}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <FileDropzone
                    accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    maxFiles={1}
                    maxSizeMb={5}
                    files={invoiceFiles}
                    disabled={isInvoicePending || isInvoicePreparing}
                    label={
                      isInvoicePreparing
                        ? "Memproses berkas..."
                        : directPurchaseModal.mode === "replace-invoice"
                          ? "Unggah Foto / PDF Invoice/Bon Baru"
                          : "Unggah Foto / PDF Nota / Bon"
                    }
                    hint="Format PDF, JPG, PNG, atau WEBP (maksimal 5 MB)."
                    onFilesChange={
                      directPurchaseModal.mode === "replace-invoice"
                        ? (files) => {
                            void handleReplaceInvoiceFilesChange(files);
                          }
                        : setInvoiceFiles
                    }
                    onError={(err) => toast.error(err)}
                  />
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <dl className="type-p2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-right font-medium">
                    {getDirectPurchaseStatusLabel(directPurchaseModal.purchase)}
                  </dd>
                  <dt className="text-muted-foreground">Vendor</dt>
                  <dd className="text-right font-medium">
                    {directPurchaseModal.purchase.vendorName}
                  </dd>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="text-right font-bold tabular-nums text-primary">
                    {currency.format(
                      Number(directPurchaseModal.purchase.totalAmount),
                    )}
                  </dd>
                  {directPurchaseModal.purchase.ticket && (
                    <>
                      <dt className="text-muted-foreground">Tiket Terkait</dt>
                      <dd className="text-right font-medium">
                        {directPurchaseModal.purchase.ticket.ticketNumber} ·{" "}
                        {directPurchaseModal.purchase.ticket.title}
                      </dd>
                    </>
                  )}
                </dl>

                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
                    Daftar Barang
                  </p>
                  <ul className="mt-2 divide-y divide-border/50">
                    {directPurchaseModal.purchase.items.map((item) => (
                      <li
                        key={item.id}
                        className="type-p2 flex items-center justify-between py-1.5"
                      >
                        <span>{item.itemName}</span>
                        <Badge variant="gray">
                          {item.quantity} {item.unit}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                {directPurchaseModal.purchase.vendorInvoiceUrl && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setStockReceiptPreviewFailed(false);
                        setStockReceiptPreview({
                          url: directPurchaseModal.purchase.vendorInvoiceUrl!,
                          label: `${directPurchaseModal.purchase.purchaseNumber} · Invoice / BON`,
                        });
                      }}
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      Lihat Nota Vendor
                      {(() => {
                        const assetMeta = parseClientAssetCode(
                          directPurchaseModal.purchase.vendorInvoiceUrl,
                        );
                        return assetMeta ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                            {assetMeta.assetCode}
                          </span>
                        ) : null;
                      })()}
                    </Button>
                    {canReplacePurchaseInvoice &&
                      canReplaceDirectPurchaseInvoice(
                        directPurchaseModal.purchase,
                      ) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInvoiceFiles([]);
                            setDirectPurchaseModal({
                              purchase: directPurchaseModal.purchase,
                              mode: "replace-invoice",
                            });
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Ganti Foto Invoice/Bon
                        </Button>
                      )}
                  </div>
                )}

                {(() => {
                  const p = directPurchaseModal.purchase;
                  const photos =
                    p.receivedPhotos.length > 0
                      ? p.receivedPhotos
                      : p.arrivalPhotoUrl
                        ? [p.arrivalPhotoUrl]
                        : [];
                  if (photos.length === 0) return null;
                  return (
                    <div className="space-y-2">
                      <p className="type-p3 font-semibold uppercase tracking-wide text-muted-foreground">
                        Foto Penerimaan ({photos.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {photos.map((photo, index) => (
                          <Button
                            key={`${p.id}-${photo}`}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setStockReceiptPreviewFailed(false);
                              setStockReceiptPreview({
                                url: photo,
                                label: `${p.purchaseNumber} · Foto penerimaan ${index + 1}`,
                              });
                            }}
                          >
                            <Eye className="size-3.5" aria-hidden="true" />
                            Foto #{index + 1}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )
          ) : null}
        </GlobalModal>

        {/* CSV Import Modal */}
        {canCreatePurchaseOrder && (
          <GlobalModal
            isOpen={csvModalOpen}
            onClose={() => {
              if (!stockImporting) setCsvModalOpen(false);
            }}
            title="Impor Stok CSV"
            description="Unggah berkas CSV berisi daftar SKU dan jumlah stok material."
            className="sm:max-w-md"
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={stockImporting}
                  onClick={() => setCsvModalOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  disabled={stockImporting || csvFiles.length === 0}
                  onClick={() => void handleImportStockCsv()}
                >
                  {stockImporting ? "Mengimpor..." : "Mulai Impor"}
                </Button>
              </>
            }
          >
            <FileDropzone
              accept=".csv,text/csv"
              maxFiles={1}
              maxSizeMb={1}
              files={csvFiles}
              disabled={stockImporting}
              label="Pilih Berkas CSV"
              hint="Maksimal 1 MB."
              onFilesChange={setCsvFiles}
              onError={(err) => toast.error(err)}
            />
          </GlobalModal>
        )}

        {/* Stock Item Editor Modal */}
        {canCreatePurchaseOrder && (
          <GlobalModal
            isOpen={stockDialogOpen}
            onClose={() => {
              if (!stockSubmitting) setStockDialogOpen(false);
            }}
            title={editingStockId ? "Edit Barang" : "Tambah Barang"}
            description="Perbarui katalog material dan saldo stok yang tercatat."
            className="sm:max-w-xl"
            footer={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStockDialogOpen(false)}
                  disabled={stockSubmitting}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={saveStockItem}
                  disabled={stockSubmitting}
                >
                  {stockSubmitting ? "Menyimpan..." : "Simpan Barang"}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stock-item-name" className="type-p2 font-medium">
                  Nama Barang
                </Label>
                <Input
                  id="stock-item-name"
                  value={stockDraft.name}
                  maxLength={120}
                  onChange={(event) =>
                    setStockDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-item-sku" className="type-p2 font-medium">
                  SKU
                </Label>
                <Input
                  id="stock-item-sku"
                  value={stockDraft.sku}
                  placeholder={
                    editingStockId
                      ? "Masukkan SKU"
                      : "Dibuat otomatis saat disimpan"
                  }
                  disabled={!editingStockId}
                  readOnly={!editingStockId}
                  maxLength={64}
                  onChange={(event) =>
                    setStockDraft((current) => ({
                      ...current,
                      sku: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stock-item-unit" className="type-p2 font-medium">
                  Satuan
                </Label>
                <Input
                  id="stock-item-unit"
                  value={stockDraft.unit}
                  maxLength={24}
                  onChange={(event) =>
                    setStockDraft((current) => ({
                      ...current,
                      unit: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="stock-item-price"
                  className="type-p2 font-medium"
                >
                  Harga Satuan (Rp)
                </Label>
                <Input
                  id="stock-item-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockDraft.unitPrice}
                  onChange={(event) =>
                    setStockDraft((current) => ({
                      ...current,
                      unitPrice: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="stock-item-quantity"
                  className="type-p2 font-medium"
                >
                  Stok Tersedia
                </Label>
                <Input
                  id="stock-item-quantity"
                  type="number"
                  min="0"
                  step="0.001"
                  value={stockDraft.stockQuantity}
                  onChange={(event) =>
                    setStockDraft((current) => ({
                      ...current,
                      stockQuantity: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="stock-item-minimum"
                  className="type-p2 font-medium"
                >
                  Batas Minimum
                </Label>
                <Input
                  id="stock-item-minimum"
                  type="number"
                  min="0"
                  step="0.001"
                  value={stockDraft.minimumStock}
                  onChange={(event) =>
                    setStockDraft((current) => ({
                      ...current,
                      minimumStock: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </GlobalModal>
        )}

        {/* Stock Detail Modal */}
        <GlobalModal
          isOpen={stockDetail !== null}
          onClose={() => setStockDetail(null)}
          title="Detail Barang"
          description="Informasi katalog dan posisi stok material."
          className="sm:max-w-md"
          footer={
            <Button
              type="button"
              variant="outline"
              onClick={() => setStockDetail(null)}
            >
              Tutup
            </Button>
          }
        >
          {stockDetail && (
            <dl className="type-p2 grid grid-cols-2 gap-x-4 gap-y-3">
              <dt className="text-muted-foreground">Nama Barang</dt>
              <dd className="text-right font-medium">{stockDetail.name}</dd>
              <dt className="text-muted-foreground">SKU</dt>
              <dd className="text-right font-mono font-medium">
                {stockDetail.sku}
              </dd>
              <dt className="text-muted-foreground">Satuan</dt>
              <dd className="text-right font-medium">{stockDetail.unit}</dd>
              <dt className="text-muted-foreground">Stok Tersedia</dt>
              <dd className="text-right font-medium tabular-nums">
                {new Intl.NumberFormat("id-ID").format(
                  Number(stockDetail.stockQuantity),
                )}{" "}
                {stockDetail.unit}
              </dd>
              <dt className="text-muted-foreground">Batas Minimum</dt>
              <dd className="text-right font-medium tabular-nums">
                {new Intl.NumberFormat("id-ID").format(
                  Number(stockDetail.minimumStock),
                )}{" "}
                {stockDetail.unit}
              </dd>
              <dt className="text-muted-foreground">Harga Satuan</dt>
              <dd className="text-right font-medium tabular-nums">
                {currency.format(Number(stockDetail.unitPrice))}
              </dd>
              <dt className="text-muted-foreground">Nilai Persediaan</dt>
              <dd className="text-right font-medium tabular-nums">
                {currency.format(
                  Number(stockDetail.stockQuantity) *
                    Number(stockDetail.unitPrice),
                )}
              </dd>
              <dt className="text-muted-foreground">Tanggal Dibuat</dt>
              <dd className="text-right font-medium">
                {stockDateLabel.format(new Date(stockDetail.createdAt))}
              </dd>
            </dl>
          )}
        </GlobalModal>

        {/* Stock Delete Modal */}
        <GlobalModal
          isOpen={stockDeleteTarget !== null}
          onClose={() => {
            if (!stockDeleteSubmitting) setStockDeleteTarget(null);
          }}
          title="Hapus Barang Persediaan?"
          description="Barang ini akan dihapus permanen dari katalog dan tidak dapat dipilih untuk PO baru."
          className="sm:max-w-md"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStockDeleteTarget(null)}
                disabled={stockDeleteSubmitting}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDeleteStockItem}
                disabled={stockDeleteSubmitting}
              >
                {stockDeleteSubmitting ? "Menghapus..." : "Hapus"}
              </Button>
            </>
          }
        >
          {stockDeleteTarget && (
            <div className="rounded-md border border-border bg-muted p-3">
              <p className="type-p2 font-medium">{stockDeleteTarget.name}</p>
              <p className="type-p3 text-muted-foreground">
                SKU: {stockDeleteTarget.sku}
              </p>
            </div>
          )}
        </GlobalModal>

        {/* Direct Purchase Receive Modal */}
        <GlobalModal
          isOpen={receivingPurchase !== null}
          onClose={() => {
            if (!receivingPurchaseSubmitting) {
              setReceivingPurchase(null);
              setReceivingFiles([]);
            }
          }}
          title="Terima Pembelian Stok"
          description={
            receivingPurchase
              ? `${receivingPurchase.purchaseNumber} · ${receivingPurchase.vendorName}. Stok bertambah setelah penerimaan tersimpan.`
              : "Unggah foto bukti barang telah tiba di gudang."
          }
          className="sm:max-w-lg"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReceivingPurchase(null);
                  setReceivingFiles([]);
                }}
                disabled={receivingPurchaseSubmitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                form="direct-purchase-receive-form"
                disabled={
                  receivingPurchaseSubmitting ||
                  receivingFiles.length === 0 ||
                  receivingFiles.length >
                    MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS
                }
              >
                {receivingPurchaseSubmitting ? "Mencatat..." : "Terima Barang"}
              </Button>
            </>
          }
        >
          {receivingPurchase && (
            <form
              id="direct-purchase-receive-form"
              key={receivingPurchase.id}
              className="space-y-4"
              onSubmit={submitStockPurchaseReceipt}
            >
              <div className="space-y-1.5">
                <Label className="type-p2 font-semibold">
                  Foto Bukti Barang Tiba (1–
                  {MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS} Foto)
                </Label>
                <FileDropzone
                  accept="image/*,.heic,.heif"
                  multiple
                  capture="environment"
                  maxFiles={MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS}
                  maxSizeMb={5}
                  files={receivingFiles}
                  disabled={receivingPurchaseSubmitting}
                  label="Unggah Foto Penerimaan"
                  hint="Format JPG, PNG, atau WEBP; maksimal 5 MB per foto."
                  onFilesChange={setReceivingFiles}
                  onError={(err) => toast.error(err)}
                />
              </div>
            </form>
          )}
        </GlobalModal>

        {/* Receipt / Invoice Preview Modal */}
        <GlobalModal
          isOpen={stockReceiptPreview !== null}
          onClose={() => {
            setStockReceiptPreview(null);
            setStockReceiptPreviewFailed(false);
          }}
          title={stockReceiptPreview?.label ?? "Bukti Dokumen"}
          description="Pratinjau dokumen atau foto bukti."
          className="sm:max-w-4xl"
          footer={
            stockReceiptPreview &&
            !stockReceiptPreview.url.startsWith("blob:") ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStockReceiptPreview(null);
                    setStockReceiptPreviewFailed(false);
                  }}
                >
                  Tutup
                </Button>
                <Button asChild>
                  <a
                    href={photoDownloadHref(stockReceiptPreview.url)}
                    {...photoDownloadLinkProps(stockReceiptPreview.url)}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    {photoDownloadLabel(stockReceiptPreview.url)}
                  </a>
                </Button>
              </>
            ) : undefined
          }
        >
          {stockReceiptPreview && (
            <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 sm:min-h-[60vh]">
              {stockReceiptPreview.url
                .split(/[?#]/, 1)[0]
                .toLowerCase()
                .endsWith(".pdf") ? (
                <iframe
                  key={stockReceiptPreview.url}
                  src={withLocalPhotoPreview(stockReceiptPreview.url)}
                  title={`Pratinjau ${stockReceiptPreview.label}`}
                  className="h-[65vh] w-full"
                />
              ) : stockReceiptPreviewFailed ? (
                <p
                  className="type-p2 max-w-lg p-6 text-center text-muted-foreground"
                  role="status"
                >
                  Foto ini tidak dapat dimuat. Gunakan tombol unduh untuk memeriksa berkas asli.
                </p>
              ) : (
                <Image
                  key={stockReceiptPreview.url}
                  src={withLocalPhotoPreview(stockReceiptPreview.url)}
                  alt={stockReceiptPreview.label}
                  fill
                  unoptimized
                  className="object-contain"
                  sizes="(max-width: 640px) 100vw, 80vw"
                  onError={() => setStockReceiptPreviewFailed(true)}
                />
              )}
            </div>
          )}
        </GlobalModal>
      </div>
    );
  }

  // MODE = "logistics" (Tiket Masuk & Overview)
  return (
    <div className="my-2 space-y-4 pb-12 sm:my-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="type-h2 text-foreground">Manajemen Tiket Logistik</h2>
          <p className="type-p3 mt-0.5 text-muted-foreground sm:type-p2 sm:mt-1">
            Pantau permintaan material, status pemenuhan, dan pengiriman.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
            <Download className="size-4" aria-hidden="true" />
            Export
          </Button>
          {role !== "MOVER" && (
            <CreateTicketModal
              projects={projects}
              stockItems={stockItems}
              materialContracts={materialContracts}
              requesterRole={role}
              triggerLabel="Order Baru"
              defaultRequestCategory={TicketRequestCategory.MATERIAL}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, note, filter, Icon, color, background }) => (
          <button
            key={label}
            type="button"
            className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setStatusFilter(filter);
              setSearch("");
            }}
          >
            <CardBox className="h-full p-3 transition-colors hover:bg-muted/40 sm:p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="type-p3 truncate font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="type-kpi mt-1 truncate" title={String(value)}>
                    {value}
                  </p>
                  <p className="type-p3 mt-1 hidden text-muted-foreground sm:block">
                    {note}
                  </p>
                </div>
                <span className={`shrink-0 rounded-md p-1.5 sm:p-2 ${background} ${color}`}>
                  <Icon className="size-4 sm:size-5" aria-hidden="true" />
                </span>
              </div>
            </CardBox>
          </button>
        ))}
      </div>

      <div className="sm:hidden">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full justify-between"
          aria-expanded={mobileChartsOpen}
          onClick={() => setMobileChartsOpen((prev) => !prev)}
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" aria-hidden="true" />
            {mobileChartsOpen
              ? "Sembunyikan Grafik Ringkasan"
              : "Tampilkan Grafik Ringkasan"}
          </span>
          <ChevronDown
            className={`size-4 transition-transform ${mobileChartsOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </Button>
      </div>

      <div
        className={
          mobileChartsOpen
            ? "grid gap-4 sm:gap-6 xl:grid-cols-3"
            : "hidden sm:grid sm:gap-6 xl:grid-cols-3"
        }
      >
        <CardBox className="overflow-hidden p-0 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="type-h3 font-semibold">Tren Pesanan</h3>
              <p className="type-p2 mt-1 text-muted-foreground">
                Jumlah permintaan dan nilai estimasi
              </p>
            </div>
            <div className="flex gap-1" aria-label="Rentang tren">
              {periods.map((item) => (
                <Button
                  key={item.days}
                  type="button"
                  variant={period === item.days ? "default" : "outline"}
                  size="sm"
                  aria-pressed={period === item.days}
                  onClick={() => setPeriod(item.days)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="min-h-[330px] p-4">
            {periodTickets.length ? (
              <Chart
                options={chartOptions}
                series={[
                  { name: "Pesanan", type: "area", data: trend.orders },
                  {
                    name: "Nilai estimasi",
                    type: "line",
                    data: trend.amounts,
                  },
                ]}
                type="line"
                height={310}
                width="100%"
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                variant="inline"
                title="Belum Ada Pesanan"
                description={`Tidak ada pesanan dalam ${period} hari terakhir.`}
              />
            )}
          </div>
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <h3 className="type-h3 font-semibold">Status Pesanan</h3>
            <p className="type-p2 mt-1 text-muted-foreground">
              Distribusi status seluruh tiket material
            </p>
          </div>
          {tickets.length ? (
            <>
              <Chart
                options={statusChartOptions}
                series={statusCounts.map(({ count }) => count)}
                type="donut"
                height={220}
                width="100%"
              />
              <ul className="space-y-2 px-5 pb-5">
                {statusCounts.map(({ status, count }) => (
                  <li
                    key={status}
                    className="type-p2 flex items-center justify-between gap-3"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: statusColors[status] }}
                      />
                      {statusLabels[status]}
                    </span>
                    <Badge variant="gray">{count}</Badge>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={ClipboardList}
              variant="inline"
              title="Belum Ada Pesanan"
              description="Belum ada pesanan material tercatat."
            />
          )}
        </CardBox>
      </div>

      <CardBox className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-3.5 py-3 sm:gap-3 sm:px-5 sm:py-4">
          <div>
            <h3 className="type-h3 font-semibold">Pesanan Material</h3>
            <p className="type-p3 mt-0.5 text-muted-foreground sm:type-p2 sm:mt-1">
              Lihat rincian, lacak aktivitas, dan lanjutkan pemenuhan.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Input
              type="search"
              placeholder="Cari pesanan..."
              aria-label="Cari pesanan logistik"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="sm:w-52"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className="w-full sm:w-48"
                aria-label="Filter status"
              >
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua status</SelectItem>
                <SelectItem value="IN_DELIVERY">Dalam pengiriman</SelectItem>
                {Object.values(TicketStatus).map((status) => (
                  <SelectItem value={status} key={status}>
                    {statusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="px-2.5 sm:px-5">
          <TicketListing
            tickets={visibleTickets}
            projects={projects}
            vendors={vendors}
            stockItems={stockItems}
            materialContracts={materialDeliveryContracts}
            contractTickets={contractTickets}
            role={role}
            ticketSearch={search}
            searchTickets={setSearch}
            hideSearch
            initialOpenSheet={initialOpenSheet}
          />
        </div>
      </CardBox>
    </div>
  );
}
