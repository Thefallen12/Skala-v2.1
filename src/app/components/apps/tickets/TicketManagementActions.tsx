"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CircleCheck,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import {
  deleteTicket,
  updateTicketDetails,
  type TicketActionResult,
} from "@/app/actions/tickets";
import { isTicketProcessedByFinance } from "@/lib/ticket-finance-lock";
import {
  TicketCategoryHint,
  TicketPriority,
  TicketType,
  UserRole,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const priorities: { value: TicketPriority; label: string }[] = [
  { value: TicketPriority.LOW, label: "Rendah" },
  { value: TicketPriority.MEDIUM, label: "Sedang" },
  { value: TicketPriority.HIGH, label: "Tinggi" },
  { value: TicketPriority.URGENT, label: "Mendesak" },
];

type EditableTicketItem = {
  id: string;
  stockItemId: string | null;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCost: string;
  categoryHint: TicketCategoryHint;
  expectedDeliveryDate: string;
  isLinked: boolean;
  isContract: boolean;
  deliveredQty: number;
};

type TicketToast = {
  message: string;
  success: boolean;
};

export default function TicketManagementActions({
  ticket,
  role,
  mode = "icon",
  onTicketDeleted,
}: {
  ticket: TicketRow;
  role: UserRole;
  mode?: "icon" | "full";
  onTicketDeleted?: () => void;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [priority, setPriority] = useState(ticket.priority);
  const [items, setItems] = useState<EditableTicketItem[]>([]);
  const [toast, setToast] = useState<TicketToast | null>(null);
  const [isPending, startTransition] = useTransition();

  const isExecutive =
    role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR;
  const processedByFinance = isTicketProcessedByFinance(ticket);
  const canEdit =
    !processedByFinance &&
    (isExecutive || (ticket.canSubmit && ticket.canRequesterEdit));
  const canDelete = !processedByFinance && isExecutive;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (processedByFinance) {
    if (mode === "full" && isExecutive) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5 text-amber-500" />
          Terkunci · Sudah Diproses Keuangan
        </span>
      );
    }
    return null;
  }

  if (!canEdit && !canDelete) return null;

  const getEditableItems = (): EditableTicketItem[] =>
    ticket.items.map((item) => {
      const isContract = item.categoryHint === TicketCategoryHint.CONTRACT;
      const deliveredQty =
        isContract && item.materialContractId
          ? (ticket.materialDeliveries ?? [])
              .filter(
                (delivery) => delivery.contractId === item.materialContractId,
              )
              .reduce((sum, delivery) => sum + delivery.quantityReceived, 0)
          : 0;
      return {
        id: item.id,
        stockItemId: item.stockItemId ?? null,
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        estimatedCost: item.estimatedCost ?? "",
        categoryHint: item.categoryHint ?? TicketCategoryHint.WAREHOUSE,
        expectedDeliveryDate: item.expectedDeliveryDate ?? "",
        isLinked: !isExecutive && Boolean(item.poItemId || item.doItemId),
        isContract,
        deliveredQty,
      };
    });

  const openEditor = () => {
    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setPriority(ticket.priority);
    setItems(getEditableItems());
    setToast(null);
    setIsOpen(true);
  };

  const updateItem = (
    itemId: string,
    changes: Partial<
      Pick<
        EditableTicketItem,
        | "itemName"
        | "quantity"
        | "unit"
        | "estimatedCost"
        | "categoryHint"
        | "expectedDeliveryDate"
      >
    >,
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, ...changes } : item,
      ),
    );
  };

  const addNewBlankItem = () => {
    const defaultDate =
      items.find((i) => i.expectedDeliveryDate)?.expectedDeliveryDate ||
      new Date().toISOString().slice(0, 10);
    setItems((currentItems) => [
      ...currentItems,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        stockItemId: null,
        itemName: "",
        quantity: 1,
        unit: "pcs",
        estimatedCost: "",
        categoryHint: TicketCategoryHint.WAREHOUSE,
        expectedDeliveryDate: defaultDate,
        isLinked: false,
        isContract: false,
        deliveredQty: 0,
      },
    ]);
  };

  const canSaveItems =
    (ticket.items.length === 0 && items.length === 0) ||
    (items.length > 0 &&
      items.every(
        (item) =>
          item.itemName.trim().length > 0 &&
          item.itemName.trim().length <= 160 &&
          item.unit.trim().length > 0 &&
          item.unit.trim().length <= 32 &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          item.quantity <= 1_000_000_000,
      ));

  const handleSave = () => {
    setToast(null);
    startTransition(async () => {
      try {
        const result: TicketActionResult = await updateTicketDetails(
          ticket.id,
          {
            title,
            description,
            priority,
            items:
              ticket.items.length > 0 || items.length > 0
                ? items.map(
                    ({
                      id,
                      stockItemId,
                      itemName,
                      quantity,
                      unit,
                      estimatedCost,
                      categoryHint,
                      expectedDeliveryDate,
                    }) => ({
                      id,
                      stockItemId,
                      itemName,
                      quantity,
                      unit,
                      estimatedCost:
                        estimatedCost.trim() !== ""
                          ? Number(estimatedCost)
                          : null,
                      categoryHint,
                      expectedDeliveryDate:
                        expectedDeliveryDate.trim() || null,
                    }),
                  )
                : undefined,
          },
        );
        setToast({ message: result.message, success: result.success });
        if (result.success) {
          setIsOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Ticket edit action failed:", error);
        setToast({
          message: "Tiket gagal diperbarui. Silakan coba kembali.",
          success: false,
        });
      }
    });
  };

  const handleDelete = () => {
    if (isPending) return;
    setToast(null);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (isPending) return;
    startTransition(async () => {
      try {
        const result = await deleteTicket(ticket.id);
        setToast({ message: result.message, success: result.success });
        if (result.success) {
          setIsDeleteConfirmOpen(false);
          onTicketDeleted?.();
          router.refresh();
        }
      } catch (error) {
        console.error("Ticket delete action failed:", error);
        setToast({
          message: "Tiket gagal dihapus. Silakan coba kembali.",
          success: false,
        });
      }
    });
  };

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      {mode === "full" ? (
        <>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={isPending}
              onClick={openEditor}
            >
              <Pencil className="size-3.5" />
              Edit Tiket
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-destructive/50 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={isPending}
              onClick={handleDelete}
            >
              <Trash2 className="size-3.5" />
              Hapus Tiket
            </Button>
          )}
        </>
      ) : (
        <>
          {canEdit && (
            <ActionIconButton
              type="button"
              label="Edit tiket"
              tooltip="Edit tiket & rincian barang"
              icon={Pencil}
              className="h-8 w-8"
              disabled={isPending}
              onClick={openEditor}
            />
          )}
          {canDelete && (
            <ActionIconButton
              type="button"
              label="Hapus tiket"
              tooltip="Hapus tiket"
              icon={Trash2}
              className="h-8 w-8 border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={isPending}
              onClick={handleDelete}
            />
          )}
        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[100] flex max-w-[min(24rem,calc(100vw-2.5rem))] items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl ${
            toast.success
              ? "border-emerald-500/30 bg-emerald-950 text-emerald-50"
              : "border-red-500/30 bg-red-950 text-red-50"
          }`}
          role={toast.success ? "status" : "alert"}
          aria-live={toast.success ? "polite" : "assertive"}
        >
          {toast.success ? (
            <CircleCheck
              className="size-5 shrink-0 text-emerald-300"
              aria-hidden="true"
            />
          ) : (
            <CircleAlert
              className="size-5 shrink-0 text-red-300"
              aria-hidden="true"
            />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <GlobalModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Edit Tiket ${ticket.ticketNumber}`}
        description="Perbarui informasi tiket, tambah barang baru, atau ubah/hapus rincian barang sebelum diproses Keuangan."
        className="sm:max-w-3xl"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setIsOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={
                isPending ||
                title.trim().length < 3 ||
                title.trim().length > 160 ||
                description.length > 5000 ||
                !canSaveItems
              }
              onClick={handleSave}
            >
              {isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`ticket-title-${ticket.id}`}>
                Judul Permintaan
              </Label>
              <Input
                id={`ticket-title-${ticket.id}`}
                value={title}
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ticket-priority-${ticket.id}`}>Prioritas</Label>
              <select
                id={`ticket-priority-${ticket.id}`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TicketPriority)
                }
              >
                {priorities.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`ticket-description-${ticket.id}`}>Deskripsi</Label>
            <Textarea
              id={`ticket-description-${ticket.id}`}
              value={description}
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {(items.length > 0 || ticket.type === TicketType.MATERIAL) && (
            <section className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    Rincian Barang ({items.length} Item)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Ubah nama, jumlah, satuan, harga satuan, sumber, atau tambah
                    barang baru.
                  </p>
                </div>
                {isExecutive && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    disabled={isPending}
                    onClick={addNewBlankItem}
                  >
                    <Plus className="size-3.5" />
                    Tambah Barang
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-xl border border-border bg-muted/15 p-3"
                  >
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_6rem_6rem_auto] sm:items-end">
                      <div className="col-span-2 space-y-1 sm:col-span-1">
                        <Label htmlFor={`ticket-item-name-${item.id}`}>
                          Nama Barang #{index + 1}
                        </Label>
                        <Input
                          id={`ticket-item-name-${item.id}`}
                          value={item.itemName}
                          maxLength={160}
                          placeholder="Contoh: Semen 40 Kg"
                          disabled={
                            item.isLinked || item.isContract || isPending
                          }
                          onChange={(event) =>
                            updateItem(item.id, {
                              itemName: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`ticket-item-quantity-${item.id}`}>
                          Jumlah
                        </Label>
                        <Input
                          id={`ticket-item-quantity-${item.id}`}
                          type="number"
                          min={
                            item.isContract && item.deliveredQty > 0
                              ? item.deliveredQty
                              : 0.01
                          }
                          max="1000000000"
                          step="any"
                          value={
                            Number.isFinite(item.quantity) ? item.quantity : ""
                          }
                          disabled={item.isLinked || isPending}
                          onChange={(event) =>
                            updateItem(item.id, {
                              quantity: event.target.valueAsNumber,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`ticket-item-unit-${item.id}`}>
                          Satuan
                        </Label>
                        <Input
                          id={`ticket-item-unit-${item.id}`}
                          value={item.unit}
                          maxLength={32}
                          placeholder="Zak / pcs / m2"
                          disabled={
                            item.isLinked || item.isContract || isPending
                          }
                          onChange={(event) =>
                            updateItem(item.id, { unit: event.target.value })
                          }
                        />
                      </div>
                      <ActionIconButton
                        label={`Hapus barang ${item.itemName}`}
                        tooltip={
                          item.isLinked ||
                          (item.isContract && item.deliveredQty > 0)
                            ? "Barang yang sudah diproses tidak dapat dihapus"
                            : items.length === 1
                              ? "Tiket harus memiliki setidaknya satu barang"
                              : `Hapus barang ${item.itemName}`
                        }
                        icon={Trash2}
                        disabled={
                          item.isLinked ||
                          (item.isContract && item.deliveredQty > 0) ||
                          items.length === 1 ||
                          isPending
                        }
                        onClick={() =>
                          setItems((currentItems) =>
                            currentItems.filter(
                              (currentItem) => currentItem.id !== item.id,
                            ),
                          )
                        }
                        className="self-end text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        variant="ghost"
                      />
                    </div>

                    {isExecutive && !item.isContract && (
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`ticket-item-cost-${item.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Harga Satuan Estimasi (Rp)
                          </Label>
                          <Input
                            id={`ticket-item-cost-${item.id}`}
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Opsional"
                            value={item.estimatedCost}
                            disabled={isPending}
                            onChange={(event) =>
                              updateItem(item.id, {
                                estimatedCost: event.target.value,
                              })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`ticket-item-source-${item.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Sumber Pemenuhan
                          </Label>
                          <select
                            id={`ticket-item-source-${item.id}`}
                            value={
                              item.categoryHint === TicketCategoryHint.PURCHASE
                                ? TicketCategoryHint.PURCHASE
                                : TicketCategoryHint.WAREHOUSE
                            }
                            disabled={isPending}
                            onChange={(event) =>
                              updateItem(item.id, {
                                categoryHint: event.target
                                  .value as TicketCategoryHint,
                              })
                            }
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value={TicketCategoryHint.WAREHOUSE}>
                              Stok Gudang
                            </option>
                            <option value={TicketCategoryHint.PURCHASE}>
                              Pembelian / PO
                            </option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`ticket-item-date-${item.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Target Tiba
                          </Label>
                          <Input
                            id={`ticket-item-date-${item.id}`}
                            type="date"
                            value={item.expectedDeliveryDate}
                            disabled={isPending}
                            onChange={(event) =>
                              updateItem(item.id, {
                                expectedDeliveryDate: event.target.value,
                              })
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {item.isContract && (
                      <p className="text-[11px] text-muted-foreground">
                        Item Kontrak Material Alam (nama &amp; satuan mengikuti
                        kontrak
                        {item.deliveredQty > 0
                          ? `; sudah terkirim ${item.deliveredQty} ${item.unit}`
                          : ""}
                        ).
                      </p>
                    )}
                    {item.isLinked && (
                      <p className="text-xs text-muted-foreground">
                        Sudah terhubung ke PO atau Surat Jalan dan tidak dapat
                        diedit oleh pemohon.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </GlobalModal>

      <GlobalModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          if (!isPending) setIsDeleteConfirmOpen(false);
        }}
        title="Hapus tiket ini?"
        description="Tindakan ini tidak dapat dibatalkan."
        icon={<Trash2 aria-hidden="true" className="size-5 text-destructive" />}
        className="sm:max-w-lg"
        bodyClassName="space-y-3"
        footerNote="Pastikan Anda memahami dampak penghapusan."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {isPending ? "Menghapus..." : "Hapus Tiket"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed">
          Tiket <span className="font-semibold">{ticket.ticketNumber}</span> (
          {ticket.title}) beserta seluruh rincian barang dan dokumen operasional
          terkait akan dihapus secara permanen.
        </p>
      </GlobalModal>
    </div>
  );
}
