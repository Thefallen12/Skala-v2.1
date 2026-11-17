"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  TicketCategoryHint,
  TicketPriority,
  TicketType,
  UserRole,
} from "@prisma/client";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import {
  deleteTicket,
  updateTicketDetails,
  type TicketActionResult,
} from "@/app/actions/tickets";
import { isTicketProcessedByFinance } from "@/lib/ticket-finance-lock";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Textarea } from "@/components/ui/textarea";

const priorities: { value: TicketPriority; label: string }[] = [
  { value: TicketPriority.LOW, label: "Rendah" },
  { value: TicketPriority.MEDIUM, label: "Sedang" },
  { value: TicketPriority.HIGH, label: "Tinggi" },
  { value: TicketPriority.URGENT, label: "Mendesak" },
];

export type EditableTicketItem = {
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

export type TicketManageMode = "edit" | "delete";

export function getTicketManagementPermissions(
  ticket: TicketRow,
  role: UserRole,
) {
  const isExecutive =
    role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR;
  const processedByFinance = isTicketProcessedByFinance(ticket);
  const canEdit =
    !processedByFinance &&
    (isExecutive || (ticket.canSubmit && ticket.canRequesterEdit));
  const canDelete = !processedByFinance && isExecutive;
  return { isExecutive, processedByFinance, canEdit, canDelete };
}

function buildEditableItems(
  ticket: TicketRow,
  isExecutive: boolean,
): EditableTicketItem[] {
  return ticket.items.map((item) => {
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
}

function EditableTicketItemCard({
  item,
  index,
  isExecutive,
  isPending,
  canRemove,
  onUpdate,
  onRemove,
}: {
  item: EditableTicketItem;
  index: number;
  isExecutive: boolean;
  isPending: boolean;
  canRemove: boolean;
  onUpdate: (
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
  ) => void;
  onRemove: (itemId: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1.4fr)_6rem_6rem_auto] sm:items-end">
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <Label htmlFor={`ticket-item-name-${item.id}`} className="type-p2">
            Barang #{index + 1}
          </Label>
          <Input
            id={`ticket-item-name-${item.id}`}
            value={item.itemName}
            maxLength={160}
            placeholder="Contoh: Semen 40 Kg"
            disabled={item.isLinked || item.isContract || isPending}
            onChange={(event) =>
              onUpdate(item.id, { itemName: event.target.value })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ticket-item-quantity-${item.id}`} className="type-p2">
            Jumlah
          </Label>
          <Input
            id={`ticket-item-quantity-${item.id}`}
            type="number"
            min={item.isContract && item.deliveredQty > 0 ? item.deliveredQty : 0.01}
            max="1000000000"
            step="any"
            value={Number.isFinite(item.quantity) ? item.quantity : ""}
            disabled={item.isLinked || isPending}
            onChange={(event) =>
              onUpdate(item.id, { quantity: event.target.valueAsNumber })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ticket-item-unit-${item.id}`} className="type-p2">
            Satuan
          </Label>
          <Input
            id={`ticket-item-unit-${item.id}`}
            value={item.unit}
            maxLength={32}
            placeholder="zak / pcs"
            disabled={item.isLinked || item.isContract || isPending}
            onChange={(event) =>
              onUpdate(item.id, { unit: event.target.value })
            }
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Hapus barang ${item.itemName}`}
          disabled={!canRemove || isPending}
          onClick={() => onRemove(item.id)}
          className="self-end text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {isExecutive && !item.isContract && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="space-y-1">
            <Label
              htmlFor={`ticket-item-cost-${item.id}`}
              className="type-p3 text-muted-foreground"
            >
              Harga Satuan (Rp)
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
                onUpdate(item.id, { estimatedCost: event.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor={`ticket-item-source-${item.id}`}
              className="type-p3 text-muted-foreground"
            >
              Sumber
            </Label>
            <Select
              value={
                item.categoryHint === TicketCategoryHint.PURCHASE
                  ? TicketCategoryHint.PURCHASE
                  : TicketCategoryHint.WAREHOUSE
              }
              disabled={isPending}
              onValueChange={(value) =>
                onUpdate(item.id, {
                  categoryHint: value as TicketCategoryHint,
                })
              }
            >
              <SelectTrigger id={`ticket-item-source-${item.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TicketCategoryHint.WAREHOUSE}>
                  Stok Gudang
                </SelectItem>
                <SelectItem value={TicketCategoryHint.PURCHASE}>
                  Pembelian / PO
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor={`ticket-item-date-${item.id}`}
              className="type-p3 text-muted-foreground"
            >
              Target Tiba
            </Label>
            <DatePicker
              id={`ticket-item-date-${item.id}`}
              value={item.expectedDeliveryDate}
              clearable
              disabled={isPending}
              onValueChange={(val) =>
                onUpdate(item.id, { expectedDeliveryDate: val })
              }
              placeholder="Pilih tanggal"
            />
          </div>
        </div>
      )}

      {item.isContract && (
        <p className="type-p3 text-muted-foreground">
          Item Kontrak Material Alam (nama &amp; satuan mengikuti kontrak
          {item.deliveredQty > 0
            ? `; terkirim ${item.deliveredQty} ${item.unit}`
            : ""}
          ).
        </p>
      )}
      {item.isLinked && (
        <p className="type-p3 text-muted-foreground">
          Sudah terhubung ke PO atau Surat Jalan.
        </p>
      )}
    </div>
  );
}

function TicketManageFormBody({
  ticket,
  role,
  onClose,
}: {
  ticket: TicketRow;
  role: UserRole;
  onClose: () => void;
}) {
  const router = useRouter();
  const { isExecutive } = getTicketManagementPermissions(ticket, role);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [items, setItems] = useState<EditableTicketItem[]>(() =>
    buildEditableItems(ticket, isExecutive),
  );
  const [isPending, startTransition] = useTransition();

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
        if (result.success) {
          toast.success(result.message);
          onClose();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Ticket edit action failed:", error);
        toast.error("Tiket gagal diperbarui. Silakan coba kembali.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      title={`Edit Tiket ${ticket.ticketNumber}`}
      description="Perbarui rincian tiket sebelum diproses Keuangan."
      className="sm:max-w-3xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onClose}
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
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`ticket-title-${ticket.id}`} className="type-p2">
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
            <Label htmlFor={`ticket-priority-${ticket.id}`} className="type-p2">
              Prioritas
            </Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as TicketPriority)}
            >
              <SelectTrigger id={`ticket-priority-${ticket.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`ticket-description-${ticket.id}`} className="type-p2">
            Deskripsi
          </Label>
          <Textarea
            id={`ticket-description-${ticket.id}`}
            value={description}
            maxLength={5000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {(items.length > 0 || ticket.type === TicketType.MATERIAL) && (
          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="type-h3 text-foreground">
                  Rincian Barang ({items.length})
                </h3>
                <p className="type-p3 text-muted-foreground">
                  Ubah nama, jumlah, satuan, atau sumber pemenuhan item.
                </p>
              </div>
              {isExecutive && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={addNewBlankItem}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Tambah Barang
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <EditableTicketItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  isExecutive={isExecutive}
                  isPending={isPending}
                  canRemove={
                    !item.isLinked &&
                    !(item.isContract && item.deliveredQty > 0) &&
                    items.length > 1
                  }
                  onUpdate={updateItem}
                  onRemove={(itemId) =>
                    setItems((current) =>
                      current.filter((currentItem) => currentItem.id !== itemId),
                    )
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </GlobalModal>
  );
}

export function TicketManagementModal({
  ticket,
  mode,
  role,
  onClose,
  onTicketDeleted,
}: {
  ticket: TicketRow | null;
  mode: TicketManageMode | null;
  role: UserRole;
  onClose: () => void;
  onTicketDeleted?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!ticket || !mode) return null;

  if (mode === "edit") {
    return (
      <TicketManageFormBody
        key={`${ticket.id}:edit`}
        ticket={ticket}
        role={role}
        onClose={onClose}
      />
    );
  }

  const confirmDelete = () => {
    if (isPending) return;
    startTransition(async () => {
      try {
        const result = await deleteTicket(ticket.id);
        if (result.success) {
          toast.success(result.message);
          onClose();
          onTicketDeleted?.();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Ticket delete action failed:", error);
        toast.error("Tiket gagal dihapus. Silakan coba kembali.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen
      onClose={() => {
        if (!isPending) onClose();
      }}
      title="Hapus Tiket?"
      description="Tindakan ini tidak dapat dibatalkan."
      icon={<Trash2 aria-hidden="true" className="size-5 text-destructive" />}
      className="sm:max-w-lg"
      footerNote="Pastikan Anda memahami dampak penghapusan."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onClose}
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
            {isPending ? "Menghapus..." : "Hapus"}
          </Button>
        </>
      }
    >
      <p className="type-p2 leading-relaxed text-foreground">
        Tiket <span className="font-semibold">{ticket.ticketNumber}</span> (
        {ticket.title}) beserta rincian dan dokumen terkait akan dihapus
        permanen.
      </p>
    </GlobalModal>
  );
}

/**
 * Legacy row-trigger wrapper kept solely for untouched compatibility files.
 * New directory views use hoisted `TicketManagementModal` directly.
 */
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
  const [activeMode, setActiveMode] = useState<TicketManageMode | null>(null);
  const { isExecutive, processedByFinance, canEdit, canDelete } =
    getTicketManagementPermissions(ticket, role);

  if (processedByFinance) {
    if (mode === "full" && isExecutive) {
      return (
        <span className="type-p3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 font-medium text-muted-foreground">
          <Lock className="size-3.5 text-amber-500" aria-hidden="true" />
          Terkunci
        </span>
      );
    }
    return null;
  }

  if (!canEdit && !canDelete) return null;

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      {mode === "full" ? (
        <>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveMode("edit")}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setActiveMode("delete")}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Hapus
            </Button>
          )}
        </>
      ) : (
        <>
          {canEdit && (
            <ActionIconButton
              type="button"
              label="Edit tiket"
              tooltip="Edit tiket"
              icon={Pencil}
              className="size-9"
              onClick={() => setActiveMode("edit")}
            />
          )}
          {canDelete && (
            <ActionIconButton
              type="button"
              label="Hapus tiket"
              tooltip="Hapus tiket"
              icon={Trash2}
              className="size-9 border-destructive/70 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setActiveMode("delete")}
            />
          )}
        </>
      )}

      <TicketManagementModal
        ticket={activeMode ? ticket : null}
        mode={activeMode}
        role={role}
        onClose={() => setActiveMode(null)}
        onTicketDeleted={onTicketDeleted}
      />
    </div>
  );
}
