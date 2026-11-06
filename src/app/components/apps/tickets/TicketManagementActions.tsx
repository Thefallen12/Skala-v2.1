"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Pencil, Trash2 } from "lucide-react";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import {
  deleteTicket,
  updateTicketDetails,
  type TicketActionResult,
} from "@/app/actions/tickets";
import { TicketPriority, UserRole } from "@prisma/client";
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
  itemName: string;
  quantity: number;
  unit: string;
  isLinked: boolean;
};

type TicketToast = {
  message: string;
  success: boolean;
};

export default function TicketManagementActions({
  ticket,
  role,
}: {
  ticket: TicketRow;
  role: UserRole;
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
  const isDirector = role === UserRole.DIRECTOR;
  const canEdit =
    isDirector || (ticket.canSubmit && ticket.canRequesterEdit);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!canEdit && !isDirector) return null;

  const getEditableItems = (): EditableTicketItem[] =>
    ticket.items.map((item) => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      isLinked: Boolean(item.poItemId || item.doItemId),
    }));

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
    changes: Partial<Pick<EditableTicketItem, "itemName" | "quantity" | "unit">>,
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId ? { ...item, ...changes } : item,
      ),
    );
  };

  const canSaveItems = items.every(
    (item) =>
      item.itemName.trim().length > 0 &&
      item.itemName.trim().length <= 160 &&
      item.unit.trim().length > 0 &&
      item.unit.trim().length <= 32 &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0 &&
      item.quantity <= 1_000_000_000,
  );

  const handleSave = () => {
    setToast(null);
    startTransition(async () => {
      try {
        const result: TicketActionResult = await updateTicketDetails(ticket.id, {
          title,
          description,
          priority,
          items: items.map(({ id, itemName, quantity, unit }) => ({
            id,
            itemName,
            quantity,
            unit,
          })),
        });
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
    <div className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      {canEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          disabled={isPending}
          title="Edit tiket"
          onClick={openEditor}
        >
          <Pencil aria-hidden="true" className="size-3" />
          Edit
        </Button>
      )}
      {isDirector && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-7 gap-1 px-2 text-xs"
          disabled={isPending}
          title="Hapus tiket"
          onClick={handleDelete}
        >
          <Trash2 aria-hidden="true" className="size-3" />
          Hapus
        </Button>
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
            <CircleCheck className="size-5 shrink-0 text-emerald-300" aria-hidden="true" />
          ) : (
            <CircleAlert className="size-5 shrink-0 text-red-300" aria-hidden="true" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
      <GlobalModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Edit tiket ${ticket.ticketNumber}`}
        description="Perbarui informasi tiket dan barang langsung di formulir ini."
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
              {isPending ? "Menyimpan..." : "Simpan perubahan"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`ticket-title-${ticket.id}`}>Judul permintaan</Label>
            <Input
              id={`ticket-title-${ticket.id}`}
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ticket-description-${ticket.id}`}>Deskripsi</Label>
            <Textarea
              id={`ticket-description-${ticket.id}`}
              value={description}
              maxLength={5000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
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
          {items.length > 0 && (
            <section className="space-y-3 border-t border-border pt-4">
              <div>
                <h3 className="text-sm font-semibold">Barang tiket</h3>
                <p className="text-xs text-muted-foreground">
                  Ubah nama, jumlah, atau satuan. Barang yang sudah masuk PO
                  atau Surat Jalan tidak dapat diubah.
                </p>
              </div>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto] sm:items-end"
                  >
                    <div className="col-span-2 space-y-1.5 sm:col-span-1">
                      <Label htmlFor={`ticket-item-name-${item.id}`}>
                        Barang {index + 1}
                      </Label>
                      <Input
                        id={`ticket-item-name-${item.id}`}
                        value={item.itemName}
                        maxLength={160}
                        disabled={item.isLinked || isPending}
                        onChange={(event) =>
                          updateItem(item.id, {
                            itemName: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ticket-item-quantity-${item.id}`}>
                        Jumlah
                      </Label>
                      <Input
                        id={`ticket-item-quantity-${item.id}`}
                        type="number"
                        min="0"
                        max="1000000000"
                        step="any"
                        value={Number.isFinite(item.quantity) ? item.quantity : ""}
                        disabled={item.isLinked || isPending}
                        onChange={(event) =>
                          updateItem(item.id, {
                            quantity: event.target.valueAsNumber,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ticket-item-unit-${item.id}`}>
                        Satuan
                      </Label>
                      <Input
                        id={`ticket-item-unit-${item.id}`}
                        value={item.unit}
                        maxLength={32}
                        disabled={item.isLinked || isPending}
                        onChange={(event) =>
                          updateItem(item.id, { unit: event.target.value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 self-end text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Hapus barang ${item.itemName}`}
                      title={
                        item.isLinked
                          ? "Barang yang sudah diproses tidak dapat dihapus"
                          : items.length === 1
                            ? "Tiket harus memiliki setidaknya satu barang"
                            : "Hapus barang"
                      }
                      disabled={item.isLinked || items.length === 1 || isPending}
                      onClick={() =>
                        setItems((currentItems) =>
                          currentItems.filter(
                            (currentItem) => currentItem.id !== item.id,
                          ),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                    {item.isLinked && (
                      <p className="col-span-2 text-xs text-muted-foreground sm:col-span-4">
                        Sudah terhubung ke PO atau Surat Jalan dan tidak dapat
                        diedit.
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
              {isPending ? "Menghapus..." : "Hapus tiket"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed">
          Tiket <span className="font-semibold">{ticket.ticketNumber}</span> dan
          dokumen operasional terkait akan dihapus. PO, pembelian, transaksi
          pembayaran, serta Surat Jalan akan tetap tersimpan, tetapi tidak lagi
          terhubung ke tiket ini.
        </p>
      </GlobalModal>
    </div>
  );
}
