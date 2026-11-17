"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Plus, Send, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  FulfillmentStatus,
  POPaymentMethod,
  POStatus,
  TicketCategoryHint,
} from "@prisma/client";
import type { VehicleSummary } from "@/app/actions/vehicles";
import {
  createLogisticsPurchaseOrderForTicket,
  processLogisticsMaterial,
} from "@/app/actions/tickets";
import { markPurchaseOrderSentToVendor } from "@/app/actions/orders";
import CreatePOForm from "@/app/components/forms/CreatePOForm";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DialogClose } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";
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
import InvoiceDetailsFields, {
  type InvoiceDraft,
} from "@/app/components/apps/logistics/InvoiceDetailsFields";
import InvoiceFilePreview from "@/app/components/apps/logistics/InvoiceFilePreview";
import {
  formatRupiahInput,
  parseRupiahInput,
} from "@/lib/indonesian-currency";
import {
  getVendorBankAccounts,
  type VendorBankAccountOption,
} from "@/lib/vendor-bank-accounts";
import { cn } from "@/lib/utils";

type LogisticsVendorOption = {
  id: string;
  name: string;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  bankAccounts?: VendorBankAccountOption[];
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

function createInvoiceDraft(
  items: NonNullable<
    NonNullable<TicketRow["purchaseOrders"]>[number]["items"]
  > = [],
  includeTax = false,
): InvoiceDraft {
  const invoiceItems = items.map((item) => ({
    itemCode: item.itemCode ?? "",
    description: item.itemName,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
  }));
  return {
    invoiceNumber: "",
    periodOrDate: new Date().toLocaleDateString("id-ID"),
    tax: includeTax
      ? Math.round(
          invoiceItems.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice,
            0,
          ) * 0.11,
        )
      : 0,
    deduction: 0,
    items: invoiceItems,
  };
}

function DeliveryOrderRowCard({
  deliveryOrder,
}: {
  deliveryOrder: NonNullable<TicketRow["deliveryOrders"]>[number];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="type-p2 font-semibold text-foreground">
          {deliveryOrder.doNumber}
        </span>
        <Badge variant="outline">{deliveryOrder.status}</Badge>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={`/d/${deliveryOrder.publicCode}`}>
          <FileText className="size-3.5" aria-hidden="true" />
          Cetak DO
        </a>
      </Button>
    </div>
  );
}

function PurchaseOrderRowCard({
  po,
  isSelected,
  isPending,
  sendingPoCode,
  onSelect,
  onMarkSent,
}: {
  po: NonNullable<TicketRow["purchaseOrders"]>[number];
  isSelected: boolean;
  isPending: boolean;
  sendingPoCode: string | null;
  onSelect: (publicCode: string) => void;
  onMarkSent: (publicCode: string) => void;
}) {
  const isApproved = po.status === POStatus.APPROVED;
  const isPaid = Boolean(po.paidAt);

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border p-3 transition-colors",
        isSelected ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect(po.publicCode)}
          className="text-left"
        >
          <p className="type-p2 font-semibold text-foreground">
            PO {po.poNumber}
          </p>
          <p className="type-p3 text-muted-foreground">{po.vendorName}</p>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={
              isPaid || (isApproved && po.vendorInvoiceUrl)
                ? "lightSuccess"
                : "lightWarning"
            }
          >
            {isPaid
              ? "Lunas"
              : isApproved && po.vendorInvoiceUrl
                ? "Menunggu Finance"
                : isApproved
                  ? "Siap Upload Invoice"
                  : po.status === POStatus.PENDING_APPROVAL
                    ? "Menunggu Direktur"
                    : po.status === POStatus.REJECTED
                      ? "Ditolak"
                      : po.status === POStatus.CANCELLED
                        ? "Dibatalkan"
                        : "Menunggu Finance"}
          </Badge>
          <Button asChild size="icon" variant="outline" aria-label={`Cetak PO ${po.poNumber}`}>
            <a href={`/d/${po.publicCode}`}>
              <FileText className="size-4" aria-hidden="true" />
            </a>
          </Button>
          {isApproved && !po.vendorPoSentAt && !isPaid && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onMarkSent(po.publicCode)}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {sendingPoCode === po.publicCode
                ? "Mengirim..."
                : "Kirim Vendor"}
            </Button>
          )}
        </div>
      </div>

      {po.invoiceId && (
        <div>
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/documents/transactions?kind=INVOICE&id=${encodeURIComponent(po.invoiceId)}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Cetak Invoice
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

function DirectVendorPurchasePanel({
  ticket,
  pendingItems,
  vendors,
  onCreated,
  onCancel,
}: {
  ticket: TicketRow;
  pendingItems: TicketRow["items"];
  vendors: LogisticsVendorOption[];
  onCreated: (publicCode: string, message: string) => void;
  onCancel?: () => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<
    "CASH_FULL" | "DOWN_PAYMENT" | "INSTALLMENT"
  >("CASH_FULL");
  const [downPaymentPercent, setDownPaymentPercent] = useState("");
  const [paymentPlanDetails, setPaymentPlanDetails] = useState("");
  const [includeTax, setIncludeTax] = useState(false);
  const [unitPrices, setUnitPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pendingItems.map((item) => [
        item.id,
        item.estimatedCost && Number(item.estimatedCost) > 0
          ? formatRupiahInput(String(item.estimatedCost))
          : "",
      ]),
    ),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const vendorOptions = useMemo<ComboboxOption[]>(
    () =>
      vendors.map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
        description: vendor.bankName
          ? `${vendor.bankName} · ${vendor.bankAccount ?? ""}`
          : "Pembayaran tunai / belum ada rekening",
        keywords: [vendor.name, vendor.bankName ?? ""],
      })),
    [vendors],
  );

  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);
  const vendorBankAccounts = selectedVendor
    ? getVendorBankAccounts(selectedVendor)
    : [];
  const selectedBank =
    vendorBankAccounts.find((account) => account.id === bankAccountId) ??
    vendorBankAccounts.find((account) => account.isPrimary) ??
    vendorBankAccounts[0];
  const hasBankDetails = Boolean(
    selectedBank?.bankName &&
      selectedBank.bankAccount &&
      selectedBank.bankHolder,
  );
  const paymentMethod = hasBankDetails
    ? POPaymentMethod.TRANSFER
    : POPaymentMethod.CASH;

  const subtotal = pendingItems.reduce((sum, item) => {
    const unitPrice = parseRupiahInput(unitPrices[item.id] ?? "");
    return sum + item.quantity * (unitPrice > 0 ? unitPrice : 0);
  }, 0);
  const taxAmount = includeTax ? subtotal * 0.11 : 0;
  const grandTotal = subtotal + taxAmount;

  const handleSubmit = () => {
    setErrorMessage("");
    if (!selectedVendor) {
      setErrorMessage("Pilih vendor penyedia terlebih dahulu.");
      return;
    }
    const itemsPayload = pendingItems.map((item) => ({
      ticketItemId: item.id,
      stockItemId: item.stockItemId ?? null,
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: parseRupiahInput(unitPrices[item.id] ?? ""),
    }));
    if (itemsPayload.some((item) => !item.unitPrice || item.unitPrice <= 0)) {
      setErrorMessage("Lengkapi harga satuan (> 0) untuk seluruh item.");
      return;
    }
    const parsedDp = Number(downPaymentPercent);
    if (
      paymentPlan === "DOWN_PAYMENT" &&
      (!Number.isFinite(parsedDp) || parsedDp <= 0 || parsedDp >= 100)
    ) {
      setErrorMessage("Masukkan persentase DP antara 1% dan 99%.");
      return;
    }
    if (paymentPlan === "INSTALLMENT" && !paymentPlanDetails.trim()) {
      setErrorMessage("Isi rincian termin pembayaran.");
      return;
    }

    const planLabel =
      paymentPlan === "CASH_FULL"
        ? "CASH (LUNAS)"
        : paymentPlan === "DOWN_PAYMENT"
          ? "DP (DOWN PAYMENT)"
          : "TERMIN (CICIL)";
    const dpAmount =
      paymentPlan === "DOWN_PAYMENT"
        ? Math.round(grandTotal * (parsedDp / 100))
        : 0;
    const paymentTerms = [
      planLabel,
      paymentPlan === "DOWN_PAYMENT"
        ? `DP ${parsedDp}% (${formatCurrency(dpAmount)}), sisa ${formatCurrency(Math.max(0, grandTotal - dpAmount))}`
        : paymentPlanDetails.trim(),
    ]
      .filter(Boolean)
      .join(" - ");

    startTransition(async () => {
      try {
        const result = await createLogisticsPurchaseOrderForTicket(
          ticket.id,
          selectedVendor.name,
          itemsPayload,
          {
            vendorId: selectedVendor.id,
            method: paymentMethod,
            vendorBankAccountId: selectedBank?.id,
            includeTax,
            paymentTerms,
          },
        );
        if (result.success && result.publicCode) {
          toast.success(result.message);
          onCreated(result.publicCode, result.message);
        } else {
          setErrorMessage(result.message);
          toast.error(result.message);
        }
      } catch (err) {
        console.error("Direct vendor PO creation failed:", err);
        setErrorMessage("Gagal menerbitkan PO vendor langsung.");
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div>
        <h3 className="type-h3 text-foreground">
          Pembelian Vendor Langsung (Tanpa Mapping Gudang)
        </h3>
        <p className="type-p3 text-muted-foreground">
          Cocok untuk Material Alam atau barang non-stok yang dikirim langsung
          dari vendor ke proyek.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="direct-vendor-picker" className="type-p2 font-medium">
            Vendor Penyedia <span className="text-destructive">*</span>
          </Label>
          <Combobox
            id="direct-vendor-picker"
            options={vendorOptions}
            value={vendorId}
            placeholder="Cari & pilih vendor..."
            searchPlaceholder="Ketik nama vendor..."
            emptyText="Vendor tidak ditemukan."
            onValueChange={(nextId) => {
              setVendorId(nextId);
              setBankAccountId("");
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="type-p2 font-medium">Rekening Vendor</Label>
          {vendorBankAccounts.length > 0 ? (
            <Select
              value={selectedBank?.id ?? ""}
              onValueChange={setBankAccountId}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue placeholder="Pilih rekening" />
              </SelectTrigger>
              <SelectContent>
                {vendorBankAccounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.bankName} · {acc.bankAccount} ({acc.bankHolder})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="type-p3 flex h-10 items-center rounded-md border border-border bg-card px-3 text-muted-foreground">
              {selectedVendor ? "Tunai (Cash)" : "Pilih vendor terlebih dahulu"}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="type-p2 font-medium">
          Harga Satuan per Item <span className="text-destructive">*</span>
        </Label>
        <div className="space-y-2">
          {pendingItems.map((item) => {
            const unitPrice = parseRupiahInput(unitPrices[item.id] ?? "");
            return (
              <div
                key={item.id}
                className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="type-p2 truncate font-semibold text-foreground">
                    {item.itemName}
                  </p>
                  <p className="type-p3 text-muted-foreground">
                    {item.quantity} {item.unit}
                    {unitPrice > 0
                      ? ` · Subtotal ${formatCurrency(item.quantity * unitPrice)}`
                      : ""}
                  </p>
                </div>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="type-p2 pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
                  >
                    Rp
                  </span>
                  <Input
                    inputMode="decimal"
                    className="pl-10"
                    placeholder="Harga satuan"
                    value={unitPrices[item.id] ?? ""}
                    onChange={(event) =>
                      setUnitPrices((prev) => ({
                        ...prev,
                        [item.id]: formatRupiahInput(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="type-p2 font-medium">Skema Pembayaran</Label>
          <Select
            value={paymentPlan}
            onValueChange={(value) =>
              setPaymentPlan(
                value as "CASH_FULL" | "DOWN_PAYMENT" | "INSTALLMENT",
              )
            }
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH_FULL">Cash (Lunas)</SelectItem>
              <SelectItem value="DOWN_PAYMENT">DP (Uang Muka)</SelectItem>
              <SelectItem value="INSTALLMENT">Termin / Cicil</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end pb-2">
          <Label
            htmlFor="direct-vendor-tax"
            className="flex cursor-pointer items-center gap-2"
          >
            <Checkbox
              id="direct-vendor-tax"
              checked={includeTax}
              onCheckedChange={(checked) => setIncludeTax(checked === true)}
            />
            <span className="type-p2 font-medium">Sertakan PPN 11%</span>
          </Label>
        </div>
      </div>

      {paymentPlan === "DOWN_PAYMENT" && (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label className="type-p2 font-medium">Persentase DP (%)</Label>
          <Input
            type="number"
            min="1"
            max="99"
            placeholder="Contoh: 30"
            value={downPaymentPercent}
            onChange={(event) => setDownPaymentPercent(event.target.value)}
          />
        </div>
      )}

      {paymentPlan === "INSTALLMENT" && (
        <div className="space-y-1.5">
          <Label className="type-p2 font-medium">Rincian Termin</Label>
          <Input
            placeholder="Contoh: Termin 1 50% kirim, Termin 2 50% selesai"
            value={paymentPlanDetails}
            onChange={(event) => setPaymentPlanDetails(event.target.value)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div>
          <span className="type-p3 text-muted-foreground">Total PO: </span>
          <span className="type-p1 font-bold text-primary tabular-nums">
            {formatCurrency(grandTotal)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={onCancel}
            >
              Batal
            </Button>
          )}
          <Button
            type="button"
            size="default"
            disabled={isPending || grandTotal <= 0 || !selectedVendor}
            onClick={handleSubmit}
          >
            {isPending ? "Menyimpan..." : "Buat PO"}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <p className="type-p2 text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export default function LogisticsActionModal({
  open,
  ticket,
  vendors,
  stockItems,
  vehicles,
  onOpenChange,
  onSuccess,
  onOpenContractDo,
}: {
  open: boolean;
  ticket: TicketRow;
  vendors: LogisticsVendorOption[];
  stockItems: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    unitPrice: string;
  }[];
  vehicles: VehicleSummary[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onOpenContractDo?: () => void;
}) {
  const router = useRouter();
  const nonContractItems = ticket.items.filter(
    (item) => item.categoryHint !== TicketCategoryHint.CONTRACT,
  );
  const pendingNonContractItems = nonContractItems.filter(
    (item) =>
      item.status === FulfillmentStatus.PENDING &&
      !item.poItemId &&
      !item.doItemId,
  );
  const pendingContractItems = ticket.items.filter(
    (item) =>
      item.categoryHint === TicketCategoryHint.CONTRACT &&
      item.status === FulfillmentStatus.PENDING,
  );
  const allPurchaseOrders = ticket.purchaseOrders ?? [];
  const allDeliveryOrders = ticket.deliveryOrders ?? [];
  const hasPaidPurchaseOrder = allPurchaseOrders.some((po) =>
    Boolean(po.paidAt),
  );
  const hasPaidPoItemsAwaitingDo =
    nonContractItems.some(
      (item) =>
        item.status === FulfillmentStatus.PROCESSED_TO_PO && !item.doItemId,
    ) && hasPaidPurchaseOrder;
  const hasItemsNeedingNewDo =
    ticket.items.length === 0
      ? allDeliveryOrders.length === 0
      : pendingNonContractItems.length > 0 || hasPaidPoItemsAwaitingDo;

  const approvedUnpaidPos = allPurchaseOrders.filter(
    (po) => po.status === POStatus.APPROVED && !po.paidAt,
  );
  const posNeedingInvoice = approvedUnpaidPos.filter(
    (po) => !po.vendorInvoiceUrl,
  );

  const initialActionType: "READY_WAREHOUSE" | "BUY_STORE" =
    hasPaidPurchaseOrder && hasItemsNeedingNewDo
      ? "READY_WAREHOUSE"
      : pendingNonContractItems.some(
            (item) => item.categoryHint === TicketCategoryHint.PURCHASE,
          ) || posNeedingInvoice.length > 0
        ? "BUY_STORE"
        : "READY_WAREHOUSE";

  const [actionType, setActionType] = useState<"READY_WAREHOUSE" | "BUY_STORE">(
    initialActionType,
  );
  const [poCreateMode, setPoCreateMode] = useState<
    "DIRECT_VENDOR" | "CATALOG_PO"
  >(() =>
    pendingNonContractItems.some(
      (item) =>
        item.categoryHint === TicketCategoryHint.PURCHASE || !item.stockItemId,
    )
      ? "DIRECT_VENDOR"
      : "CATALOG_PO",
  );
  const [selectedPoCode, setSelectedPoCode] = useState<string>("");
  const [creatingNewPo, setCreatingNewPo] = useState(false);
  const [sendingPoCode, setSendingPoCode] = useState<string | null>(null);
  const [invoiceFileState, setInvoiceFileState] = useState<{
    orderCode: string | null;
    file: File | null;
  }>({ orderCode: null, file: null });
  const [invoiceDraftState, setInvoiceDraftState] = useState<{
    orderCode: string | null;
    draft: InvoiceDraft;
  } | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [externalDelivery, setExternalDelivery] = useState({
    vehicleDocumentNumber: "",
    vehiclePlate: "",
    driverName: "",
    driverIdentityNumber: "",
    driverPhone: "",
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedPurchaseOrder =
    allPurchaseOrders.find((po) => po.publicCode === selectedPoCode) ??
    posNeedingInvoice[0] ??
    approvedUnpaidPos[0] ??
    allPurchaseOrders[0];

  const invoiceDraft =
    invoiceDraftState?.orderCode === (selectedPurchaseOrder?.publicCode ?? null)
      ? invoiceDraftState.draft
      : createInvoiceDraft(
          selectedPurchaseOrder?.items,
          selectedPurchaseOrder?.includeTax,
        );
  const invoiceFile =
    invoiceFileState.orderCode === (selectedPurchaseOrder?.publicCode ?? null)
      ? invoiceFileState.file
      : null;

  const selectedOrderApproved =
    selectedPurchaseOrder?.status === POStatus.APPROVED;
  const selectedOrderPaid = Boolean(selectedPurchaseOrder?.paidAt);
  const canUploadInvoiceForSelectedPo =
    !creatingNewPo &&
    Boolean(selectedPurchaseOrder) &&
    selectedOrderApproved &&
    !selectedOrderPaid &&
    !selectedPurchaseOrder?.vendorInvoiceUrl;

  const shouldShowCreatePoForm =
    pendingNonContractItems.length > 0 &&
    (allPurchaseOrders.length === 0 ||
      creatingNewPo ||
      (!canUploadInvoiceForSelectedPo &&
        !allPurchaseOrders.some(
          (po) =>
            po.status === POStatus.PENDING_FINANCE_REVIEW ||
            po.status === POStatus.PENDING_APPROVAL,
        ) &&
        approvedUnpaidPos.length === 0));

  const availableVehicles = vehicles.filter(
    (vehicle) => vehicle.status === "AVAILABLE" && vehicle.odometerInitialized,
  );

  const resetModal = () => {
    setInvoiceFileState({ orderCode: null, file: null });
    setSelectedVehicleId("");
    setSelectedPoCode("");
    setCreatingNewPo(false);
    setMessage("");
    setExternalDelivery({
      vehicleDocumentNumber: "",
      vehiclePlate: "",
      driverName: "",
      driverIdentityNumber: "",
      driverPhone: "",
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionType === "BUY_STORE") {
      if (!selectedPurchaseOrder || creatingNewPo) return;
      if (selectedOrderPaid) {
        setMessage("PO terpilih sudah dibayar. Lanjutkan melalui Surat Jalan.");
        return;
      }
      if (!selectedOrderApproved || selectedPurchaseOrder.vendorInvoiceUrl) {
        return;
      }
      if (!invoiceFile) {
        setMessage("Unggah dokumen invoice/bon sebelum mengirim ke Keuangan.");
        return;
      }
    }
    if (actionType === "READY_WAREHOUSE" && !hasItemsNeedingNewDo) {
      return;
    }
    if (
      actionType === "READY_WAREHOUSE" &&
      hasPaidPurchaseOrder &&
      (!/^[A-Za-z0-9./ -]{3,40}$/.test(externalDelivery.vehiclePlate.trim()) ||
        externalDelivery.driverName.trim().length < 2 ||
        (Boolean(externalDelivery.driverIdentityNumber.trim()) &&
          !/^\d{8,20}$/.test(externalDelivery.driverIdentityNumber.trim())) ||
        (Boolean(externalDelivery.driverPhone.trim()) &&
          !/^[+()\d\s.-]{6,32}$/.test(externalDelivery.driverPhone.trim())))
    ) {
      setMessage("Lengkapi plat nomor dan nama driver ekspedisi dengan benar.");
      return;
    }
    if (
      actionType === "READY_WAREHOUSE" &&
      !hasPaidPurchaseOrder &&
      !selectedVehicleId
    ) {
      setMessage("Pilih kendaraan master sebelum menerbitkan DO.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const result = await processLogisticsMaterial(
          ticket.id,
          actionType,
          actionType === "BUY_STORE" ? (invoiceFile ?? undefined) : undefined,
          actionType === "READY_WAREHOUSE" && hasPaidPurchaseOrder
            ? externalDelivery
            : undefined,
          actionType === "READY_WAREHOUSE" && !hasPaidPurchaseOrder
            ? selectedVehicleId
            : undefined,
          actionType === "BUY_STORE" ? invoiceDraft : undefined,
          actionType === "BUY_STORE"
            ? selectedPurchaseOrder?.publicCode
            : undefined,
        );
        if (result.success) {
          toast.success(result.message);
          resetModal();
          onOpenChange(false);
          onSuccess();
          if (actionType === "READY_WAREHOUSE" && result.publicCode) {
            router.push(`/d/${result.publicCode}`);
          }
        } else {
          setMessage(result.message);
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Logistics ticket action failed:", error);
        const errorMsg = "Proses logistik gagal. Silakan coba kembali.";
        setMessage(errorMsg);
        toast.error(errorMsg);
      }
    });
  };

  const handleMarkPoSentToVendor = (poPublicCode: string) => {
    setMessage("");
    setSendingPoCode(poPublicCode);
    startTransition(async () => {
      try {
        const result = await markPurchaseOrderSentToVendor(poPublicCode);
        if (result.success) {
          toast.success(result.message);
          onSuccess();
        } else {
          setMessage(result.message);
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Failed to mark PO sent to vendor:", error);
        setMessage("Gagal mencatat pengiriman PO ke vendor.");
      } finally {
        setSendingPoCode(null);
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => {
        resetModal();
        onOpenChange(false);
      }}
      title="Proses Logistik"
      description={
        hasItemsNeedingNewDo
          ? "Kelola pengadaan vendor langsung, unggah invoice PO, atau terbitkan DO pengiriman."
          : "Pantau Surat Jalan, Kontrak Material Alam, atau dokumen PO tiket ini."
      }
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              Tutup
            </Button>
          </DialogClose>
          {(actionType === "READY_WAREHOUSE" && hasItemsNeedingNewDo) ||
          (actionType === "BUY_STORE" && canUploadInvoiceForSelectedPo) ? (
            <Button
              type="submit"
              form="logistics-action-form"
              disabled={
                isPending ||
                (actionType === "BUY_STORE" &&
                  canUploadInvoiceForSelectedPo &&
                  !invoiceFile)
              }
            >
              {isPending
                ? "Memproses..."
                : actionType === "READY_WAREHOUSE"
                  ? hasPaidPurchaseOrder
                    ? "Kirim Ekspedisi"
                    : "Terbitkan DO"
                  : "Unggah Invoice"}
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id="logistics-action-form"
        className="space-y-4"
        onSubmit={submit}
      >
        {pendingContractItems.length > 0 && (
          <section className="space-y-2 rounded-xl border border-teal-500/30 bg-teal-500/10 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="type-h3 text-foreground">
                  Material Alam ({pendingContractItems.length} item kontrak)
                </h3>
                <p className="type-p3 text-muted-foreground">
                  Dikirim langsung oleh vendor kontrak tanpa mapping stok
                  gudang.
                </p>
              </div>
              {onOpenContractDo && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenContractDo();
                  }}
                >
                  <Truck className="size-3.5" aria-hidden="true" />
                  DO Kontrak
                </Button>
              )}
            </div>
          </section>
        )}

        {allDeliveryOrders.length > 0 && (
          <section className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="type-h3 text-foreground">
                Surat Jalan ({allDeliveryOrders.length})
              </h3>
              {!hasItemsNeedingNewDo && (
                <Badge variant="lightSuccess">Semua item siap</Badge>
              )}
            </div>
            <div className="space-y-2">
              {allDeliveryOrders.map((deliveryOrder) => (
                <DeliveryOrderRowCard
                  key={deliveryOrder.publicCode}
                  deliveryOrder={deliveryOrder}
                />
              ))}
            </div>
          </section>
        )}

        {nonContractItems.length > 0 && (
          <RadioGroup
            value={actionType}
            onValueChange={(value) => {
              if (value === "READY_WAREHOUSE" || value === "BUY_STORE") {
                setActionType(value);
              }
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <Label
              htmlFor="logistics-mode-warehouse"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                actionType === "READY_WAREHOUSE"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <RadioGroupItem
                id="logistics-mode-warehouse"
                value="READY_WAREHOUSE"
              />
              <div>
                <span className="type-p2 block font-semibold text-foreground">
                  {hasPaidPurchaseOrder
                    ? "Kirim Ekspedisi"
                    : "Kirim dari Gudang"}
                </span>
                <span className="type-p3 block text-muted-foreground">
                  {hasPaidPurchaseOrder
                    ? "Terbitkan DO ekspedisi untuk PO lunas"
                    : "Terbitkan DO mover dari stok gudang"}
                </span>
              </div>
            </Label>

            <Label
              htmlFor="logistics-mode-buy"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                actionType === "BUY_STORE"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card",
              )}
            >
              <RadioGroupItem id="logistics-mode-buy" value="BUY_STORE" />
              <div>
                <span className="type-p2 block font-semibold text-foreground">
                  Kelola PO &amp; Vendor
                </span>
                <span className="type-p3 block text-muted-foreground">
                  {pendingNonContractItems.length > 0
                    ? `${pendingNonContractItems.length} item belum PO · ${allPurchaseOrders.length} PO`
                    : `${allPurchaseOrders.length} PO tercatat`}
                </span>
              </div>
            </Label>
          </RadioGroup>
        )}

        {actionType === "READY_WAREHOUSE" &&
          hasItemsNeedingNewDo &&
          hasPaidPurchaseOrder && (
            <section className="grid gap-3 rounded-xl border border-border p-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="external-vehicle-document" className="type-p2">
                  No. STNK / STK (opsional)
                </Label>
                <Input
                  id="external-vehicle-document"
                  value={externalDelivery.vehicleDocumentNumber}
                  maxLength={80}
                  placeholder="No. STNK"
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      vehicleDocumentNumber: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="external-vehicle-plate" className="type-p2">
                  Plat Nomor <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="external-vehicle-plate"
                  value={externalDelivery.vehiclePlate}
                  maxLength={40}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      vehiclePlate: event.target.value.toUpperCase(),
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="external-driver-name" className="type-p2">
                  Nama Driver <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="external-driver-name"
                  value={externalDelivery.driverName}
                  maxLength={180}
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      driverName: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="external-driver-nik" className="type-p2">
                  NIK Driver (opsional)
                </Label>
                <Input
                  id="external-driver-nik"
                  inputMode="numeric"
                  value={externalDelivery.driverIdentityNumber}
                  maxLength={16}
                  placeholder="16 digit NIK"
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      driverIdentityNumber: event.target.value.replace(
                        /\D/g,
                        "",
                      ),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="external-driver-phone" className="type-p2">
                  No. HP Driver (opsional)
                </Label>
                <Input
                  id="external-driver-phone"
                  type="tel"
                  value={externalDelivery.driverPhone}
                  maxLength={32}
                  placeholder="0812xxxxxxxx"
                  onChange={(event) =>
                    setExternalDelivery((current) => ({
                      ...current,
                      driverPhone: event.target.value,
                    }))
                  }
                />
              </div>
            </section>
          )}

        {actionType === "READY_WAREHOUSE" &&
          hasItemsNeedingNewDo &&
          !hasPaidPurchaseOrder && (
            <section className="space-y-2 rounded-xl border border-border p-3.5">
              <Label htmlFor="internal-vehicle" className="type-p2 font-medium">
                Kendaraan Master <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedVehicleId}
                onValueChange={setSelectedVehicleId}
                disabled={isPending || availableVehicles.length === 0}
              >
                <SelectTrigger id="internal-vehicle" className="h-10 w-full">
                  <SelectValue placeholder="Pilih kendaraan tersedia" />
                </SelectTrigger>
                <SelectContent>
                  {availableVehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.plateNumber} · {vehicle.vehicleType}
                      {vehicle.brand ? ` · ${vehicle.brand}` : ""}
                      {` · ${vehicle.currentKilometer} km`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableVehicles.length === 0 && (
                <p className="type-p3 text-destructive" role="alert">
                  Belum ada kendaraan tersedia dengan KM awal siap.
                </p>
              )}
            </section>
          )}

        {actionType === "BUY_STORE" && allPurchaseOrders.length > 0 && (
          <section className="space-y-3 rounded-xl border border-border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="type-h3 text-foreground">
                Daftar PO ({allPurchaseOrders.length})
              </h3>
              {pendingNonContractItems.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={creatingNewPo ? "secondary" : "outline"}
                  disabled={isPending}
                  onClick={() => setCreatingNewPo((prev) => !prev)}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  {creatingNewPo ? "Daftar PO" : "Buat PO"}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {allPurchaseOrders.map((po) => (
                <PurchaseOrderRowCard
                  key={po.publicCode}
                  po={po}
                  isSelected={
                    !creatingNewPo &&
                    selectedPurchaseOrder?.publicCode === po.publicCode
                  }
                  isPending={isPending}
                  sendingPoCode={sendingPoCode}
                  onSelect={(publicCode) => {
                    setCreatingNewPo(false);
                    setSelectedPoCode(publicCode);
                  }}
                  onMarkSent={handleMarkPoSentToVendor}
                />
              ))}
            </div>

            {!creatingNewPo && selectedPurchaseOrder && (
              <div className="border-t border-border pt-3">
                {selectedOrderPaid ? (
                  <p className="type-p2 text-muted-foreground">
                    PO {selectedPurchaseOrder.poNumber} sudah lunas. Lanjutkan
                    lewat pengiriman atau buat PO untuk sisa item.
                  </p>
                ) : !selectedOrderApproved ? (
                  <p className="type-p2 text-muted-foreground">
                    Invoice dapat diunggah setelah PO{" "}
                    {selectedPurchaseOrder.poNumber} disetujui.
                  </p>
                ) : selectedPurchaseOrder.vendorInvoiceUrl ? (
                  <p className="type-p2 text-muted-foreground">
                    Invoice PO {selectedPurchaseOrder.poNumber} sudah dikirim ke
                    Keuangan.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <p className="type-p2 font-semibold text-foreground">
                      Unggah Invoice PO {selectedPurchaseOrder.poNumber}
                    </p>
                    <InvoiceDetailsFields
                      idPrefix={`ticket-invoice-${ticket.id}-${selectedPurchaseOrder.publicCode}`}
                      value={invoiceDraft}
                      paymentMethod={
                        selectedPurchaseOrder.paymentMethod ?? null
                      }
                      paymentTerms={selectedPurchaseOrder.paymentTerms ?? null}
                      bankName={selectedPurchaseOrder.paymentBankName ?? null}
                      bankAccount={
                        selectedPurchaseOrder.paymentAccountNumber ?? null
                      }
                      bankHolder={
                        selectedPurchaseOrder.paymentAccountName ?? null
                      }
                      onChange={(draft) =>
                        setInvoiceDraftState({
                          orderCode: selectedPurchaseOrder.publicCode,
                          draft,
                        })
                      }
                    />
                    <FileDropzone
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      multiple={false}
                      maxSizeMb={5}
                      capture="environment"
                      disabled={isPending}
                      files={invoiceFile ? [invoiceFile] : []}
                      onFilesChange={(files) =>
                        setInvoiceFileState({
                          orderCode: selectedPurchaseOrder.publicCode,
                          file: files[0] ?? null,
                        })
                      }
                      onError={setMessage}
                      label="Unggah Invoice Vendor"
                      hint="PDF, JPG, PNG, atau WEBP maksimal 5 MB."
                    />
                    {invoiceFile && (
                      <div className="flex items-center justify-between gap-3">
                        <p className="type-p3 min-w-0 truncate text-muted-foreground">
                          {invoiceFile.name}
                        </p>
                        <InvoiceFilePreview file={invoiceFile} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {actionType === "BUY_STORE" && shouldShowCreatePoForm && (
          <div className="space-y-3">
            <RadioGroup
              value={poCreateMode}
              onValueChange={(value) =>
                setPoCreateMode(
                  value === "CATALOG_PO" ? "CATALOG_PO" : "DIRECT_VENDOR",
                )
              }
              className="grid gap-2 sm:grid-cols-2"
            >
              <Label
                htmlFor="po-mode-direct-vendor"
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border p-3",
                  poCreateMode === "DIRECT_VENDOR"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card",
                )}
              >
                <RadioGroupItem
                  id="po-mode-direct-vendor"
                  value="DIRECT_VENDOR"
                />
                <div>
                  <span className="type-p2 block font-semibold text-foreground">
                    Vendor Langsung
                  </span>
                  <span className="type-p3 block text-muted-foreground">
                    Tanpa mapping SKU gudang
                  </span>
                </div>
              </Label>

              <Label
                htmlFor="po-mode-catalog"
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border p-3",
                  poCreateMode === "CATALOG_PO"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card",
                )}
              >
                <RadioGroupItem id="po-mode-catalog" value="CATALOG_PO" />
                <div>
                  <span className="type-p2 block font-semibold text-foreground">
                    Katalog Gudang
                  </span>
                  <span className="type-p3 block text-muted-foreground">
                    Tautkan item ke SKU gudang
                  </span>
                </div>
              </Label>
            </RadioGroup>

            {poCreateMode === "DIRECT_VENDOR" ? (
              <DirectVendorPurchasePanel
                ticket={ticket}
                pendingItems={pendingNonContractItems}
                vendors={vendors}
                onCreated={(publicCode) => {
                  setCreatingNewPo(false);
                  onOpenChange(false);
                  onSuccess();
                  router.push(`/d/${publicCode}`);
                }}
                onCancel={() => {
                  if (allPurchaseOrders.length > 0) {
                    setCreatingNewPo(false);
                  } else {
                    setActionType("READY_WAREHOUSE");
                  }
                }}
              />
            ) : (
              <CreatePOForm
                key={`${ticket.id}-${pendingNonContractItems.length}`}
                vendors={vendors}
                stockItems={stockItems}
                ticketId={ticket.id}
                projectSiteName={
                  ticket.project
                    ? `${ticket.project.kelompokTani} · ${ticket.project.title}`
                    : "Gudang (tanpa proyek)"
                }
                ticketItems={pendingNonContractItems.map((item) => ({
                  ticketItemId: item.id,
                  stockItemId: item.stockItemId,
                  itemName: item.itemName,
                  quantity: item.quantity,
                  unit: item.unit,
                  unitPrice: item.estimatedCost,
                }))}
                onCreated={(publicCode) => {
                  setCreatingNewPo(false);
                  onOpenChange(false);
                  onSuccess();
                  router.push(`/d/${publicCode}`);
                }}
                onCancel={() => {
                  if (allPurchaseOrders.length > 0) {
                    setCreatingNewPo(false);
                  } else {
                    setActionType("READY_WAREHOUSE");
                  }
                }}
              />
            )}
          </div>
        )}

        {message && (
          <p className="type-p2 text-destructive" role="alert">
            {message}
          </p>
        )}
      </form>
    </GlobalModal>
  );
}
