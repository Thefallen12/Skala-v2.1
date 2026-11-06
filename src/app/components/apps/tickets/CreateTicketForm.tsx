"use client";

import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  TicketCategoryHint,
  TicketPriority,
  TicketRequestCategory,
  TicketType,
} from "@prisma/client";
import type { TicketProjectOption } from "@/app/(DashboardLayout)/types/ticket";
import { createTicket } from "@/app/actions/tickets";
import { Button } from "@/components/ui/button";
import { ActionIconButton } from "@/components/ui/action-icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GlobalModal } from "@/components/ui/global-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TicketFormValues = {
  title: string;
  description: string;
  type: TicketType;
  priority: TicketPriority;
  projectId: string;
  attachmentUrl: string;
  items: {
    itemName: string;
    quantity: number;
    unit: string;
    estimatedCost?: number;
    categoryHint: TicketCategoryHint;
    expectedDeliveryDate?: string;
  }[];
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);

export default function CreateTicketForm({
  projects,
}: {
  projects: TicketProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const form = useForm<TicketFormValues>({
    defaultValues: {
      title: "",
      description: "",
      type: TicketType.MATERIAL,
      priority: TicketPriority.MEDIUM,
      projectId: "",
      attachmentUrl: "",
      items: [{
        itemName: "",
        quantity: 1,
        unit: "pcs",
        estimatedCost: undefined,
        categoryHint: TicketCategoryHint.PURCHASE,
        expectedDeliveryDate: "",
      }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedType = useWatch({ control: form.control, name: "type" });
  const hasEstimatedCosts = (watchedItems ?? []).some(
    (item) => Number.isFinite(item.estimatedCost),
  );
  const totalAmount = useMemo(
    () =>
      (watchedItems ?? []).reduce(
        (total, item) =>
          total +
          (Number.isFinite(item.quantity) ? item.quantity : 0) *
            (Number.isFinite(item.estimatedCost) ? item.estimatedCost ?? 0 : 0),
        0,
      ),
    [watchedItems],
  );

  const submit = form.handleSubmit(async (values) => {
    setError("");
    setIsSubmitting(true);
    try {
      const result = await createTicket({
        ...values,
        requestCategory:
          values.type === TicketType.OPERATIONAL
            ? TicketRequestCategory.OPS
            : values.type === TicketType.MATERIAL
              ? TicketRequestCategory.MATERIAL
              : TicketRequestCategory.OFFICE,
        description: values.description || undefined,
        projectId: values.projectId || undefined,
        attachmentUrl: values.attachmentUrl || undefined,
      });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (submitError) {
      console.error("Ticket form submission failed:", submitError);
      setError("Tiket gagal disimpan. Periksa koneksi lalu coba kembali.");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Buat tiket
      </Button>
      <GlobalModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Buat pengajuan baru"
        description="Isi permintaan dan rincian item. Tiket akan disimpan sebagai draft sebelum diajukan untuk persetujuan Direktur."
        className="max-w-3xl"
      >

        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={isSubmitting} className="contents">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="ticket-title" className="mb-2 block">
                Judul permintaan
              </Label>
              <Input
                id="ticket-title"
                {...form.register("title", { required: true, minLength: 3, maxLength: 160 })}
                placeholder="Contoh: Pengadaan semen proyek A"
              />
            </div>
            <div>
              <Label className="mb-2 block">Jenis permintaan</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Jenis permintaan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TicketType.MATERIAL}>Material</SelectItem>
                      <SelectItem value={TicketType.COST}>Biaya</SelectItem>
                      <SelectItem value={TicketType.OPERATIONAL}>Operasional</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label className="mb-2 block">Prioritas</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Prioritas">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TicketPriority.LOW}>Rendah</SelectItem>
                      <SelectItem value={TicketPriority.MEDIUM}>Sedang</SelectItem>
                      <SelectItem value={TicketPriority.HIGH}>Tinggi</SelectItem>
                      <SelectItem value={TicketPriority.URGENT}>Mendesak</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {projects.length > 0 && (
              <div>
                <Label className="mb-2 block">Proyek (opsional)</Label>
                <Controller
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <Select
                      value={field.value || "none"}
                      onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                    >
                      <SelectTrigger className="w-full" aria-label="Proyek">
                        <SelectValue placeholder="Pilih proyek" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tidak terkait proyek</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.kelompokTani} - {project.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="ticket-description" className="mb-2 block">
              Deskripsi
            </Label>
            <Textarea
              id="ticket-description"
              {...form.register("description", { maxLength: 10000 })}
              placeholder="Jelaskan kebutuhan atau latar belakang pengajuan"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Rincian item</h3>
                <p className="text-sm text-muted-foreground">
                  Harga satuan bersifat estimasi.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    itemName: "",
                    quantity: 1,
                    unit: "pcs",
                    estimatedCost: undefined,
                    categoryHint: TicketCategoryHint.PURCHASE,
                    expectedDeliveryDate: "",
                  })
                }
                disabled={fields.length >= 100}
              >
                <Plus aria-hidden="true" />
                Tambah item
              </Button>
            </div>

            <div className="mb-3 space-y-4 rounded-md border p-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(8rem,0.8fr)_minmax(9rem,0.9fr)_minmax(9rem,1fr)_3rem]"
                >
                {watchedType === TicketType.MATERIAL && (
                  <div>
                    <Label className="mb-2 block">Sumber Barang</Label>
                    <Controller
                      control={form.control}
                      name={`items.${index}.categoryHint`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value: TicketCategoryHint) => {
                            field.onChange(value);
                            form.setValue(
                              `items.${index}.expectedDeliveryDate`,
                              "",
                            );
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={TicketCategoryHint.WAREHOUSE}>
                              Gudang (Stok)
                            </SelectItem>
                            <SelectItem value={TicketCategoryHint.PURCHASE}>
                              Pembelian Baru
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor={`item-${index}`} className="mb-2 block">
                    Nama item
                  </Label>
                  <Input
                    id={`item-${index}`}
                    {...form.register(`items.${index}.itemName`, {
                      required: true,
                      maxLength: 160,
                    })}
                    placeholder="Nama item"
                  />
                </div>
                <div>
                  <Label htmlFor={`quantity-${index}`} className="mb-2 block">
                    Jumlah
                  </Label>
                  <Input
                    id={`quantity-${index}`}
                    type="number"
                    min="0.001"
                    step="any"
                    {...form.register(`items.${index}.quantity`, {
                      required: true,
                      valueAsNumber: true,
                      min: 0.001,
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor={`unit-${index}`} className="mb-2 block">
                    Satuan
                  </Label>
                  <Input
                    id={`unit-${index}`}
                    {...form.register(`items.${index}.unit`, {
                      required: true,
                      maxLength: 32,
                    })}
                    placeholder="pcs"
                  />
                </div>
                <div>
                  <Label htmlFor={`cost-${index}`} className="mb-2 block">
                    Harga satuan
                  </Label>
                  <Input
                    id={`cost-${index}`}
                    type="number"
                    min="0"
                    step="any"
                    {...form.register(`items.${index}.estimatedCost`, {
                      setValueAs: (value: string) =>
                        value === "" ? undefined : Number(value),
                      min: 0,
                    })}
                    placeholder="Opsional"
                  />
                </div>
                {watchedType === TicketType.MATERIAL &&
                  watchedItems?.[index]?.categoryHint ===
                    TicketCategoryHint.WAREHOUSE && (
                    <div>
                      <Label
                        htmlFor={`delivery-date-${index}`}
                        className="mb-2 block"
                      >
                        Tanggal Diperlukan
                      </Label>
                      <Input
                        id={`delivery-date-${index}`}
                        type="date"
                        required
                        {...form.register(
                          `items.${index}.expectedDeliveryDate`,
                          { required: "Tanggal diperlukan wajib diisi." },
                        )}
                      />
                    </div>
                  )}
                <ActionIconButton
                  label={`Hapus item ${index + 1}`}
                  tooltip={`Hapus item ${index + 1}`}
                  icon={Trash2}
                  className="text-red-500 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                  variant="ghost"
                />
                </div>
              ))}
            </div>

            <p className="text-right font-semibold">
              Total estimasi:{" "}
              {hasEstimatedCosts ? formatCurrency(totalAmount) : "Belum diisi"}
            </p>
          </div>

          <div>
            <Label htmlFor="attachment-url" className="mb-2 block">
              URL bukti / quotation (opsional)
            </Label>
            <Input
              id="attachment-url"
              type="url"
              {...form.register("attachmentUrl", { maxLength: 2048 })}
              placeholder="https://..."
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Menyimpan...
                </>
              ) : (
                "Simpan draft"
              )}
            </Button>
          </div>
          </fieldset>
        </form>
      </GlobalModal>
    </>
  );
}
