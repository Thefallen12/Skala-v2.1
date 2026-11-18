"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type {
  FieldTeamOption,
  ProjectDashboardRow,
} from "@/app/(DashboardLayout)/types/project";
import {
  applyWorkTypeTemplate,
  saveProject,
  type ProjectFormInput,
} from "@/app/actions/project";
import { ProjectPriority } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOM_WORK_TYPE_LABEL,
  PROJECT_WORK_TYPE_GROUPS,
  PROJECT_WORK_TYPES,
  formatWorkTypeBadge,
  getWorkTypeChecklistTemplates,
  isConsultancyWorkType,
} from "@/lib/project-work-types";
import { cn } from "@/lib/utils";

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

function isCanonicalWorkTypeLabel(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return PROJECT_WORK_TYPES.some(
    (item) => !item.isCustomFallback && item.label.toLowerCase() === trimmed,
  );
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
  const [isCustomWorkType, setIsCustomWorkType] = useState<boolean>(() => {
    const initial = project?.jenisPekerjaan?.trim() ?? "";
    return Boolean(initial) && !isCanonicalWorkTypeLabel(initial);
  });
  const [workTypePopoverOpen, setWorkTypePopoverOpen] = useState(false);
  const [applyTemplate, setApplyTemplate] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [prevOpen, setPrevOpen] = useState(open);
  const [prevProjectId, setPrevProjectId] = useState<string | null>(
    project?.id ?? null,
  );

  if (open !== prevOpen || (project?.id ?? null) !== prevProjectId) {
    setPrevOpen(open);
    setPrevProjectId(project?.id ?? null);
    if (open) {
      const next = getInitialValues(project);
      setValues(next);
      const initialWt = next.jenisPekerjaan.trim();
      setIsCustomWorkType(
        Boolean(initialWt) && !isCanonicalWorkTypeLabel(initialWt),
      );
      setApplyTemplate(false);
      setErrorMessage("");
    }
  }

  const updateValue = <Key extends keyof ProjectFormValues>(
    key: Key,
    value: ProjectFormValues[Key],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const workTypeBadge = useMemo(
    () => formatWorkTypeBadge(values.jenisPekerjaan),
    [values.jenisPekerjaan],
  );
  const isConsultancy = useMemo(
    () => isConsultancyWorkType(values.jenisPekerjaan),
    [values.jenisPekerjaan],
  );
  const templatePreviewItems = useMemo(
    () => getWorkTypeChecklistTemplates(values.jenisPekerjaan),
    [values.jenisPekerjaan],
  );

  const selectedWorkTypeDisplay = useMemo(() => {
    if (isCustomWorkType) return CUSTOM_WORK_TYPE_LABEL;
    return values.jenisPekerjaan.trim() || "";
  }, [isCustomWorkType, values.jenisPekerjaan]);

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

        if (!project && applyTemplate && result.projectId) {
          const tplRes = await applyWorkTypeTemplate(
            result.projectId,
            values.jenisPekerjaan || undefined,
          );
          if (tplRes.success) {
            toast.success(
              `${result.message} ${tplRes.addedCount ?? 0} item template standar ditambahkan.`,
            );
          } else {
            toast.success(result.message);
            toast.warning(tplRes.message);
          }
        } else {
          toast.success(result.message);
        }

        if (!project) {
          setValues(getInitialValues(null));
          setIsCustomWorkType(false);
          setApplyTemplate(false);
        }
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
        {/* Bagian 1: Identitas & Lokasi Proyek */}
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
            1. Identitas &amp; Lokasi Proyek
          </h4>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-code">Kode Proyek *</Label>
              <Input
                id="project-code"
                required
                placeholder="Contoh: PRJ-2026-001"
                maxLength={40}
                value={values.code}
                disabled={isPending}
                onChange={(event) => updateValue("code", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-title">Nama Proyek *</Label>
              <Input
                id="project-title"
                required
                placeholder="Nama paket pekerjaan"
                maxLength={180}
                value={values.title}
                disabled={isPending}
                onChange={(event) => updateValue("title", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-group">Kelompok Tani / Mitra *</Label>
              <Input
                id="project-group"
                required
                placeholder="Nama kelompok tani atau penerima"
                maxLength={160}
                value={values.kelompokTani}
                disabled={isPending}
                onChange={(event) =>
                  updateValue("kelompokTani", event.target.value)
                }
              />
            </div>

            {/* Searchable Grouped Combobox Jenis Pekerjaan */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="project-work-type">Jenis Pekerjaan</Label>
                {values.jenisPekerjaan.trim() && (
                  <Badge variant="outline" className="text-[10px]">
                    {workTypeBadge.groupShortLabel}
                  </Badge>
                )}
              </div>
              <Popover
                open={workTypePopoverOpen}
                onOpenChange={setWorkTypePopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    id="project-work-type"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={workTypePopoverOpen}
                    disabled={isPending}
                    className={cn(
                      "h-10 w-full justify-between border-input bg-background px-3 font-normal text-foreground hover:bg-accent/50 hover:text-foreground",
                      !selectedWorkTypeDisplay && "text-muted-foreground",
                    )}
                  >
                    <span className="type-p2 truncate">
                      {selectedWorkTypeDisplay ||
                        "Pilih jenis pekerjaan (DED, Pengawas, Gedung, Irigasi...)"}
                    </span>
                    <ChevronsUpDown
                      className="ml-2 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-(--radix-popover-trigger-width) min-w-[280px] border border-border bg-popover p-0 text-popover-foreground shadow-lg"
                >
                  <Command>
                    <CommandInput
                      placeholder="Cari jenis pekerjaan (DED, Pengawas, Jalan, MEP...)"
                      className="type-p2"
                    />
                    <CommandList className="max-h-72">
                      <CommandEmpty className="type-p3 py-6 text-center text-muted-foreground">
                        Tidak ditemukan. Pilih &quot;Lainnya&quot; untuk input kustom.
                      </CommandEmpty>
                      {PROJECT_WORK_TYPE_GROUPS.map((group) => (
                        <CommandGroup key={group.group} heading={group.label}>
                          {group.items.map((item) => {
                            const isCustomOption = item.isCustomFallback === true;
                            const isSelected = isCustomOption
                              ? isCustomWorkType
                              : !isCustomWorkType &&
                                values.jenisPekerjaan.trim().toLowerCase() ===
                                  item.label.toLowerCase();
                            const searchText = [
                              item.label,
                              item.shortLabel,
                              item.groupLabel,
                              ...item.aliases,
                            ].join(" ");

                            return (
                              <CommandItem
                                key={item.id}
                                value={searchText}
                                onSelect={() => {
                                  if (isCustomOption) {
                                    setIsCustomWorkType(true);
                                    if (
                                      isCanonicalWorkTypeLabel(
                                        values.jenisPekerjaan,
                                      )
                                    ) {
                                      updateValue("jenisPekerjaan", "");
                                    }
                                  } else {
                                    setIsCustomWorkType(false);
                                    updateValue("jenisPekerjaan", item.label);
                                  }
                                  setWorkTypePopoverOpen(false);
                                }}
                                className="flex items-start justify-between gap-2 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="type-p2 truncate font-medium text-foreground">
                                    {item.label}
                                  </p>
                                  <p className="type-p3 line-clamp-1 text-muted-foreground">
                                    {item.description}
                                  </p>
                                </div>
                                <Check
                                  className={cn(
                                    "mt-0.5 size-4 shrink-0 text-primary transition-opacity",
                                    isSelected ? "opacity-100" : "opacity-0",
                                  )}
                                  aria-hidden="true"
                                />
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {isCustomWorkType && (
                <Input
                  id="project-work-type-custom"
                  maxLength={180}
                  placeholder="Tulis jenis pekerjaan kustom sesuai kontrak..."
                  value={values.jenisPekerjaan}
                  disabled={isPending}
                  onChange={(event) =>
                    updateValue("jenisPekerjaan", event.target.value)
                  }
                  className="mt-1.5"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-address">Alamat Lengkap *</Label>
              <Input
                id="project-address"
                required
                placeholder="Desa, Kecamatan, Kabupaten"
                maxLength={240}
                value={values.address}
                disabled={isPending}
                onChange={(event) => updateValue("address", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-location">Titik / Wilayah Lokasi</Label>
              <Input
                id="project-location"
                maxLength={240}
                placeholder="Koordinat atau nama daerah"
                value={values.location}
                disabled={isPending}
                onChange={(event) => updateValue("location", event.target.value)}
              />
            </div>
          </div>

          {/* Template Checklist / WBS Option on Creation */}
          {!project && (
            <div className="rounded-lg border border-border/80 bg-card/80 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  id="apply-work-type-template"
                  checked={applyTemplate}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    setApplyTemplate(checked === true)
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    <span className="type-p2 font-semibold text-foreground">
                      Terapkan template item pekerjaan / checklist standar
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {templatePreviewItems.length} item {workTypeBadge.shortLabel}
                    </Badge>
                  </div>
                  <p className="type-p3 text-muted-foreground">
                    Otomatis membuat item pekerjaan awal sesuai katalog{" "}
                    <strong className="text-foreground">
                      {workTypeBadge.label}
                    </strong>{" "}
                    setelah proyek tersimpan.
                  </p>
                  {applyTemplate && templatePreviewItems.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
                      {templatePreviewItems.map((tpl, idx) => (
                        <li key={idx} className="truncate">
                          • <span className="font-medium text-foreground">{tpl.title}</span>{" "}
                          ({tpl.section} · {tpl.defaultVolume} {tpl.unit})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Bagian 2: Pelaksana, Prioritas & Jadwal */}
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
            2. Pelaksana, Prioritas &amp; Jadwal
          </h4>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
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
                {isConsultancy
                  ? "Mode Konsultansi: proyek otomatis RUNNING setelah PIC ditunjuk dan minimal 1 item deliverable/jadwal tersedia (tanpa wajib upah borongan)."
                  : "Proyek fisik berstatus PENDING SETUP sampai PIC ditunjuk dan minimal 1 upah titik kerja disetujui Direktur."}
              </p>
              {fieldTeamUsers.length === 0 && (
                <p className="text-xs text-warning">
                  Belum ada akun Team Lapangan atau Koordinator aktif.
                  {canManageUsers && (
                    <>
                      {" "}
                      <Link
                        href="/apps/settings?tab=users"
                        className="font-medium underline"
                      >
                        Buka Manajemen Pengguna
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="project-progress">Progres Fisik (%)</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="project-start-date">Tanggal Mulai</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="project-end-date">Target Selesai</Label>
              <Input
                id="project-end-date"
                type="date"
                value={values.endDate}
                disabled={isPending}
                onChange={(event) => updateValue("endDate", event.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Bagian 3: Anggaran, Lahan & Klien */}
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
            3. Nilai Anggaran, Luas Lahan &amp; Klien
          </h4>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {canViewBudget && (
              <div className="space-y-1.5">
                <Label htmlFor="project-budget-plan">
                  {project ? "Pagu Terbaru / CCO (Rp) *" : "Nilai Pagu (Rp) *"}
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
              </div>
            )}
            {canViewBudget && (
              <div className="space-y-1.5">
                <Label htmlFor="project-budget">Anggaran Tambahan (Rp)</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="project-area">Luas Lahan Layanan (Ha)</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="project-vendor">Pelaksana / Vendor</Label>
              <Input
                id="project-vendor"
                maxLength={160}
                value={values.vendor}
                disabled={isPending}
                onChange={(event) => updateValue("vendor", event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="project-client">Instansi / Nama Klien</Label>
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
          </div>
        </div>

        {errorMessage && (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
      </form>
    </GlobalModal>
  );
}
