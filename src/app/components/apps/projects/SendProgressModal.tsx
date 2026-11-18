"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  ExternalLink,
  FileCheck2,
  Globe,
  Loader2,
  Send,
  Users,
} from "lucide-react";
import { UserRole } from "@prisma/client";
import { toast } from "sonner";
import {
  submitProjectProgressReport,
  type ProgressSubmissionPeriodType,
  type SubmitProjectProgressReportResult,
} from "@/app/actions/project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { GlobalModal } from "@/components/ui/global-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { formatWorkTypeBadge } from "@/lib/project-work-types";
import { cn } from "@/lib/utils";

export type SendProgressProjectOption = {
  id: string;
  code: string;
  title: string;
  status: string;
  progress: number;
  jenisPekerjaan?: string | null;
  clientName?: string | null;
  fieldPicName?: string | null;
  reports?: Array<{
    reportDate: string;
    weather?: string | null;
    workersCount?: number;
    workSummary?: string | null;
  }>;
};

export interface SendProgressModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects?: SendProgressProjectOption[];
  lockedProject?: SendProgressProjectOption | null;
  initialProjectId?: string | null;
  canIncludeFinancials?: boolean;
  defaultPeriodType?: ProgressSubmissionPeriodType;
  onSuccess?: (
    result: Extract<SubmitProjectProgressReportResult, { success: true }>,
  ) => void;
}

const PERIOD_OPTIONS: Array<{
  value: ProgressSubmissionPeriodType;
  label: string;
  hint: string;
}> = [
  { value: "DAILY", label: "Harian", hint: "Ringkasan laporan hari ini" },
  { value: "WEEKLY", label: "Mingguan", hint: "Rekap progres mingguan" },
  { value: "MONTHLY", label: "Bulanan", hint: "Evaluasi progres bulanan" },
  { value: "CUMULATIVE", label: "Kumulatif", hint: "Posisi total s/d hari ini" },
];

const RECIPIENT_OPTIONS: Array<{
  role: UserRole;
  label: string;
  description: string;
}> = [
  {
    role: UserRole.DIRECTOR,
    label: "Direktur",
    description: "Pimpinan tertinggi & persetujuan proyek",
  },
  {
    role: UserRole.DEPUTY_DIRECTOR,
    label: "Wakil Direktur",
    description: "Pengawasan eksekutif & keuangan",
  },
  {
    role: UserRole.KOORDINATOR,
    label: "Koordinator",
    description: "Koordinator operasional & lapangan",
  },
];

export default function SendProgressModal(props: SendProgressModalProps) {
  if (!props.open) return null;
  return <SendProgressModalInner {...props} />;
}

function SendProgressModalInner({
  open,
  onOpenChange,
  projects = [],
  lockedProject = null,
  initialProjectId = null,
  canIncludeFinancials = false,
  defaultPeriodType = "DAILY",
  onSuccess,
}: SendProgressModalProps) {
  const initialProject = React.useMemo(() => {
    if (lockedProject) return lockedProject.id;
    if (initialProjectId && projects.some((p) => p.id === initialProjectId)) {
      return initialProjectId;
    }
    return projects.length === 1 ? projects[0].id : "";
  }, [lockedProject, initialProjectId, projects]);

  const [selectedProjectId, setSelectedProjectId] =
    React.useState<string>(initialProject);
  const [periodType, setPeriodType] =
    React.useState<ProgressSubmissionPeriodType>(defaultPeriodType);
  const [periodLabel, setPeriodLabel] = React.useState("");
  const [selectedRoles, setSelectedRoles] = React.useState<UserRole[]>([
    UserRole.DIRECTOR,
    UserRole.DEPUTY_DIRECTOR,
    UserRole.KOORDINATOR,
  ]);
  const [notes, setNotes] = React.useState("");
  const [includeFinancials, setIncludeFinancials] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [submittedResult, setSubmittedResult] = React.useState<Extract<
    SubmitProjectProgressReportResult,
    { success: true }
  > | null>(null);

  const activeProject = React.useMemo(() => {
    if (lockedProject) return lockedProject;
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [lockedProject, projects, selectedProjectId]);

  const projectOptions = React.useMemo<ComboboxOption[]>(
    () =>
      projects.map((p) => {
        const wt = formatWorkTypeBadge(p.jenisPekerjaan);
        return {
          value: p.id,
          label: p.title,
          description: `${p.code} · ${wt.shortLabel} · ${p.progress.toFixed(1)}%`,
          keywords: [p.code, wt.label, p.clientName ?? ""],
        };
      }),
    [projects],
  );

  const workTypeBadge = activeProject
    ? formatWorkTypeBadge(activeProject.jenisPekerjaan)
    : null;
  const latestReport = activeProject?.reports?.[0] ?? null;

  const toggleRole = (role: UserRole, checked: boolean) => {
    setSelectedRoles((prev) => {
      if (checked) {
        return prev.includes(role) ? prev : [...prev, role];
      }
      return prev.filter((item) => item !== role);
    });
  };

  const fullPortalUrl = React.useMemo(() => {
    if (!submittedResult) return "";
    if (typeof window === "undefined") return submittedResult.portalUrl;
    return `${window.location.origin}${submittedResult.portalUrl}`;
  }, [submittedResult]);

  const handleCopyPortalUrl = async () => {
    if (!fullPortalUrl) return;
    try {
      await navigator.clipboard.writeText(fullPortalUrl);
      setCopied(true);
      toast.success("Tautan portal progres klien berhasil disalin.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin tautan. Silakan salin secara manual.");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    if (!activeProject) {
      setErrorMessage("Pilih proyek terlebih dahulu.");
      return;
    }
    if (selectedRoles.length === 0) {
      setErrorMessage("Pilih minimal 1 penerima notifikasi internal.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitProjectProgressReport({
        projectId: activeProject.id,
        periodType,
        periodLabel: periodLabel.trim() || undefined,
        recipientRoles: selectedRoles,
        notes: notes.trim() || undefined,
        includeFinancials: canIncludeFinancials ? includeFinancials : false,
      });

      if (!result.success) {
        setErrorMessage(result.message);
        toast.error(result.message);
        return;
      }

      setSubmittedResult(result);
      toast.success(result.message);
      requestNotificationFeedRefresh();
      onSuccess?.(result);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Gagal mengirim paket laporan progres.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlobalModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      onOpenChange={onOpenChange}
      mobileBehavior="sheet"
      icon={<Send className="size-4" aria-hidden="true" />}
      title="Kirim Progres Proyek"
      description="Susun paket laporan progres resmi, kirim notifikasi ke pimpinan, dan buat tautan portal klien."
      className="max-w-2xl"
      footer={
        submittedResult ? (
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSubmittedResult(null)}
            >
              Kirim Paket Lain
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Selesai
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="send-progress-form"
              size="sm"
              disabled={isSubmitting || !activeProject}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Mengirim...</span>
                </>
              ) : (
                <>
                  <Send className="size-4" aria-hidden="true" />
                  <span>Kirim Progres &amp; Buat Tautan</span>
                </>
              )}
            </Button>
          </div>
        )
      }
    >
      {submittedResult ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-success/40 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <FileCheck2
                className="mt-0.5 size-5 shrink-0 text-success"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="type-h3 text-foreground">
                  Paket Progres Berhasil Dikirim
                </h3>
                <p className="type-p3 text-muted-foreground">
                  Notifikasi telah dikirim ke{" "}
                  {selectedRoles
                    .map(
                      (r) =>
                        RECIPIENT_OPTIONS.find((opt) => opt.role === r)?.label ??
                        r,
                    )
                    .join(", ")}
                  .
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-card p-3 text-center">
              <div>
                <span className="type-p3 text-muted-foreground">Aktual</span>
                <p className="type-h3 font-bold text-foreground tabular-nums">
                  {submittedResult.actualProgress.toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="type-p3 text-muted-foreground">Rencana</span>
                <p className="type-h3 font-bold text-foreground tabular-nums">
                  {submittedResult.plannedProgress.toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="type-p3 text-muted-foreground">Deviasi</span>
                <p
                  className={cn(
                    "type-h3 font-bold tabular-nums",
                    submittedResult.deviation < 0
                      ? "text-destructive"
                      : "text-success",
                  )}
                >
                  {submittedResult.deviation >= 0 ? "+" : ""}
                  {submittedResult.deviation.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="type-p2 flex items-center gap-1.5 font-semibold text-foreground">
                <Globe className="size-4 text-primary" aria-hidden="true" />
                <span>Tautan Portal Progres Klien / Owner</span>
              </Label>
              <Badge variant="outline" className="font-mono">
                {submittedResult.portalCode}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={fullPortalUrl}
                aria-label="Tautan portal progres klien"
                className="font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void handleCopyPortalUrl()}
                className="shrink-0 gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" />
                    <span>Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" aria-hidden="true" />
                    <span>Salin</span>
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="type-p3 text-muted-foreground">
                {canIncludeFinancials && includeFinancials
                  ? "Detail anggaran/RAB ditampilkan pada tautan ini."
                  : "Detail keuangan/RAB disembunyikan untuk pihak eksternal."}
              </span>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={submittedResult.portalUrl} target="_blank">
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span>Buka Portal</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <form
          id="send-progress-form"
          className="space-y-4"
          onSubmit={(e) => void handleSubmit(e)}
        >
          {/* Project selector */}
          {lockedProject ? (
            <div className="rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <span className="type-p3 font-medium text-muted-foreground">
                    Proyek Terpilih
                  </span>
                  <h3 className="type-h3 text-foreground">
                    {lockedProject.title}
                  </h3>
                  <p className="type-p3 text-muted-foreground">
                    <span className="font-mono">{lockedProject.code}</span>
                    {lockedProject.clientName
                      ? ` · ${lockedProject.clientName}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {workTypeBadge && (
                    <Badge variant="outline">{workTypeBadge.shortLabel}</Badge>
                  )}
                  <Badge variant="secondary" className="tabular-nums">
                    {lockedProject.progress.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label
                htmlFor="send-progress-project"
                className="type-p2 font-semibold"
              >
                Pilih Proyek <span className="text-destructive">*</span>
              </Label>
              <Combobox
                id="send-progress-project"
                options={projectOptions}
                value={selectedProjectId}
                onValueChange={(value) => {
                  setSelectedProjectId(value);
                  setErrorMessage("");
                }}
                placeholder="Pilih proyek yang akan dikirim..."
                searchPlaceholder="Cari nama, kode, atau jenis pekerjaan..."
                emptyText="Proyek tidak ditemukan."
              />
            </div>
          )}

          {/* Selected project live context */}
          {activeProject && (
            <div className="rounded-xl border border-border/80 bg-muted/15 p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-muted-foreground">
                  Ringkasan Database Terkini
                </span>
                <div className="flex items-center gap-1.5">
                  {workTypeBadge && (
                    <Badge variant="outline" className="text-[11px]">
                      {workTypeBadge.groupShortLabel}: {workTypeBadge.shortLabel}
                    </Badge>
                  )}
                  <Badge variant="outline" className="font-mono tabular-nums">
                    Progres {activeProject.progress.toFixed(1)}%
                  </Badge>
                </div>
              </div>
              <p className="mt-1.5 text-muted-foreground">
                {latestReport
                  ? `Laporan terakhir ${latestReport.reportDate}${latestReport.weather ? ` · ${latestReport.weather}` : ""}${latestReport.workersCount !== undefined ? ` · ${latestReport.workersCount} pekerja` : ""}${latestReport.workSummary ? ` — ${latestReport.workSummary.slice(0, 120)}${latestReport.workSummary.length > 120 ? "…" : ""}` : ""}`
                  : "Belum ada laporan harian tercatat; ringkasan akan dibuat dari status Kurva-S proyek."}
              </p>
            </div>
          )}

          {/* Period Selector */}
          <div className="space-y-2">
            <Label className="type-p2 font-semibold">Periode Laporan</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PERIOD_OPTIONS.map((opt) => {
                const active = periodType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPeriodType(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "border-border bg-card text-foreground hover:border-primary/40",
                    )}
                  >
                    <p className="type-p2 font-semibold">{opt.label}</p>
                    <p className="type-p3 text-muted-foreground">{opt.hint}</p>
                  </button>
                );
              })}
            </div>
            <Input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="Label periode opsional (mis. Minggu ke-4 Nov 2026)"
              maxLength={120}
              disabled={isSubmitting}
            />
          </div>

          {/* Target Recipients */}
          <div className="space-y-2">
            <Label className="type-p2 flex items-center gap-1.5 font-semibold">
              <Users className="size-3.5 text-primary" aria-hidden="true" />
              <span>Penerima Notifikasi Internal</span>
            </Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {RECIPIENT_OPTIONS.map((opt) => {
                const isChecked = selectedRoles.includes(opt.role);
                return (
                  <label
                    key={opt.role}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                      isChecked
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                    )}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={isSubmitting}
                      onCheckedChange={(checked) =>
                        toggleRole(opt.role, checked === true)
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="type-p2 font-semibold text-foreground">
                        {opt.label}
                      </p>
                      <p className="type-p3 text-muted-foreground">
                        {opt.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Custom Note */}
          <div className="space-y-1.5">
            <Label htmlFor="send-progress-notes" className="type-p2 font-semibold">
              Catatan Pengirim{" "}
              <span className="font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <Textarea
              id="send-progress-notes"
              rows={2}
              maxLength={2000}
              value={notes}
              disabled={isSubmitting}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Mohon arahan untuk deviasi pengecoran zona B atau tindak lanjut RFI."
            />
          </div>

          {/* Financial Portal Toggle */}
          {canIncludeFinancials && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
              <div className="space-y-0.5">
                <Label
                  htmlFor="include-financials-toggle"
                  className="type-p2 font-semibold text-foreground"
                >
                  Tampilkan detail keuangan/RAB pada tautan klien
                </Label>
                <p className="type-p3 text-muted-foreground">
                  Secara bawaan nilai kontrak &amp; realisasi RAB disembunyikan
                  pada halaman portal eksternal.
                </p>
              </div>
              <Switch
                id="include-financials-toggle"
                checked={includeFinancials}
                disabled={isSubmitting}
                onCheckedChange={setIncludeFinancials}
              />
            </div>
          )}

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive"
            >
              {errorMessage}
            </p>
          )}
        </form>
      )}
    </GlobalModal>
  );
}
