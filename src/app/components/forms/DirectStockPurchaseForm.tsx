"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  createDirectStockPurchase,
  saveLogisticsStockItem,
} from "@/app/actions/tickets";
import CreateVendorInline, {
  type PurchaseVendorOption,
} from "@/app/components/forms/CreateVendorInline";
import { POPaymentMethod } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { ActionIconButton } from "@/components/ui/action-icon-button";
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
import { getVendorBankAccounts } from "@/lib/vendor-bank-accounts";
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

type PurchaseStockItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitPrice: string;
};

type InitialPurchaseItem = {
  ticketItemId: string;
  stockItemId?: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCost?: string | null;
};

type PurchaseTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  items?: InitialPurchaseItem[];
};

type PurchaseLine = {
  key: number;
  stockItemId: string;
  quantity: string;
  unitPrice: string;
  ticketItemId?: string;
  sourceLabel?: string;
  itemName?: string;
  unit?: string;
  maxQuantity?: number;
};

function positivePriceString(raw?: string | null): string {
  if (!raw) return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? String(raw) : "";
}

function buildPurchaseLinesFromTicketItems(
  ticketItems: InitialPurchaseItem[],
  catalog: PurchaseStockItem[],
  startKey = 0,
): PurchaseLine[] {
  if (ticketItems.length === 0) {
    return [{ key: startKey, stockItemId: "", quantity: "", unitPrice: "" }];
  }
  return ticketItems.map((item, index) => {
    const linkedStock = item.stockItemId
      ? catalog.find((stockItem) => stockItem.id === item.stockItemId)
      : undefined;
    const matches = catalog.filter(
      (stockItem) =>
        stockItem.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") ===
          item.itemName.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") &&
        stockItem.unit.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID") ===
          item.unit.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID"),
    );
    const stockItem =
      linkedStock ?? (matches.length === 1 ? matches[0] : undefined);
    const resolvedUnitPrice =
      positivePriceString(stockItem?.unitPrice) ||
      positivePriceString(item.estimatedCost);
    return {
      key: startKey + index,
      stockItemId: stockItem?.id ?? "",
      quantity: String(item.quantity),
      unitPrice: resolvedUnitPrice,
      ticketItemId: item.ticketItemId,
      sourceLabel: `${item.itemName} (${item.quantity} ${item.unit})`,
      itemName: item.itemName,
      unit: item.unit,
      maxQuantity: item.quantity,
    };
  });
}

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export default function DirectStockPurchaseForm({
  stockItems,
  vendors,
  tickets = [],
  initialTicketId,
  initialTicketItems = [],
  onCancel,
  onCreated,
}: {
  stockItems: PurchaseStockItem[];
  vendors: PurchaseVendorOption[];
  tickets?: PurchaseTicket[];
  initialTicketId?: string;
  initialTicketItems?: InitialPurchaseItem[];
  onCancel?: () => void;
  onCreated?: (message: string) => void;
}) {
  const router = useRouter();
  const nextRowKey = useRef(initialTicketItems.length || 1);
  const [catalogItems, setCatalogItems] = useState(stockItems);
  const [items, setItems] = useState<PurchaseLine[]>(() =>
    buildPurchaseLinesFromTicketItems(initialTicketItems, stockItems, 0),
  );
  const [vendorId, setVendorId] = useState("");
  const [vendorBankAccountId, setVendorBankAccountId] = useState("");
  const [availableVendors, setAvailableVendors] = useState(vendors);
  const [openStockPickerKey, setOpenStockPickerKey] = useState<number | null>(null);
  const [ticketId, setTicketId] = useState(initialTicketId ?? "");
  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false);
  const [newItemTargetKey, setNewItemTargetKey] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemMessage, setNewItemMessage] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [includeTax, setIncludeTax] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSavingNewItem, startSavingNewItem] = useTransition();

  const vendor = availableVendors.find(
    (candidate) => candidate.id === vendorId,
  );
  const vendorBankAccounts = vendor ? getVendorBankAccounts(vendor) : [];
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
  const subtotal = items.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0),
    0,
  );
  const total = includeTax ? subtotal * 1.11 : subtotal;
  const hasInvalidItems = items.some(
    (line) =>
      !line.stockItemId ||
      !Number.isFinite(Number(line.quantity)) ||
      Number(line.quantity) <= 0 ||
      !Number.isFinite(Number(line.unitPrice)) ||
      Number(line.unitPrice) <= 0,
  );

  const updateLine = (key: number, patch: Partial<PurchaseLine>) => {
    setItems((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  const addPurchaseLine = () => {
    const key = nextRowKey.current++;
    setItems((current) =>
      current.length >= 50
        ? current
        : [
            ...current,
            {
              key,
              stockItemId: "",
              quantity: "",
              unitPrice: "",
            },
          ],
    );
  };

  const openNewItemModal = (targetLine?: PurchaseLine) => {
    const fallbackLine =
      targetLine ?? items.find((line) => !line.stockItemId);
    setNewItemTargetKey(fallbackLine?.key ?? null);
    setNewItemName(fallbackLine?.itemName ?? "");
    setNewItemUnit(fallbackLine?.unit ?? "pcs");
    setNewItemMessage("");
    setNewItemDialogOpen(true);
  };

  const addCatalogItem = () => {
    const name = newItemName.trim();
    const unit = newItemUnit.trim();
    if (!name || !unit) {
      setNewItemMessage("Nama barang dan satuan wajib diisi.");
      return;
    }

    setNewItemMessage("");
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
          setNewItemMessage(result.message);
          return;
        }

        const stockItem = result.stockItem;
        setCatalogItems((current) =>
          current.some((item) => item.id === stockItem.id)
            ? current
            : [...current, stockItem].sort((a, b) =>
                a.name.localeCompare(b.name, "id"),
              ),
        );
        setItems((current) => {
          const targetLine =
            (newItemTargetKey !== null
              ? current.find((line) => line.key === newItemTargetKey)
              : undefined) ?? current.find((line) => !line.stockItemId);
          if (targetLine) {
            const catalogPrice = positivePriceString(stockItem.unitPrice);
            return current.map((line) =>
              line.key === targetLine.key
                ? {
                    ...line,
                    stockItemId: stockItem.id,
                    unitPrice: catalogPrice || line.unitPrice,
                  }
                : line,
            );
          }
          if (ticketId) {
            return current;
          }
          return [
            ...current,
            {
              key: nextRowKey.current++,
              stockItemId: stockItem.id,
              quantity: "",
              unitPrice: positivePriceString(stockItem.unitPrice),
            },
          ];
        });
        setNewItemTargetKey(null);
        setNewItemDialogOpen(false);
      } catch (error) {
        console.error("Direct purchase stock catalog item creation failed:", error);
        setNewItemMessage("Jenis barang gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const submit = () => {
    if (!vendor) {
      setMessage("Pilih vendor dari katalog sebelum mencatat pembelian.");
      return;
    }
    const activeLines = items.filter(
      (line) => line.stockItemId || line.quantity.trim() || line.unitPrice.trim(),
    );
    if (activeLines.length === 0) {
      setMessage("Pilih minimal satu barang untuk dicatat dalam pembelian.");
      return;
    }
    const formattedItems = activeLines.map((line) => {
      const rawQty = (line.quantity ?? "").toString().trim().replace(",", ".");
      const rawPrice = (line.unitPrice ?? "").toString().trim().replace(",", ".");
      const numQty = Number(rawQty);
      const numPrice = Number(rawPrice);
      return {
        stockItemId: line.stockItemId,
        quantity: rawQty,
        numQty,
        maxQuantity: line.maxQuantity,
        unitPrice:
          Number.isFinite(numPrice) && numPrice > 0
            ? numPrice.toFixed(2)
            : "0",
        ticketItemId: line.ticketItemId,
      };
    });
    if (
      formattedItems.some(
        (line) =>
          !line.stockItemId ||
          !Number.isFinite(line.numQty) ||
          line.numQty <= 0 ||
          (line.maxQuantity !== undefined && line.numQty > line.maxQuantity) ||
          !Number.isFinite(Number(line.unitPrice)) ||
          Number(line.unitPrice) <= 0,
      )
    ) {
      setMessage(
        "Pilih barang dari katalog, isi jumlah (tidak melebihi kebutuhan tiket), dan harga satuan dengan benar.",
      );
      return;
    }

    setMessage("");
    const payloadItems = formattedItems.map(
      ({ stockItemId, quantity, unitPrice, ticketItemId }) => ({
        stockItemId,
        quantity,
        unitPrice,
        ticketItemId,
      }),
    );
    startTransition(async () => {
      try {
        const result = await createDirectStockPurchase({
          vendorId: vendor.id,
          vendorBankAccountId: selectedBankAccount?.id,
          ...(ticketId ? { ticketId } : {}),
          items: payloadItems,
          reference,
          notes,
          includeTax,
        });
        setMessage(result.message);
        if (!result.success) return;
        onCreated?.(result.message);
        if (!onCreated) router.refresh();
      } catch (error) {
        console.error("Direct stock purchase submission failed:", error);
        setMessage("Pembelian gagal dicatat. Periksa data lalu coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Metode pembayaran</Label>
          <Badge variant="outline">
            {paymentMethod === POPaymentMethod.TRANSFER ? "Transfer" : "Cash"}
          </Badge>
        </div>
        <div className="space-y-1">
          <Label>Status stok</Label>
          <p className="text-sm">Stok bertambah setelah barang diterima.</p>
        </div>
      </div>
      <p className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-muted-foreground">
        Invoice/bon faktur dilampirkan setelah pengajuan ini disetujui Direktur.
        Setelah disetujui, buka tab Stok Gudang dan unggah dokumen pada kolom
        Invoice / BON Faktur. Keuangan baru dapat memproses pembayaran setelah
        dokumen dilampirkan.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="direct-stock-vendor">Vendor</Label>
          <CreateVendorInline
            onCreated={(createdVendor) => {
              setAvailableVendors((current) =>
                current.some((item) => item.id === createdVendor.id)
                  ? current
                  : [...current, createdVendor].sort((a, b) =>
                      a.name.localeCompare(b.name, "id"),
                    ),
              );
              setVendorId(createdVendor.id);
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
          <SelectTrigger id="direct-stock-vendor">
            <SelectValue placeholder="Pilih vendor" />
          </SelectTrigger>
          <SelectContent>
            {availableVendors.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {availableVendors.length === 0 && (
          <p className="text-sm text-muted-foreground" role="status">
            Belum ada vendor. Tambahkan vendor untuk melanjutkan pembelian.
          </p>
        )}
      </div>

      {vendor && (
        <div className="space-y-3 rounded-md border p-3 text-sm">
          {vendorBankAccounts.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="direct-stock-bank-account">Rekening tujuan</Label>
              <Select
                value={selectedBankAccount?.id ?? ""}
                onValueChange={setVendorBankAccountId}
                disabled={isPending}
              >
                <SelectTrigger id="direct-stock-bank-account">
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
          <div className="grid gap-2 sm:grid-cols-3">
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
        <Label htmlFor="direct-stock-ticket">
          Tautkan ke Tiket / Permintaan{initialTicketId ? "" : " (opsional)"}
        </Label>
        <Select
          value={ticketId || "none"}
          onValueChange={(value) => {
            const nextTicketId = value === "none" ? "" : value;
            setTicketId(nextTicketId);
            if (!initialTicketId) {
              const selectedTicket = tickets.find((t) => t.id === nextTicketId);
              const nextTicketItems = selectedTicket?.items ?? [];
              const startKey = nextRowKey.current;
              nextRowKey.current += Math.max(1, nextTicketItems.length);
              setItems(
                buildPurchaseLinesFromTicketItems(
                  nextTicketItems,
                  catalogItems,
                  startKey,
                ),
              );
            }
          }}
          disabled={isPending || Boolean(initialTicketId)}
        >
          <SelectTrigger id="direct-stock-ticket">
            <SelectValue placeholder="Tidak ditautkan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Tidak ditautkan</SelectItem>
            {tickets.map((ticket) => (
              <SelectItem key={ticket.id} value={ticket.id}>
                {ticket.ticketNumber} · {ticket.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Pembelian akan tampil pada detail permintaan yang dipilih. Data lama
          tetap tidak tertaut.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Barang dan harga</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPurchaseLine}
              disabled={
                isPending ||
                isSavingNewItem ||
                Boolean(initialTicketId || ticketId) ||
                catalogItems.length === 0 ||
                items.length >= 50
              }
            >
              Tambah Barang dari Stok
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openNewItemModal()}
              disabled={
                isPending ||
                isSavingNewItem ||
                items.length >= 50 ||
                (Boolean(initialTicketId || ticketId) &&
                  !items.some((line) => !line.stockItemId))
              }
            >
              Tambah Jenis Barang
            </Button>
          </div>
        </div>
        {catalogItems.length === 0 && (
          <p className="text-sm text-muted-foreground" role="status">
            Katalog barang masih kosong. Tambahkan jenis barang terlebih dahulu
            untuk mengisi pembelian.
          </p>
        )}
        <div className="overflow-x-auto rounded-md border">
          <Table pagination={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Barang / SKU</TableHead>
                <TableHead className="w-28">Jumlah</TableHead>
                <TableHead className="w-40">Harga satuan (Rp)</TableHead>
                <TableHead className="w-20">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((line, index) => (
                <TableRow key={line.key}>
                  <TableCell>
                    <Popover
                      open={openStockPickerKey === line.key}
                      onOpenChange={(open) =>
                        setOpenStockPickerKey(open ? line.key : null)
                      }
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          role="combobox"
                          aria-expanded={openStockPickerKey === line.key}
                          disabled={isPending}
                          className="flex h-10 w-full min-w-56 items-center justify-between gap-2 overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="min-w-0 flex-1 truncate text-left">
                            {(() => {
                              const selected = catalogItems.find(
                                (candidate) =>
                                  candidate.id === line.stockItemId,
                              );
                              return selected
                                ? `${selected.name} · ${selected.sku} (${selected.unit})`
                                : "Pilih barang dan SKU";
                            })()}
                          </span>
                          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[--radix-popover-trigger-width] min-w-80 p-0"
                      >
                        <Command>
                          <CommandInput placeholder="Cari nama barang atau SKU..." />
                          <CommandList className="max-h-60 overflow-y-auto">
                            <CommandEmpty>Barang tidak ditemukan.</CommandEmpty>
                            {catalogItems.map((stockItem) => (
                              <CommandItem
                                key={stockItem.id}
                                value={`${stockItem.name} ${stockItem.sku} ${stockItem.unit}`}
                                onSelect={() => {
                                  const nextCatalogPrice = positivePriceString(
                                    stockItem.unitPrice,
                                  );
                                  updateLine(line.key, {
                                    stockItemId: stockItem.id,
                                    unitPrice: nextCatalogPrice || line.unitPrice,
                                  });
                                  setOpenStockPickerKey(null);
                                }}
                                className="flex items-center justify-between gap-2"
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">
                                    {stockItem.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    SKU: {stockItem.sku} · Satuan:{" "}
                                    {stockItem.unit}
                                  </span>
                                </div>
                                {line.stockItemId === stockItem.id && (
                                  <Check className="size-4 shrink-0 text-primary" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {line.sourceLabel && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Item tiket asal: {line.sourceLabel}</span>
                        {!line.stockItemId && (
                          <button
                            type="button"
                            onClick={() => openNewItemModal(line)}
                            disabled={isPending || isSavingNewItem}
                            className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
                          >
                            + Buat SKU
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Jumlah barang ${index + 1}`}
                      type="number"
                      min="0.001"
                      max={line.maxQuantity}
                      step="any"
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, { quantity: event.target.value })
                      }
                      disabled={isPending}
                    />
                    {line.maxQuantity !== undefined && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Maks: {line.maxQuantity} {line.unit}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Harga satuan barang ${index + 1}`}
                      type="number"
                      min="0.01"
                      step="any"
                      inputMode="decimal"
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(line.key, { unitPrice: event.target.value })
                      }
                      disabled={isPending}
                    />
                  </TableCell>
                  <TableCell>
                    <ActionIconButton
                      type="button"
                      label={`Hapus barang baris ${index + 1}`}
                      tooltip={`Hapus barang baris ${index + 1}`}
                      icon={Trash2}
                      className="border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      disabled={
                        isPending ||
                        items.length === 1
                      }
                      onClick={() =>
                        setItems((current) =>
                          current.filter((item) => item.key !== line.key),
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="direct-stock-reference">Referensi nota</Label>
          <Input
            id="direct-stock-reference"
            maxLength={120}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="direct-stock-notes">Catatan</Label>
          <Input
            id="direct-stock-notes"
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <Label htmlFor="direct-stock-include-tax">Kenakan PPN 11%</Label>
        <Switch
          id="direct-stock-include-tax"
          checked={includeTax}
          onCheckedChange={setIncludeTax}
          disabled={isPending}
        />
      </div>
      <p className="text-right text-sm font-semibold">
        Total estimasi: {currency.format(total)}
      </p>
      {hasInvalidItems && (
        <p className="text-sm text-destructive" role="alert">
          Pilih barang, isi jumlah, dan masukkan harga satuan lebih besar dari
          Rp 0 untuk setiap baris sebelum mencatat pembelian.
        </p>
      )}

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
          disabled={
            isPending ||
            isSavingNewItem ||
            !availableVendors.length ||
            !catalogItems.length
          }
        >
          {isPending ? "Mencatat..." : "Catat Pembelian"}
        </Button>
      </div>
      <GlobalModal
        isOpen={newItemDialogOpen}
        onClose={() => {
          setNewItemTargetKey(null);
          setNewItemDialogOpen(false);
        }}
        title="Tambah Jenis Barang"
        description="Barang akan masuk katalog dengan stok awal nol dan otomatis dipilih untuk pembelian ini."
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="direct-stock-new-item-name">Nama barang</Label>
              <Input
                id="direct-stock-new-item-name"
                value={newItemName}
                onChange={(event) => setNewItemName(event.target.value)}
                maxLength={120}
                disabled={isSavingNewItem}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direct-stock-new-item-unit">Satuan</Label>
              <Input
                id="direct-stock-new-item-unit"
                value={newItemUnit}
                onChange={(event) => setNewItemUnit(event.target.value)}
                maxLength={32}
                disabled={isSavingNewItem}
              />
            </div>
            {newItemMessage && (
              <p className="text-sm text-destructive" role="alert">
                {newItemMessage}
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
              {isSavingNewItem ? "Menyimpan..." : "Simpan Barang"}
            </Button>
          </DialogFooter>
      </GlobalModal>
    </div>
  );
}
