"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPurchaseOrder,
  type OrderActionResult,
} from "@/app/actions/orders";
import {
  createLogisticsPurchaseOrderForTicket,
  saveLogisticsStockItem,
  type TicketActionResult,
} from "@/app/actions/tickets";
import CreateVendorInline, {
  type PurchaseVendorOption,
} from "@/app/components/forms/CreateVendorInline";
import { POPaymentMethod } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getVendorBankAccounts,
} from "@/lib/vendor-bank-accounts";
import {
  formatRupiahInput,
  formatRupiahNumber,
  parseRupiahInput,
  terbilangRupiah,
} from "@/lib/indonesian-currency";
import { Switch } from "@/components/ui/switch";
import {
  DialogFooter,
} from "@/components/ui/dialog";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CreatePOItem = {
  ticketItemId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice?: string | number | null;
};

type FormItem = {
  ticketItemId?: string;
  stockItemId: string;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

type CreatePOStockItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitPrice: string;
};

type PurchasePaymentPlan = "CASH_FULL" | "DOWN_PAYMENT" | "INSTALLMENT";

const normalizeCatalogValue = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

export default function CreatePOForm({
  vendors,
  stockItems,
  ticketId,
  ticketItems,
  projectSiteName,
  onCancel,
  onCreated,
}: {
  vendors: PurchaseVendorOption[];
  stockItems: CreatePOStockItem[];
  ticketId?: string;
  ticketItems?: CreatePOItem[];
  projectSiteName?: string;
  onCancel?: () => void;
  onCreated?: (publicCode: string, message: string) => void;
}) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState("");
  const [vendorBankAccountId, setVendorBankAccountId] = useState("");
  const [availableVendors, setAvailableVendors] = useState(vendors);
  const [catalogItems, setCatalogItems] = useState(stockItems);
  const [items, setItems] = useState<FormItem[]>(() =>
    ticketItems?.length
      ? ticketItems.map((item) => {
          const matches = stockItems.filter(
            (stockItem) =>
              normalizeCatalogValue(stockItem.name) ===
                normalizeCatalogValue(item.itemName) &&
              normalizeCatalogValue(stockItem.unit) ===
                normalizeCatalogValue(item.unit),
          );
          const stockItem = matches.length === 1 ? matches[0] : undefined;
          return {
            ticketItemId: item.ticketItemId,
            stockItemId: stockItem?.id ?? "",
            itemName: item.itemName,
            quantity: String(item.quantity),
            unit: item.unit,
            unitPrice:
              item.unitPrice == null
                ? formatRupiahInput(stockItem?.unitPrice ?? "")
                : formatRupiahInput(String(item.unitPrice)),
          };
        })
      : [{ stockItemId: "", itemName: "", quantity: "", unit: "", unitPrice: "" }],
  );
  const [includeTax, setIncludeTax] = useState(false);
  const [paymentPlan, setPaymentPlan] =
    useState<PurchasePaymentPlan>("CASH_FULL");
  const [paymentPlanDetails, setPaymentPlanDetails] = useState("");
  const [downPaymentPercent, setDownPaymentPercent] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSavingNewItem, startSavingNewItem] = useTransition();
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemError, setNewItemError] = useState("");
  const [newItemTargetIndex, setNewItemTargetIndex] = useState<number | null>(
    null,
  );
  const selectedVendor = availableVendors.find(
    (vendor) => vendor.id === vendorId,
  );
  const vendorBankAccounts = selectedVendor
    ? getVendorBankAccounts(selectedVendor)
    : [];
  const selectedBankAccount =
    vendorBankAccounts.find((account) => account.id === vendorBankAccountId) ??
    vendorBankAccounts.find((account) => account.isPrimary) ??
    vendorBankAccounts[0];
  const hasBankDetails = Boolean(
    selectedBankAccount?.bankName &&
      selectedBankAccount.bankAccount &&
      selectedBankAccount.bankHolder,
  );
  const paymentMethod = hasBankDetails
    ? POPaymentMethod.TRANSFER
    : POPaymentMethod.CASH;
  const siteName = ticketId
    ? projectSiteName || "Proyek dari tiket"
    : "Gudang (tanpa proyek)";
  const subtotal = items.reduce((total, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = parseRupiahInput(item.unitPrice);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0) *
      (Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0);
  }, 0);
  const taxAmount = includeTax ? subtotal * 0.11 : 0;
  const grandTotal = subtotal + taxAmount;
  const parsedDownPaymentPercent = Number(downPaymentPercent);
  const downPaymentAmount =
    Number.isFinite(parsedDownPaymentPercent) && parsedDownPaymentPercent > 0
      ? Math.round(grandTotal * (parsedDownPaymentPercent / 100) * 100) / 100
      : 0;
  const remainingPaymentAmount = Math.max(0, grandTotal - downPaymentAmount);

  const updateItem = (index: number, patch: Partial<FormItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const addPurchaseOrderItem = () => {
    setItems((current) => [
      ...current,
      {
        stockItemId: "",
        itemName: "",
        quantity: "",
        unit: "",
        unitPrice: "",
      },
    ]);
  };

  const openNewItemDialog = () => {
    const emptyIndex = items.findIndex((item) => !item.stockItemId);
    const targetIndex = ticketId
      ? emptyIndex
      : emptyIndex >= 0
        ? emptyIndex
        : null;
    setNewItemTargetIndex(targetIndex);
    setNewItemName(
      targetIndex === null ? "" : items[targetIndex]?.itemName ?? "",
    );
    setNewItemUnit(
      targetIndex === null ? "pcs" : items[targetIndex]?.unit || "pcs",
    );
    setNewItemError("");
    setNewItemDialogOpen(true);
  };

  const addCatalogItem = () => {
    const name = newItemName.trim();
    const unit = newItemUnit.trim();
    if (!name || !unit) {
      setNewItemError("Nama barang dan satuan wajib diisi.");
      return;
    }

    setNewItemError("");
    startSavingNewItem(async () => {
      try {
        const result = await saveLogisticsStockItem({
          name,
          unit,
          stockQuantity: "0",
          minimumStock: "0",
          unitPrice: "0",
        });
        if (!result.success || !result.stockItem) {
          setNewItemError(result.message);
          return;
        }

        const stockItem = result.stockItem;
        setCatalogItems((current) =>
          current.some((item) => item.id === stockItem.id)
            ? current
            : [...current, stockItem],
        );
        setItems((current) => {
          const targetIndex =
            newItemTargetIndex === null
              ? current.findIndex((item) => !item.stockItemId)
              : newItemTargetIndex;
          const newFormItem: FormItem = {
            ticketItemId: current[targetIndex]?.ticketItemId,
            stockItemId: stockItem.id,
            itemName: current[targetIndex]?.ticketItemId
              ? current[targetIndex].itemName
              : stockItem.name,
            quantity: current[targetIndex]?.ticketItemId
              ? current[targetIndex]?.quantity ?? ""
              : "",
            unit: current[targetIndex]?.ticketItemId
              ? current[targetIndex].unit
              : stockItem.unit,
            unitPrice:
              current[targetIndex]?.unitPrice || stockItem.unitPrice || "",
          };

          if (targetIndex >= 0) {
            return current.map((item, index) =>
              index === targetIndex ? newFormItem : item,
            );
          }
          return [...current, newFormItem];
        });
        setNewItemDialogOpen(false);
      } catch (error) {
        console.error("PO stock catalog item creation failed:", error);
        setNewItemError("Barang gagal ditambahkan ke katalog. Coba kembali.");
      }
    });
  };

  const submit = () => {
    const parsedItems = items.map((item) => ({
      ticketItemId: item.ticketItemId,
      stockItemId: item.stockItemId,
      itemName: item.itemName.trim(),
      quantity: Number(item.quantity),
      unit: item.unit.trim(),
      unitPrice: parseRupiahInput(item.unitPrice),
    }));
    if (!selectedVendor) {
      setMessage("Pilih vendor dari katalog sebelum membuat PO.");
      return;
    }
    if (paymentPlan === "INSTALLMENT" && !paymentPlanDetails.trim()) {
      setMessage(
        "Isi rincian termin, misalnya tahapan dan persentase pembayarannya.",
      );
      return;
    }
    if (paymentPlanDetails.trim().length > 1000) {
      setMessage("Rincian pembayaran maksimal 1.000 karakter.");
      return;
    }
    if (
      parsedItems.length === 0 ||
      parsedItems.some(
        (item) =>
          !item.itemName ||
          !item.stockItemId ||
          !item.unit ||
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice <= 0,
      )
    ) {
      setMessage(
        "Pilih barang dari katalog, lalu lengkapi jumlah dan harga satuan.",
      );
      return;
    }
    if (
      paymentPlan === "DOWN_PAYMENT" &&
      (!Number.isFinite(parsedDownPaymentPercent) ||
        parsedDownPaymentPercent <= 0 ||
        parsedDownPaymentPercent >= 100 ||
        grandTotal <= 0)
    ) {
      setMessage("Masukkan persentase DP lebih dari 0% dan kurang dari 100%.");
      return;
    }

    setMessage("");
    const paymentPlanLabel =
      paymentPlan === "CASH_FULL"
        ? "CASH (LUNAS)"
        : paymentPlan === "DOWN_PAYMENT"
          ? "DP (DOWN PAYMENT)"
          : "TERMIN (CICIL)";
    const paymentTerms = [
      paymentPlanLabel,
      paymentPlan === "DOWN_PAYMENT"
        ? `DP ${parsedDownPaymentPercent}% (Rp ${formatRupiahNumber(downPaymentAmount)}), sisa pembayaran Rp ${formatRupiahNumber(remainingPaymentAmount)}`
        : paymentPlanDetails.trim(),
    ]
      .filter(Boolean)
      .join(" - ");
    startTransition(async () => {
      try {
        const result: OrderActionResult | TicketActionResult = ticketId
          ? await createLogisticsPurchaseOrderForTicket(
              ticketId,
              selectedVendor.name,
              parsedItems,
              {
                vendorId: selectedVendor.id,
                method: paymentMethod,
                vendorBankAccountId: selectedBankAccount?.id,
                includeTax,
                paymentTerms,
              },
            )
          : await createPurchaseOrder({
              vendorId: selectedVendor.id,
              vendorName: selectedVendor.name,
              vendorBankAccountId: selectedBankAccount?.id,
              paymentMethod,
              includeTax,
              paymentTerms,
              items: parsedItems,
            });
        setMessage(result.message);
        if (result.success && result.publicCode) {
          onCreated?.(result.publicCode, result.message);
          if (!onCreated) {
            router.push(`/d/${result.publicCode}`);
          }
          router.refresh();
        }
      } catch (error) {
        console.error("Purchase Order submission failed:", error);
        setMessage("PO gagal dibuat. Periksa data lalu coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Proyek / Site Project</Label>
          <p className="text-sm font-medium">{siteName}</p>
        </div>
        <div className="space-y-1">
          <Label>Cara pembayaran</Label>
          <div>
            <Badge variant="outline">
              {paymentMethod === POPaymentMethod.TRANSFER ? "Transfer" : "Cash"}
            </Badge>
          </div>
        </div>
      </div>
      <div className="space-y-3 rounded-md border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="create-po-payment-plan">Skema pembayaran</Label>
          <Select
            value={paymentPlan}
            onValueChange={(value) => {
              if (
                value === "CASH_FULL" ||
                value === "DOWN_PAYMENT" ||
                value === "INSTALLMENT"
              ) {
                setPaymentPlan(value);
                setMessage("");
              }
            }}
            disabled={isPending}
          >
            <SelectTrigger id="create-po-payment-plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH_FULL">CASH (LUNAS)</SelectItem>
              <SelectItem value="DOWN_PAYMENT">DP (DOWN PAYMENT)</SelectItem>
              <SelectItem value="INSTALLMENT">TERMIN (CICIL)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentPlan === "DOWN_PAYMENT" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-po-down-payment-percent">
                Pembayaran awal (DP)
              </Label>
              <div className="relative">
                <Input
                  id="create-po-down-payment-percent"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="99.99"
                  step="0.01"
                  value={downPaymentPercent}
                  onChange={(event) => {
                    setDownPaymentPercent(event.target.value);
                    setMessage("");
                  }}
                  placeholder="Contoh: 50"
                  className="pr-8"
                  disabled={isPending}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Nilai DP: Rp {formatRupiahNumber(downPaymentAmount) || "0"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Sisa pembayaran</Label>
              <div
                className="flex h-10 items-center rounded-lg border bg-muted/30 px-3 text-sm font-semibold"
                aria-live="polite"
              >
                Rp {formatRupiahNumber(remainingPaymentAmount) || "0"}
              </div>
              <p className="text-xs text-muted-foreground">
                Dihitung dari total harga setelah PPN.
              </p>
            </div>
          </div>
        )}
        {paymentPlan === "INSTALLMENT" && (
          <div className="space-y-1.5">
            <Label htmlFor="create-po-payment-plan-details">
              Rincian termin pembayaran
            </Label>
            <Input
              id="create-po-payment-plan-details"
              value={paymentPlanDetails}
              onChange={(event) => setPaymentPlanDetails(event.target.value)}
              placeholder="Contoh: 30% saat PO, 40% saat pengiriman, 30% setelah diterima"
              maxLength={1000}
              disabled={isPending}
            />
          </div>
        )}
      </div>
      {ticketId && (
        <p className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-muted-foreground">
          Invoice atau bon faktur belum diunggah pada tahap pengajuan. Setelah PO
          disetujui dan dikirim ke vendor, Logistik dapat melampirkan dokumen
          pada tahap berikutnya agar Finance dapat memproses pembayaran.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="create-po-vendor">Vendor</Label>
          <CreateVendorInline
            onCreated={(vendor) => {
              setAvailableVendors((current) =>
                current.some((item) => item.id === vendor.id)
                  ? current
                  : [...current, vendor].sort((a, b) =>
                      a.name.localeCompare(b.name, "id"),
                    ),
              );
              setVendorId(vendor.id);
              setVendorBankAccountId("");
            }}
          />
        </div>
        <Select
          value={vendorId}
          onValueChange={(value) => {
            setVendorId(value);
            setVendorBankAccountId("");
          }}
          disabled={isPending}
        >
          <SelectTrigger id="create-po-vendor">
            <SelectValue placeholder="Pilih vendor" />
          </SelectTrigger>
          <SelectContent>
            {availableVendors.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {availableVendors.length === 0 && (
          <p className="text-sm text-muted-foreground" role="status">
            Belum ada vendor. Tambahkan vendor untuk melanjutkan pengajuan PO.
          </p>
        )}
      </div>

      {selectedVendor && (
        <div className="space-y-3 rounded-md border p-3 text-sm">
          {vendorBankAccounts.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="create-po-bank-account">Rekening tujuan</Label>
              <Select
                value={selectedBankAccount?.id ?? ""}
                onValueChange={setVendorBankAccountId}
                disabled={isPending}
              >
                <SelectTrigger id="create-po-bank-account">
                  <SelectValue placeholder="Pilih rekening vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendorBankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.label || account.bankName} · {account.bankAccount}
                      {account.isPrimary ? " (Utama)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
          <p>
            <span className="text-muted-foreground">Bank tujuan:</span>{" "}
            {hasBankDetails ? selectedBankAccount?.bankName : "Tidak digunakan (Cash)"}
          </p>
          <p>
            <span className="text-muted-foreground">No. rekening:</span>{" "}
            {hasBankDetails ? selectedBankAccount?.bankAccount : "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Pemilik rekening:</span>{" "}
            {hasBankDetails ? selectedBankAccount?.bankHolder : "—"}
          </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Barang dan harga PO</Label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                isPending || isSavingNewItem || items.length >= 200
              }
              onClick={addPurchaseOrderItem}
            >
              Tambah Barang
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending || isSavingNewItem}
              onClick={openNewItemDialog}
            >
              Barang Baru di Katalog
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table pagination={false} className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-auto">Barang / SKU</TableHead>
                <TableHead className="w-[90px]">Jumlah</TableHead>
                <TableHead className="w-[75px]">Satuan</TableHead>
                <TableHead className="w-[145px]">Harga satuan (Rp)</TableHead>
                <TableHead className="w-[76px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="min-w-0 overflow-hidden">
                    <Select
                      value={item.stockItemId}
                      onValueChange={(stockItemId) => {
                        const selectedItem = catalogItems.find(
                          (catalogItem) => catalogItem.id === stockItemId,
                        );
                        if (!selectedItem) return;
                        const linkedTicketItem = Boolean(item.ticketItemId);
                        updateItem(index, {
                          stockItemId,
                          itemName: linkedTicketItem
                            ? item.itemName
                            : selectedItem.name,
                          unit: linkedTicketItem ? item.unit : selectedItem.unit,
                          unitPrice: formatRupiahInput(
                            linkedTicketItem
                              ? item.unitPrice || selectedItem.unitPrice || ""
                              : selectedItem.unitPrice || "",
                          ),
                        });
                      }}
                      disabled={isPending || isSavingNewItem}
                    >
                      <SelectTrigger
                        aria-label={`Barang katalog ${index + 1}`}
                        title={
                          catalogItems.find(
                            (catalogItem) => catalogItem.id === item.stockItemId,
                          )?.name
                        }
                        className="w-full min-w-0 max-w-full"
                      >
                        <SelectValue
                          placeholder="Pilih barang"
                          className="min-w-0 flex-1 truncate text-left"
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogItems.map((stockItem) => (
                          <SelectItem key={stockItem.id} value={stockItem.id}>
                            {stockItem.name} · {stockItem.sku} ({stockItem.unit})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ticketId && !item.stockItemId && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Barang belum terdaftar. Tambahkan jenis barang agar bisa
                        melanjutkan PO.
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="overflow-hidden">
                    <Input
                      aria-label={`Jumlah barang ${index + 1}`}
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.quantity}
                      disabled={isPending || Boolean(ticketId && item.ticketItemId)}
                      onChange={(event) =>
                        updateItem(index, { quantity: event.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className="overflow-hidden">
                    <span className="text-sm">{item.unit || "—"}</span>
                  </TableCell>
                  <TableCell className="overflow-hidden">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        Rp
                      </span>
                      <Input
                        aria-label={`Harga satuan barang ${index + 1}`}
                        type="text"
                        inputMode="decimal"
                        value={formatRupiahInput(item.unitPrice)}
                        className="pl-9"
                        disabled={isPending}
                        onChange={(event) =>
                          updateItem(index, {
                            unitPrice: formatRupiahInput(event.target.value),
                          })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="overflow-hidden">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        isPending ||
                        items.length === 1 ||
                        Boolean(ticketId && item.ticketItemId)
                      }
                      onClick={() =>
                        setItems((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Hapus
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <Label htmlFor="create-po-include-tax">Kenakan PPN 11%</Label>
        <Switch
          id="create-po-include-tax"
          checked={includeTax}
          onCheckedChange={setIncludeTax}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">Rp {formatRupiahNumber(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">PPN 11%</span>
          <span className="font-medium">
            {includeTax ? `Rp ${formatRupiahNumber(taxAmount)}` : "Rp 0"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t pt-2">
          <span className="font-semibold">Total Harga</span>
          <span className="font-semibold text-primary">
            Rp {formatRupiahNumber(grandTotal)}
          </span>
        </div>
        {paymentPlan === "DOWN_PAYMENT" && downPaymentAmount > 0 && (
          <>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                DP ({formatRupiahNumber(parsedDownPaymentPercent)}%)
              </span>
              <span className="font-medium">
                Rp {formatRupiahNumber(downPaymentAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Sisa + PPN</span>
              <span className="font-medium">
                Rp {formatRupiahNumber(remainingPaymentAmount)}
              </span>
            </div>
          </>
        )}
        <p className="text-xs italic text-muted-foreground">
          Terbilang: {grandTotal > 0 ? `${terbilangRupiah(grandTotal)}.` : "—"}
        </p>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Batal
          </Button>
        )}
        <Button
          type="button"
          onClick={submit}
          disabled={isPending || availableVendors.length === 0}
        >
          {isPending ? "Membuat PO..." : "Buat Purchase Order"}
        </Button>
      </div>
      <GlobalModal
        isOpen={newItemDialogOpen}
        onClose={() => setNewItemDialogOpen(false)}
        title="Tambah Jenis Barang"
        description="Barang akan disimpan di katalog dengan stok awal nol. SKU dibuat otomatis; jika nama dan satuannya sudah ada, data katalog yang lama akan digunakan."
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-po-new-item-name">Nama barang</Label>
              <Input
                id="create-po-new-item-name"
                value={newItemName}
                onChange={(event) => setNewItemName(event.target.value)}
                maxLength={120}
                disabled={isSavingNewItem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-po-new-item-unit">Satuan</Label>
              <Input
                id="create-po-new-item-unit"
                value={newItemUnit}
                onChange={(event) => setNewItemUnit(event.target.value)}
                maxLength={32}
                disabled={isSavingNewItem}
              />
            </div>
            {newItemError && (
              <p className="text-sm text-destructive" role="alert">
                {newItemError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewItemDialogOpen(false)}
              disabled={isSavingNewItem}
            >
              Batal
            </Button>
            <Button
              type="button"
              onClick={addCatalogItem}
              disabled={isSavingNewItem}
            >
              Simpan Barang
            </Button>
          </DialogFooter>
      </GlobalModal>
    </div>
  );
}
