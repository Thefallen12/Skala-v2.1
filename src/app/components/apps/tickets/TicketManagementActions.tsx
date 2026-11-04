"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type { TicketRow } from "@/app/(DashboardLayout)/types/ticket";
import {
  deleteTicket,
  updateTicketDetails,
  type TicketActionResult,
} from "@/app/actions/tickets";
import { TicketPriority, TicketStatus, UserRole } from "@prisma/client";
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

export default function TicketManagementActions({
  ticket,
  role,
}: {
  ticket: TicketRow;
  role: UserRole;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [priority, setPriority] = useState(ticket.priority);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isDirector = role === UserRole.DIRECTOR;
  const canEdit =
    isDirector || (ticket.canSubmit && ticket.canRequesterEdit);
  const canDelete =
    ticket.status === TicketStatus.DRAFT &&
    (ticket.purchaseOrders?.length ?? 0) === 0 &&
    (ticket.directStockPurchases?.length ?? 0) === 0 &&
    (ticket.paymentTransactions?.length ?? 0) === 0 &&
    (ticket.deliveryOrders?.length ?? 0) === 0 &&
    (ticket.operationalDocuments?.length ?? 0) === 0 &&
    ticket.items.every((item) => !item.poItemId && !item.doItemId);

  if (!canEdit && !isDirector) return null;

  const openEditor = () => {
    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setPriority(ticket.priority);
    setMessage("");
    setIsOpen(true);
  };

  const handleSave = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const result: TicketActionResult = await updateTicketDetails(ticket.id, {
          title,
          description,
          priority,
        });
        setMessage(result.message);
        if (result.success) {
          setIsOpen(false);
          router.refresh();
        }
      } catch (error) {
        console.error("Ticket edit action failed:", error);
        setMessage("Tiket gagal diperbarui. Silakan coba kembali.");
      }
    });
  };

  const handleDelete = () => {
    if (
      !canDelete ||
      !window.confirm(
        `Hapus tiket ${ticket.ticketNumber}? Penghapusan hanya tersedia untuk tiket Draft yang belum diproses.`,
      )
    ) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const result = await deleteTicket(ticket.id);
        setMessage(result.message);
        if (result.success) router.refresh();
      } catch (error) {
        console.error("Ticket delete action failed:", error);
        setMessage("Tiket gagal dihapus. Silakan coba kembali.");
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
          disabled={!canDelete || isPending}
          title={
            canDelete
              ? "Hapus tiket Draft"
              : "Tiket hanya dapat dihapus selama masih berstatus Draft"
          }
          onClick={handleDelete}
        >
          <Trash2 aria-hidden="true" className="size-3" />
          Hapus
        </Button>
      )}
      {message && !isOpen && (
        <p className="max-w-36 truncate text-[11px] text-destructive" role="alert">
          {message}
        </p>
      )}
      <GlobalModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Edit tiket ${ticket.ticketNumber}`}
        description="Ubah judul, deskripsi, atau prioritas tiket."
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
              disabled={isPending || title.trim().length < 3}
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
          {message && (
            <p className="text-sm text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </div>
      </GlobalModal>
    </div>
  );
}
