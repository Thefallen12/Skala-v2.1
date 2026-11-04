"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDashboardRow } from "@/app/(DashboardLayout)/types/project";
import type { FieldTeamOption } from "@/app/(DashboardLayout)/types/project";
import {
  saveProject,
  type ProjectFormInput,
} from "@/app/actions/project";
import { ProjectPriority } from "@prisma/client";
import { Button } from "@/components/ui/button";
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

const priorityOptions: { value: ProjectPriority; label: string }[] = [
  { value: ProjectPriority.LOW, label: "Rendah" },
  { value: ProjectPriority.MEDIUM, label: "Sedang" },
  { value: ProjectPriority.HIGH, label: "Tinggi" },
  { value: ProjectPriority.URGENT, label: "Mendesak" },
];

type ProjectFormValues = Omit<ProjectFormInput, "progress"> & {
  progress: string;
};

type EditableProject = Pick<
  ProjectDashboardRow,
  | "id"
  | "code"
  | "title"
  | "kelompokTani"
  | "address"
  | "jenisPekerjaan"
  | "pagu"
  | "landArea"
  | "progress"
  | "priority"
  | "vendor"
  | "clientName"
  | "location"
  | "startDate"
  | "endDate"
  | "budget"
  | "fieldPicId"
>;

function isProjectPriority(value: string): value is ProjectPriority {
  return priorityOptions.some((option) => option.value === value);
}

function getInitialValues(project: EditableProject | null): ProjectFormValues {
  return {
    code: project?.code ?? "",
    title: project?.title ?? "",
    kelompokTani: project?.kelompokTani ?? "",
    address: project?.address ?? "",
    jenisPekerjaan: project?.jenisPekerjaan ?? "",
    pagu: project?.pagu ?? "",
    landArea: project?.landArea ?? "",
    progress: String(project?.progress ?? 0),
    priority: project?.priority ?? ProjectPriority.MEDIUM,
    vendor: project?.vendor ?? "",
    clientName: project?.clientName ?? "",
    location: project?.location ?? "",
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
    budget: project?.budget ?? "",
    fieldPicId: project?.fieldPicId ?? "",
  };
}

export default function ProjectFormModal({
  project,
  fieldTeamUsers,
  canManageUsers = false,
  canViewBudget = true,
  open,
  onOpenChange,
}: {
  project: EditableProject | null;
  fieldTeamUsers: FieldTeamOption[];
  canManageUsers?: boolean;
  canViewBudget?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(() =>
    getInitialValues(project),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const updateValue = <Key extends keyof ProjectFormValues>(
    key: Key,
    value: ProjectFormValues[Key],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    startTransition(async () => {
      try {
        const { pagu, budget, ...projectValues } = values;
        const result = await saveProject(project?.id ?? null, {
          ...projectValues,
          ...(canViewBudget ? { pagu, budget } : {}),
          progress: Number(values.progress),
        });
        if (!result.success) {
          setErrorMessage(result.message);
          return;
        }
        if (!project) setValues(getInitialValues(null));
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        console.error("Project form submission failed:", error);
        setErrorMessage("Data proyek gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={project ? "Edit proyek" : "Tambah proyek"}
      description="Lengkapi informasi proyek. Kolom bertanda wajib harus diisi."
      className="max-w-4xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="submit" form="project-form" disabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan proyek"}
          </Button>
        </>
      }
    >
        <form id="project-form" className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-code">Kode proyek *</Label>
              <Input
                id="project-code"
                required
                maxLength={40}
                value={values.code}
                disabled={isPending}
                onChange={(event) => updateValue("code", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-title">Nama proyek *</Label>
              <Input
                id="project-title"
                required
                maxLength={180}
                value={values.title}
                disabled={isPending}
                onChange={(event) => updateValue("title", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-group">Kelompok tani *</Label>
              <Input
                id="project-group"
                required
                maxLength={160}
                value={values.kelompokTani}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("kelompokTani", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-address">Alamat *</Label>
              <Input
                id="project-address"
                required
                maxLength={240}
                value={values.address}
                disabled={isPending}
                onChange={(event) => updateValue("address", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-work-type">Jenis pekerjaan</Label>
              <Input
                id="project-work-type"
                maxLength={180}
                placeholder="Contoh: Rehabilitasi jaringan irigasi"
                value={values.jenisPekerjaan}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("jenisPekerjaan", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-field-pic">Penunjukan PIC Lapangan</Label>
              <Select
                value={values.fieldPicId || "unassigned"}
                disabled={isPending}
                onValueChange={(value) =>
                  updateValue("fieldPicId", value === "unassigned" ? "" : value)
                }
              >
                <SelectTrigger id="project-field-pic" className="w-full">
                  <SelectValue placeholder="Pilih PIC lapangan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Belum ditentukan</SelectItem>
                  {fieldTeamUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pilih Team Lapangan atau Koordinator Lapangan. Proyek baru
                berstatus PENDING SETUP sampai PIC dan upah disetujui Direktur.
              </p>
              {fieldTeamUsers.length === 0 && (
                <p className="text-sm text-warning">
                  Belum ada akun Team Lapangan atau Koordinator Lapangan aktif
                  yang dapat ditetapkan sebagai PIC. Buat atau aktifkan akun
                  dengan salah satu role tersebut melalui Manajemen Pengguna.
                  {canManageUsers && (
                    <>
                      {" "}
                      <Link href="/apps/settings?tab=users" className="font-medium underline">
                        Buka Manajemen Pengguna
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
            {canViewBudget && (
              <div className="space-y-2">
              <Label htmlFor="project-budget-plan">
                {project ? "Pagu terbaru setelah CCO (Rp) *" : "Pagu (Rp) *"}
              </Label>
              <Input
                id="project-budget-plan"
                type="number"
                inputMode="decimal"
                min="0.01"
                max="9999999999999999.99"
                step="0.01"
                required
                value={values.pagu}
                disabled={isPending}
                onChange={(event) => updateValue("pagu", event.target.value)}
              />
              {project && (
                <p className="text-xs text-muted-foreground">
                  Perbarui pagu sesuai nilai yang berlaku setelah CCO, jika ada.
                </p>
              )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="project-area">Luas lahan (Ha)</Label>
              <Input
                id="project-area"
                type="number"
                inputMode="decimal"
                min="0"
                max="9999999999.99"
                step="0.01"
                value={values.landArea}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("landArea", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-progress">Progres (%)</Label>
              <Input
                id="project-progress"
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={values.progress}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("progress", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-priority">Prioritas</Label>
              <Select
                value={values.priority}
                disabled={isPending}
                onValueChange={(value) => {
                  if (isProjectPriority(value)) updateValue("priority", value);
                }}
              >
                <SelectTrigger id="project-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-vendor">Vendor</Label>
              <Input
                id="project-vendor"
                maxLength={160}
                value={values.vendor}
                disabled={isPending}
                onChange={(event) => updateValue("vendor", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-client">Nama klien</Label>
              <Input
                id="project-client"
                maxLength={160}
                value={values.clientName}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("clientName", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-location">Lokasi</Label>
              <Input
                id="project-location"
                maxLength={240}
                value={values.location}
                disabled={isPending}
                onChange={(event) => updateValue("location", event.target.value)}
              />
            </div>
            {canViewBudget && (
              <div className="space-y-2">
              <Label htmlFor="project-budget">Anggaran tambahan (Rp)</Label>
              <Input
                id="project-budget"
                type="number"
                inputMode="decimal"
                min="0"
                max="9999999999999999.99"
                step="0.01"
                value={values.budget}
                disabled={isPending}
                onChange={(event) => updateValue("budget", event.target.value)}
              />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="project-start-date">Tanggal mulai</Label>
              <Input
                id="project-start-date"
                type="date"
                value={values.startDate}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("startDate", event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-end-date">Tanggal selesai</Label>
              <Input
                id="project-end-date"
                type="date"
                value={values.endDate}
                disabled={isPending}
                onChange={(event) => updateValue("endDate", event.target.value)}
              />
            </div>
          </div>

          {errorMessage && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

        </form>
    </GlobalModal>
  );
}
