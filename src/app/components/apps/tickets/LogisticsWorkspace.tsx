"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  CircleDollarSign,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileUp,
  MoreHorizontal,
  Pencil,
  PackageOpen,
  Plus,
  Search,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import CardBox from "@/app/components/shared/CardBox";
import TicketListing from "@/app/components/apps/tickets/TicketListing";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import type { VehicleSummary } from "@/app/actions/vehicles";
import CreateTicketModal from "@/app/components/apps/tickets/CreateTicketModal";
import CreatePurchaseModal from "@/app/components/forms/CreatePurchaseModal";
import type { VendorBankAccountOption } from "@/lib/vendor-bank-accounts";
import type {
  TicketPageRole,
  TicketProjectOption,
  TicketRow,
} from "@/app/(DashboardLayout)/types/ticket";
import { TicketStatus } from "@prisma/client";
import {
  MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS,
} from "@/lib/direct-stock-purchase-photo-config";
import { getJakartaDateKey, shiftDateKey } from "@/lib/habit-date";
import {
  deleteLogisticsStockItem,
  importLogisticsStockCsv,
  receiveDirectStockPurchase,
  saveLogisticsStockItem,
  submitDirectStockPurchaseInvoice,
} from "@/app/actions/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel, Label } from "@/components/ui/label";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

const statusLabels: Record<TicketStatus, string> = {
  [TicketStatus.DRAFT]: "Draf",
  [TicketStatus.PENDING_DIRECTOR]: "Menunggu persetujuan Direktur",
  [TicketStatus.APPROVED_DIR]: "Disetujui Direktur",
  [TicketStatus.PROCESSED_FINANCE]: "Diproses Finance",
  [TicketStatus.PROCESSED_LOGISTIC]: "Diproses Logistik",
  [TicketStatus.ASSIGNED_TO_MOVER]: "Ditugaskan ke Mover",
  [TicketStatus.IN_TRANSIT]: "Dalam perjalanan (ekspedisi)",
  [TicketStatus.WAITING_FINANCE_PAYMENT]: "Menunggu pembayaran Finance",
  [TicketStatus.COMPLETED]: "Selesai",
  [TicketStatus.REJECTED]: "Ditolak",
};

const statusColors: Record<TicketStatus, string> = {
  [TicketStatus.DRAFT]: "var(--color-muted-foreground)",
  [TicketStatus.PENDING_DIRECTOR]: "var(--color-warning)",
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

function DirectPurchaseInvoiceAction({
  purchase,
  onPreview,
}: {
  purchase: DirectStockPurchaseRow;
  onPreview: (url: string, label: string) => void;
}) {
  const router = useRouter();
  const invoicePhotoInput = useRef<HTMLInputElement>(null);
  const [documentPhoto, setDocumentPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const saveDocument = () => {
    if (!documentPhoto) {
      setMessage("Pilih foto invoice/bon terlebih dahulu.");
      return;
    }
    setMessage("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("purchaseId", purchase.id);
        formData.set("invoicePhoto", documentPhoto, documentPhoto.name);
        const result = await submitDirectStockPurchaseInvoice(formData);
        setMessage(result.message);
        if (result.success) {
          setDocumentPhoto(null);
          router.refresh();
        }
      } catch (error) {
        console.error("Saving direct purchase invoice failed:", error);
        setMessage("Invoice/bon gagal disimpan. Coba kembali.");
      }
    });
  };

  const invoiceUrl = purchase.vendorInvoiceUrl;
  if (invoiceUrl) {
    return (
      <ActionIconButton
        type="button"
        label={`Lihat invoice/bon faktur pembelian ${purchase.purchaseNumber}`}
        tooltip="Lihat Invoice/Bon"
        icon={ExternalLink}
        onClick={() =>
          onPreview(
            invoiceUrl,
            `${purchase.purchaseNumber} · Invoice / BON Faktur`,
          )
        }
      />
    );
  }
  if (!purchase.isApprovedByDirector) {
    return null;
  }
  if (purchase.status !== "PENDING_RECEIPT") {
    return null;
  }

  return (
    <div className="space-y-2">
      <FormLabel className="block space-y-1">
        <span className="text-xs font-medium">Foto Invoice / BON Faktur</span>
        <Input
          ref={invoicePhotoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            setDocumentPhoto(file);
            setMessage(file ? `${file.name} dipilih.` : "");
          }}
          disabled={isPending}
          aria-label="Pilih foto Invoice atau BON Faktur"
        />
      </FormLabel>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => invoicePhotoInput.current?.click()}
        disabled={isPending}
      >
        <Upload aria-hidden="true" />
        {documentPhoto ? "Ganti Foto Invoice/Bon" : "Unggah Invoice/Bon"}
      </Button>
      {documentPhoto && (
        <Button
          type="button"
          size="sm"
          onClick={saveDocument}
          disabled={isPending}
        >
          {isPending
            ? "Mengunggah dan mengirim..."
            : "Simpan & Kirim ke Keuangan"}
        </Button>
      )}
      {message && (
        <p className="max-w-48 text-xs text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

type ReceivingPhoto = {
  file: File;
  previewUrl: string;
};

type PurchaseTicketOption = {
  id: string;
  ticketNumber: string;
  title: string;
};

type LogisticsVendor = {
  id: string;
  name: string;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts: VendorBankAccountOption[];
};

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
  initialAction?: "ticket" | "stock-purchase";
  initialOpenSheet?: string;
}) {
  const [period, setPeriod] = useState<(typeof periods)[number]["days"]>(30);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(Boolean(initialAction));
  const [receivingPurchase, setReceivingPurchase] =
    useState<DirectStockPurchaseRow | null>(null);
  const [receivingPurchaseSubmitting, setReceivingPurchaseSubmitting] =
    useState(false);
  const [receivingPurchaseError, setReceivingPurchaseError] = useState("");
  const [receivingPhotos, setReceivingPhotos] = useState<ReceivingPhoto[]>([]);
  const receivingPreviewUrls = useRef(new Set<string>());
  const receivingPhotoInput = useRef<HTMLInputElement>(null);
  const [stockReceiptPreview, setStockReceiptPreview] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const [stockReceiptPreviewFailed, setStockReceiptPreviewFailed] =
    useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [stockPage, setStockPage] = useState(1);
  const [stockImporting, setStockImporting] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockSubmitting, setStockSubmitting] = useState(false);
  const [stockFormError, setStockFormError] = useState("");
  const [stockNotice, setStockNotice] = useState("");
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockDetail, setStockDetail] = useState<LogisticsStockItem | null>(null);
  const [stockDeleteTarget, setStockDeleteTarget] =
    useState<LogisticsStockItem | null>(null);
  const [stockDeleteSubmitting, setStockDeleteSubmitting] = useState(false);

  useEffect(
    () => () => {
      receivingPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      receivingPreviewUrls.current.clear();
    },
    [],
  );
  const [stockDeleteError, setStockDeleteError] = useState("");
  const [stockActionError, setStockActionError] = useState("");
  const [stockDraft, setStockDraft] = useState({
    sku: "",
    name: "",
    unit: "pcs",
    stockQuantity: "0",
    minimumStock: "0",
    unitPrice: "0",
  });
  const stockImportInput = useRef<HTMLInputElement>(null);
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
      periodTickets.filter(
        (ticket) =>
          ticket.id === initialOpenSheet ||
          ((statusFilter === "ALL" ||
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

  const statusCounts = useMemo(
    () =>
      Object.values(TicketStatus)
        .map((status) => ({
          status,
          count: tickets.filter((ticket) => ticket.status === status).length,
        }))
        .filter((entry) => entry.count > 0),
    [tickets],
  );

  const pendingCount = tickets.filter(
    (ticket) => ticket.status === TicketStatus.PROCESSED_LOGISTIC,
  ).length;
  const deliveryCount = tickets.filter(
    (ticket) =>
      ticket.status === TicketStatus.ASSIGNED_TO_MOVER ||
      ticket.status === TicketStatus.IN_TRANSIT,
  ).length;
  const totalValue = tickets.reduce(
    (sum, ticket) => sum + Number(ticket.totalAmount ?? 0),
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
            value: { show: true, formatter: (value: string) => `${value} pesanan` },
            total: {
              show: true,
              label: "Total",
              formatter: () => `${tickets.length}`,
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
      ticket.items.map((item) => `${item.itemName}: ${item.quantity} ${item.unit}`).join("; "),
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
      value: tickets.length,
      note: "Klik untuk melihat seluruh tiket",
      filter: "ALL",
      Icon: ClipboardList,
      color: "text-primary",
      background: "bg-lightprimary",
    },
    {
      label: "Menunggu Logistik",
      value: pendingCount,
      note: "Klik untuk melihat tiket yang perlu diproses",
      filter: TicketStatus.PROCESSED_LOGISTIC,
      Icon: PackageOpen,
      color: "text-warning",
      background: "bg-lightwarning",
    },
    {
      label: "Dalam Pengiriman",
      value: deliveryCount,
      note: "Klik untuk melihat tiket yang sedang dikirim",
      filter: "IN_DELIVERY",
      Icon: Truck,
      color: "text-info",
      background: "bg-lightinfo",
    },
    {
      label: "Total Nilai",
      value: currency.format(totalValue),
      note: "Klik untuk kembali ke seluruh tiket",
      filter: "ALL",
      Icon: CircleDollarSign,
      color: "text-success",
      background: "bg-lightsuccess",
    },
  ];

  const clearReceivingPhotos = () => {
    receivingPhotos.forEach(({ previewUrl }) => {
      URL.revokeObjectURL(previewUrl);
      receivingPreviewUrls.current.delete(previewUrl);
    });
    setReceivingPhotos([]);
  };

  const selectReceivingPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    const validTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const newPhotos: ReceivingPhoto[] = [];
    const errors: string[] = [];
    const remainingSlots =
      MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS - receivingPhotos.length;

    for (const file of files) {
      if (
        receivingPhotos.length + newPhotos.length >=
        MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS
      ) {
        errors.push(`Maksimal ${MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS} foto.`);
        break;
      }
      if (!validTypes.has(file.type)) {
        errors.push(`${file.name}: format harus JPG, PNG, atau WEBP.`);
        continue;
      }
      if (file.size < 1 || file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: ukuran foto harus maksimal 5 MB.`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      receivingPreviewUrls.current.add(previewUrl);
      newPhotos.push({ file, previewUrl });
    }

    if (newPhotos.length > 0) {
      setReceivingPhotos((current) => [...current, ...newPhotos]);
    }
    setReceivingPurchaseError(errors.join(" "));

    if (files.length > remainingSlots && !errors.length) {
      setReceivingPurchaseError(
        `Maksimal ${MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS} foto.`,
      );
    }
  };

  const submitStockPurchaseReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    receivingPhotos.forEach(({ file }) =>
      formData.append("receivedPhotos", file, file.name),
    );
    setReceivingPurchaseError("");
    setReceivingPurchaseSubmitting(true);
    try {
      const result = await receiveDirectStockPurchase(formData);
      if (!result.success) {
        setReceivingPurchaseError(result.message);
        return;
      }
      setStockNotice(result.message);
      setReceivingPurchase(null);
      clearReceivingPhotos();
      router.refresh();
    } catch (error) {
      console.error("Receiving direct stock purchase failed:", error);
      setReceivingPurchaseError(
        "Penerimaan barang gagal dicatat. Periksa koneksi lalu coba kembali.",
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
              value: { show: true, formatter: (value: string) => `${value} barang` },
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
      setStockFormError("");
      setStockDialogOpen(true);
    };

    const saveStockItem = async () => {
      setStockSubmitting(true);
      setStockFormError("");
      try {
        const result = await saveLogisticsStockItem({
          ...stockDraft,
          ...(editingStockId ? { id: editingStockId } : {}),
        });
        if (!result.success) {
          setStockFormError(result.message);
          return;
        }
        setStockNotice(result.message);
        setStockDialogOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Saving logistics stock item failed:", error);
        setStockFormError("Barang gagal disimpan. Periksa koneksi lalu coba kembali.");
      } finally {
        setStockSubmitting(false);
      }
    };

    const importStockCsv = async (
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      if (file.size > 1_000_000) {
        setStockActionError("File CSV tidak boleh melebihi 1 MB.");
        return;
      }
      setStockImporting(true);
      setStockActionError("");
      try {
        const result = await importLogisticsStockCsv(await file.text());
        if (!result.success) {
          setStockActionError(result.message);
          return;
        }
        setStockNotice(result.message);
        setStockPage(1);
        router.refresh();
      } catch (error) {
        console.error("Importing logistics stock CSV failed:", error);
        setStockActionError("Impor CSV gagal. Periksa file lalu coba kembali.");
      } finally {
        setStockImporting(false);
      }
    };

    const duplicateStockItem = async (item: LogisticsStockItem) => {
      setStockActionError("");
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
          setStockActionError(result.message);
          return;
        }
        setStockNotice(result.message);
        router.refresh();
      } catch (error) {
        console.error("Duplicating logistics stock item failed:", error);
        setStockActionError("Barang gagal diduplikat. Silakan coba kembali.");
      }
    };

    const confirmDeleteStockItem = async () => {
      if (!stockDeleteTarget) return;
      setStockDeleteSubmitting(true);
      setStockDeleteError("");
      try {
        const result = await deleteLogisticsStockItem(stockDeleteTarget.id);
        if (!result.success) {
          setStockDeleteError(result.message);
          return;
        }
        setStockNotice(result.message);
        setStockDeleteTarget(null);
        router.refresh();
      } catch (error) {
        console.error("Deleting logistics stock item failed:", error);
        setStockDeleteError("Barang gagal dihapus. Periksa koneksi lalu coba kembali.");
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
      <div className="my-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Stok Logistik</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {canCreatePurchaseOrder
                ? "Kelola katalog material, pantau ketersediaan, dan ajukan pembelian PO maupun langsung."
                : "Pantau persediaan material dan status pemenuhannya."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreatePurchaseOrder && (
              <>
                <input
                  ref={stockImportInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  aria-label="Pilih file CSV stok"
                  onChange={importStockCsv}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => stockImportInput.current?.click()}
                  disabled={stockImporting}
                >
                  <FileUp aria-hidden="true" />
                  {stockImporting ? "Mengimpor..." : "Import"}
                </Button>
              </>
            )}
            {canCreatePurchaseOrder && (
              <Button
                type="button"
                onClick={() => {
                  setStockNotice("");
                  setPurchaseOpen(true);
                }}
              >
                <Plus aria-hidden="true" />
                Tambah Pembelian
              </Button>
            )}
            <Button type="button" variant="outline" onClick={exportStockCsv}>
              <Download aria-hidden="true" />
              Export
            </Button>
            {canCreatePurchaseOrder && (
              <>
                <Button type="button" variant="outline" onClick={() => openStockEditor()}>
                  <Plus aria-hidden="true" />
                  Tambah Barang
                </Button>
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
                    setStockNotice(message);
                    setPurchaseOpen(false);
                  }}
                />
              </>
            )}
          </div>
        </div>

        {stockNotice && (
          <p
            className="rounded-md border border-success/30 bg-lightsuccess px-4 py-3 text-sm text-success"
            role="status"
          >
            {stockNotice}
          </p>
        )}
        {stockActionError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
            {stockActionError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              note: "Menyentuh batas minimum atau habis",
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
            <CardBox key={label} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                </div>
                <span className={`rounded-md p-2 ${background} ${color}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
              </div>
            </CardBox>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <CardBox className="overflow-hidden p-0 xl:col-span-2">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold">Stok per Material</h3>
              <p className="mt-1 text-sm text-muted-foreground">
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
                <p className="py-24 text-center text-sm text-muted-foreground">
                  Belum ada data persediaan untuk ditampilkan.
                </p>
              )}
            </div>
          </CardBox>
          <CardBox className="overflow-hidden p-0">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold">Kondisi Persediaan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
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
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                        {group.label}
                      </span>
                      <span className="font-medium">{group.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-24 text-center text-sm text-muted-foreground">
                Belum ada data kondisi stok.
              </p>
            )}
          </CardBox>
        </div>

        <CardBox className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="font-semibold">Katalog Material</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {canCreatePurchaseOrder
                  ? "Kelola katalog barang dan pantau kebutuhan restock."
                  : "Stok ditampilkan dalam mode baca saja untuk role Anda."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
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
                  className="w-52 pl-9"
                />
              </div>
              <Select
                value={stockFilter}
                onValueChange={(value) => {
                  setStockFilter(value);
                  setStockPage(1);
                }}
              >
                <SelectTrigger aria-label="Filter kondisi stok" className="w-40">
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
            <div className="overflow-x-auto">
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
                              <span className="block font-medium">{item.name}</span>
                              <span className="text-xs text-muted-foreground">
                                SKU: {item.sku}
                              </span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="gray">Material</Badge>
                        </TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>{currency.format(Number(item.unitPrice))}</TableCell>
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
                            {new Intl.NumberFormat("id-ID").format(quantity)} {item.unit}
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
                        <TableCell>
                          {stockDateLabel.format(new Date(item.createdAt))}
                        </TableCell>
                        <TableCell>
                          {currency.format(quantity * Number(item.unitPrice))}
                        </TableCell>
                        {canCreatePurchaseOrder && (
                          <TableCell>
                            <Tooltip>
                              <DropdownMenu>
                                <TooltipTrigger asChild>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="size-10"
                                      aria-label={`Aksi untuk ${item.name}`}
                                    >
                                      <MoreHorizontal aria-hidden="true" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <DropdownMenuContent align="end" className="w-44">
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
                                    Lihat Detail
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => void duplicateStockItem(item)}
                                  >
                                    <Copy aria-hidden="true" />
                                    Duplikat
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => {
                                      setStockDeleteError("");
                                      setStockDeleteTarget(item);
                                    }}
                                  >
                                    <Trash2 aria-hidden="true" />
                                    Hapus
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <TooltipContent>Aksi barang {item.name}</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {!visibleStockItems.length && (
                    <TableRow>
                      <TableCell
                        colSpan={canCreatePurchaseOrder ? 10 : 8}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Tidak ada barang yang cocok dengan pencarian atau filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Belum ada barang persediaan. Tambahkan barang baru atau jalankan{" "}
              <code>npm run db:seed:inventory</code> untuk memuat lima barang contoh.
            </p>
          )}
          {stockItems.length > 0 && (
            <TablePaginationControls
              count={visibleStockItems.length}
              pageSize={stockPageSize}
              page={currentStockPage}
              itemLabel="barang"
              onPageChange={setStockPage}
            />
          )}
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-semibold">Pembelian Langsung</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Stok diperbarui hanya setelah Logistik mencatat penerimaan dan foto bukti.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Pembelian</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Tiket / Permintaan</TableHead>
                  <TableHead>Barang</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice / BON Faktur</TableHead>
                  <TableHead>Penerimaan</TableHead>
                  {canCreatePurchaseOrder && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockPurchases.map((purchase) => {
                  const receiptPhotos =
                    purchase.receivedPhotos.length > 0
                      ? purchase.receivedPhotos
                      : purchase.arrivalPhotoUrl
                        ? [purchase.arrivalPhotoUrl]
                        : [];
                  return (
                  <TableRow key={purchase.id}>
                    <TableCell className="font-medium">
                      {purchase.purchaseNumber}
                      <p className="text-xs font-normal text-muted-foreground">
                        {stockDateLabel.format(new Date(purchase.createdAt))}
                      </p>
                    </TableCell>
                    <TableCell>{purchase.vendorName}</TableCell>
                    <TableCell>
                      {purchase.ticket ? (
                        <Link
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          href={`/apps/logistics?tab=tickets&openSheet=${encodeURIComponent(purchase.ticket.id)}`}
                        >
                          {purchase.ticket.ticketNumber}
                          <span className="block max-w-48 truncate text-xs font-normal text-muted-foreground">
                            {purchase.ticket.title}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p>{purchase.items.map((item) => item.itemName).join(", ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {purchase.items
                          .map((item) => `${item.quantity} ${item.unit}`)
                          .join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell>{currency.format(Number(purchase.totalAmount))}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          purchase.status === "RECEIVED" ? "lightSuccess" : "lightWarning"
                        }
                      >
                        {purchase.status === "RECEIVED"
                          ? "Diterima"
                          : !purchase.isApprovedByDirector
                            ? "Menunggu persetujuan Direktur"
                            : !purchase.vendorInvoiceUrl
                              ? "Menunggu invoice/bon Logistik"
                            : !purchase.hasFinanceProof
                              ? "Menunggu pembayaran Keuangan"
                              : "Siap diterima Logistik"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {purchase.vendorInvoiceUploadedAt && (
                          <>
                          <p>
                            {stockDateLabel.format(
                              new Date(purchase.vendorInvoiceUploadedAt),
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {purchase.vendorInvoiceUploadedBy?.name ??
                              "Logistik"}
                          </p>
                          </>
                        )}
                        <DirectPurchaseInvoiceAction
                          purchase={purchase}
                          onPreview={(url, label) => {
                            setStockReceiptPreviewFailed(false);
                            setStockReceiptPreview({ url, label });
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      {purchase.receivedAt ? (
                        <>
                          <p>
                            {stockDateLabel.format(new Date(purchase.receivedAt))}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {purchase.receivedBy?.name ?? "Logistik"}
                          </p>
                        </>
                      ) : (
                        "—"
                      )}
                      {receiptPhotos.map((photo, index) => (
                        <ActionIconButton
                          key={photo}
                          type="button"
                          label={`Lihat foto penerimaan ${index + 1} pembelian ${purchase.purchaseNumber}`}
                          tooltip={`Lihat foto penerimaan ${index + 1}`}
                          icon={Eye}
                          onClick={() => {
                            setStockReceiptPreviewFailed(false);
                            setStockReceiptPreview({
                              url: photo,
                              label: `${purchase.purchaseNumber} · Foto penerimaan ${index + 1}`,
                            });
                          }}
                        />
                      ))}
                    </TableCell>
                    {canCreatePurchaseOrder && (
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          {purchase.status === "PENDING_RECEIPT" &&
                            purchase.isApprovedByDirector &&
                            purchase.hasFinanceProof && (
                              <ActionIconButton
                                type="button"
                                label={`Terima barang pembelian ${purchase.purchaseNumber}`}
                                tooltip="Terima Barang"
                                icon={PackageOpen}
                                onClick={() => {
                                  setReceivingPurchaseError("");
                                  clearReceivingPhotos();
                                  setReceivingPurchase(purchase);
                                }}
                              />
                            )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
                {stockPurchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canCreatePurchaseOrder ? 9 : 8}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Belum ada pembelian langsung.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardBox>

        {canCreatePurchaseOrder && (
          <GlobalModal
            isOpen={stockDialogOpen}
            onClose={() => {
              setStockDialogOpen(false);
              setStockFormError("");
            }}
            title={editingStockId ? "Edit Barang Persediaan" : "Tambah Barang Persediaan"}
            description="Perbarui katalog material dan saldo stok yang tercatat."
            className="sm:max-w-xl"
          >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="stock-item-name">Nama barang</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="stock-item-sku">SKU</Label>
                  <Input
                    id="stock-item-sku"
                    value={stockDraft.sku}
                    placeholder={
                      editingStockId ? "Masukkan SKU" : "Dibuat otomatis saat disimpan"
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
                  {!editingStockId && (
                    <p className="text-xs text-muted-foreground">
                      Sistem akan membuat SKU unik secara otomatis.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stock-item-unit">Satuan</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="stock-item-price">Harga satuan (Rp)</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="stock-item-quantity">Stok tersedia</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="stock-item-minimum">Batas minimum</Label>
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
              {stockFormError && (
                <p className="text-sm text-destructive" role="alert">
                  {stockFormError}
                </p>
              )}
              <div className="flex justify-end gap-2">
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
              </div>
          </GlobalModal>
        )}
        <GlobalModal
          isOpen={stockDetail !== null}
          onClose={() => setStockDetail(null)}
          title="Detail Barang"
          description="Informasi katalog dan posisi stok material."
          className="sm:max-w-md"
        >
            {stockDetail && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Nama Barang</dt>
                <dd className="text-right font-medium">{stockDetail.name}</dd>
                <dt className="text-muted-foreground">SKU</dt>
                <dd className="text-right font-medium">{stockDetail.sku}</dd>
                <dt className="text-muted-foreground">Satuan</dt>
                <dd className="text-right font-medium">{stockDetail.unit}</dd>
                <dt className="text-muted-foreground">Stok Tersedia</dt>
                <dd className="text-right font-medium">
                  {new Intl.NumberFormat("id-ID").format(
                    Number(stockDetail.stockQuantity),
                  )}{" "}
                  {stockDetail.unit}
                </dd>
                <dt className="text-muted-foreground">Batas Minimum</dt>
                <dd className="text-right font-medium">
                  {new Intl.NumberFormat("id-ID").format(
                    Number(stockDetail.minimumStock),
                  )}{" "}
                  {stockDetail.unit}
                </dd>
                <dt className="text-muted-foreground">Harga Satuan</dt>
                <dd className="text-right font-medium">
                  {currency.format(Number(stockDetail.unitPrice))}
                </dd>
                <dt className="text-muted-foreground">Nilai Persediaan</dt>
                <dd className="text-right font-medium">
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
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStockDetail(null)}
              >
                Tutup
              </Button>
            </div>
        </GlobalModal>
        <GlobalModal
          isOpen={stockDeleteTarget !== null}
          onClose={() => {
            if (stockDeleteSubmitting) return;
            setStockDeleteTarget(null);
            setStockDeleteError("");
          }}
          title="Hapus Barang Persediaan?"
          description="Barang ini akan dihapus permanen dari katalog dan tidak dapat dipilih untuk PO baru. Riwayat tiket yang sudah dibuat tidak terhapus."
          className="sm:max-w-md"
          footerNote="Tindakan ini tidak dapat dibatalkan."
        >
            {stockDeleteTarget && (
              <div className="rounded-md border border-border bg-muted p-3 text-sm">
                <p className="font-medium">{stockDeleteTarget.name}</p>
                <p className="text-muted-foreground">
                  SKU: {stockDeleteTarget.sku}
                </p>
              </div>
            )}
            {stockDeleteError && (
              <p className="text-sm text-destructive" role="alert">
                {stockDeleteError}
              </p>
            )}
            <div className="flex justify-end gap-2">
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
                {stockDeleteSubmitting ? "Menghapus..." : "Hapus Permanen"}
              </Button>
            </div>
        </GlobalModal>
        <GlobalModal
          isOpen={receivingPurchase !== null}
          onClose={() => {
            if (receivingPurchaseSubmitting) return;
            setReceivingPurchase(null);
            setReceivingPurchaseError("");
            clearReceivingPhotos();
          }}
          title="Terima Pembelian Stok"
          description={
            receivingPurchase
              ? `${receivingPurchase.purchaseNumber} · ${receivingPurchase.vendorName}. Stok bertambah setelah penerimaan ini tersimpan.`
              : "Unggah foto sebagai bukti barang telah tiba di gudang."
          }
          className="sm:max-w-lg"
        >
            {receivingPurchase && (
              <form
                className="space-y-4"
                onSubmit={submitStockPurchaseReceipt}
              >
                <input
                  type="hidden"
                  name="purchaseId"
                  value={receivingPurchase.id}
                />
                <div className="space-y-3">
                  <Label>Foto bukti barang tiba</Label>
                  <input
                    ref={receivingPhotoInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={selectReceivingPhotos}
                    disabled={
                      receivingPurchaseSubmitting ||
                      receivingPhotos.length >=
                        MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS
                    }
                    aria-label="Pilih foto bukti barang tiba"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => receivingPhotoInput.current?.click()}
                    disabled={
                      receivingPurchaseSubmitting ||
                      receivingPhotos.length >=
                        MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS
                    }
                  >
                    <FileUp aria-hidden="true" />
                    Pilih Foto ({receivingPhotos.length}/
                    {MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS})
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Foto disimpan di formulir terlebih dahulu dan baru diunggah
                    ke Cloudinary saat Anda menekan Terima Barang. Pilih 1–
                    {MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS} foto JPG, PNG,
                    atau WEBP; maksimal 5 MB per foto.
                  </p>
                  {receivingPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {receivingPhotos.map((photo, index) => (
                        <div
                          key={photo.previewUrl}
                          className="relative aspect-[4/3] overflow-hidden rounded-md border"
                        >
                          <Image
                            src={photo.previewUrl}
                            alt={`Bukti penerimaan ${index + 1}`}
                            fill
                            unoptimized
                            className="object-cover"
                            sizes="(max-width: 640px) 30vw, 140px"
                          />
                          <ActionIconButton
                            label={`Hapus foto ${index + 1}`}
                            tooltip={`Hapus foto ${index + 1}`}
                            icon={X}
                            variant="destructive"
                            className="absolute right-1 top-1"
                            onClick={() => {
                              URL.revokeObjectURL(photo.previewUrl);
                              receivingPreviewUrls.current.delete(
                                photo.previewUrl,
                              );
                              setReceivingPhotos((current) =>
                                current.filter(
                                  (currentPhoto) =>
                                    currentPhoto.previewUrl !==
                                    photo.previewUrl,
                                ),
                              );
                            }}
                            disabled={receivingPurchaseSubmitting}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {receivingPurchaseError && (
                  <p className="text-sm text-destructive" role="alert">
                    {receivingPurchaseError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setReceivingPurchase(null)}
                    disabled={receivingPurchaseSubmitting}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      receivingPurchaseSubmitting ||
                      receivingPhotos.length === 0 ||
                      receivingPhotos.length >
                        MAX_DIRECT_STOCK_PURCHASE_RECEIPT_PHOTOS
                    }
                  >
                    {receivingPurchaseSubmitting
                      ? "Mengunggah foto dan mencatat..."
                      : "Terima Barang"}
                  </Button>
                </div>
              </form>
            )}
        </GlobalModal>
        <GlobalModal
          isOpen={stockReceiptPreview !== null}
          onClose={() => {
            setStockReceiptPreview(null);
            setStockReceiptPreviewFailed(false);
          }}
          title={stockReceiptPreview?.label ?? "Bukti penerimaan"}
          description="Pratinjau foto bukti penerimaan barang."
          className="sm:max-w-5xl"
        >
            {stockReceiptPreview && (
              <>
                <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 sm:min-h-[60vh]">
                  {stockReceiptPreviewFailed ? (
                    <p className="max-w-lg p-6 text-center text-sm text-muted-foreground" role="status">
                      Foto ini tidak dapat dimuat. Jika URL menggunakan rute
                      penyimpanan lokal lama, file sumbernya mungkin sudah tidak
                      tersedia di server asal. Foto baru akan tersimpan di
                      Cloudinary.
                    </p>
                  ) : (
                    <Image
                      src={stockReceiptPreview.url}
                      alt={stockReceiptPreview.label}
                      fill
                      unoptimized
                      className="object-contain"
                      sizes="(max-width: 640px) 100vw, 80vw"
                      onError={() => setStockReceiptPreviewFailed(true)}
                    />
                  )}
                </div>
              </>
            )}
        </GlobalModal>
      </div>
    );
  }

  return (
    <div className="my-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Manajemen Logistik</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau permintaan material, status pemenuhan, dan pengiriman.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download className="size-4" aria-hidden="true" />
            Export
          </Button>
          {role !== "MOVER" && (
            <CreateTicketModal
              projects={projects}
              stockItems={stockItems}
              requesterRole={role}
              triggerLabel="Order Baru"
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, filter, Icon, color, background }) => (
          <button
            key={label}
            type="button"
            className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${label}: ${value}. ${note}`}
            onClick={() => {
              setStatusFilter(filter);
              setSearch("");
            }}
          >
            <CardBox className="h-full p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{note}</p>
                </div>
                <span className={`rounded-md p-2 ${background} ${color}`}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
              </div>
            </CardBox>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <CardBox className="overflow-hidden p-0 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="font-semibold">Tren Pesanan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
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
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Tidak ada pesanan dalam {period} hari terakhir.
              </div>
            )}
          </div>
        </CardBox>

        <CardBox className="overflow-hidden p-0">
          <div className="border-b border-border px-5 py-4">
            <h3 className="font-semibold">Status Pesanan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
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
                    className="flex items-center justify-between gap-3 text-sm"
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
            <p className="p-8 text-center text-sm text-muted-foreground">
              Belum ada pesanan material.
            </p>
          )}
        </CardBox>
      </div>

      <CardBox className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="font-semibold">Pesanan Material</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Lihat rincian, lacak aktivitas, dan lanjutkan proses pemenuhan.
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
              <SelectTrigger className="w-full sm:w-48" aria-label="Filter status">
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
        <div className="px-5">
          <TicketListing
            tickets={visibleTickets}
            projects={projects}
            vendors={vendors}
            stockItems={stockItems}
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
