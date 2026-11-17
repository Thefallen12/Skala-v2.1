"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  approveBAST,
  approveProjectAddendum,
  approveSubkonContract,
  createBAST,
  createSubkonContract,
} from "@/app/actions/construction";
import RupiahAmountInput from "@/app/components/apps/finance/RupiahAmountInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestNotificationFeedRefresh } from "@/lib/native-bridge";
import { UserRole } from "@prisma/client";
import { CheckCircle2, FileCheck2, FileSignature, XCircle } from "lucide-react";

type ContractRow = {
  publicCode: string;
  contractNumber: string;
  subkonName: string;
  workScope: string;
  contractValue: string;
  createdById: string;
  projectName: string;
};

type AddendumRow = {
  id: string;
  addendumNumber: string;
  budgetChange: string;
  timeExtension: number;
  reason: string;
  projectName: string;
};

type BastRow = {
  id: string;
  bastNumber: string;
  type: string;
  date: string;
  notes: string | null;
  projectName: string;
};

type ProjectOption = { id: string; title: string };

const money = (value: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));

function PendingContractCard({
  contract,
  role,
  currentUserId,
  isPending,
  onDecision,
}: {
  contract: ContractRow;
  role: UserRole;
  currentUserId: string;
  isPending: boolean;
  onDecision: (publicCode: string, decision: "ACTIVE" | "REJECTED") => void;
}) {
  const blockedByFourEyes =
    contract.createdById === currentUserId &&
    role !== UserRole.ADMINISTRATIONS;

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="type-p2 font-semibold text-primary">
            {contract.contractNumber} · {contract.subkonName}
          </p>
          <p className="mt-0.5 type-p3 text-muted-foreground">
            {contract.projectName}
          </p>
        </div>
        <span className="type-p2 font-bold text-foreground">
          {money(contract.contractValue)}
        </span>
      </div>
      <p className="mt-2 type-p2 text-foreground">{contract.workScope}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending || blockedByFourEyes}
          onClick={() => onDecision(contract.publicCode, "ACTIVE")}
        >
          <CheckCircle2 className="size-4" />
          {blockedByFourEyes ? "Menunggu Lain" : "Setujui"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => onDecision(contract.publicCode, "REJECTED")}
        >
          <XCircle className="size-4" />
          Tolak
        </Button>
      </div>
    </article>
  );
}

function PendingAddendumCard({
  item,
  isPending,
  onDecision,
}: {
  item: AddendumRow;
  isPending: boolean;
  onDecision: (id: string, decision: "APPROVED" | "REJECTED") => void;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <p className="type-p2 font-semibold text-primary">
        {item.addendumNumber} · {item.projectName}
      </p>
      <p className="mt-1 type-p2 text-foreground">{item.reason}</p>
      <p className="mt-1 type-p3 text-muted-foreground">
        Perubahan pagu {money(item.budgetChange)} · Perpanjangan{" "}
        {item.timeExtension} hari
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => onDecision(item.id, "APPROVED")}
        >
          <CheckCircle2 className="size-4" />
          Setujui
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => onDecision(item.id, "REJECTED")}
        >
          <XCircle className="size-4" />
          Tolak
        </Button>
      </div>
    </article>
  );
}

function PendingBastCard({
  bast,
  isPending,
  onApprove,
}: {
  bast: BastRow;
  isPending: boolean;
  onApprove: (id: string) => void;
}) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-p2 font-semibold text-primary">
            {bast.bastNumber}
          </span>
          <Badge variant="outline">{bast.type}</Badge>
        </div>
        <p className="type-p3 text-muted-foreground">
          {bast.projectName} · {bast.date}
        </p>
        {bast.notes && (
          <p className="type-p2 text-foreground">{bast.notes}</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => onApprove(bast.id)}
      >
        <CheckCircle2 className="size-4" />
        Setujui
      </Button>
    </article>
  );
}

export default function ExecutiveConstructionApprovals({
  contracts,
  addendums,
  bastDocuments,
  projects,
  role,
  currentUserId,
}: {
  contracts: ContractRow[];
  addendums: AddendumRow[];
  bastDocuments: BastRow[];
  projects: ProjectOption[];
  role: UserRole;
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [spkProjectId, setSpkProjectId] = useState("");
  const [spkSubkonName, setSpkSubkonName] = useState("");
  const [spkContractValue, setSpkContractValue] = useState("");
  const [spkWorkScope, setSpkWorkScope] = useState("");

  const [bastProjectId, setBastProjectId] = useState("");
  const [bastType, setBastType] = useState<"PHO" | "FHO">("PHO");
  const [bastDate, setBastDate] = useState("");
  const [bastMaintenanceEndsAt, setBastMaintenanceEndsAt] = useState("");
  const [bastNotes, setBastNotes] = useState("");

  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: project.title,
  }));

  const run = (
    action: () => Promise<{ success: boolean; message: string }>,
  ) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.success) {
          toast.success(result.message);
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Executive construction approval failed:", error);
        toast.error("Aksi gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const handleSubmitSpk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!spkProjectId) {
      toast.error("Pilih proyek terlebih dahulu.");
      return;
    }
    if (!spkContractValue || Number(spkContractValue) <= 0) {
      toast.error("Masukkan nilai kontrak SPK yang valid.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createSubkonContract({
          projectId: spkProjectId,
          subkonName: spkSubkonName.trim(),
          workScope: spkWorkScope.trim(),
          contractValue: spkContractValue,
        });
        if (result.success) {
          toast.success(result.message);
          setSpkProjectId("");
          setSpkSubkonName("");
          setSpkContractValue("");
          setSpkWorkScope("");
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Create SPK failed:", error);
        toast.error("Data SPK gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  const handleSubmitBast = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bastProjectId) {
      toast.error("Pilih proyek terlebih dahulu.");
      return;
    }
    if (!bastDate) {
      toast.error("Pilih tanggal serah terima BAST.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createBAST({
          projectId: bastProjectId,
          type: bastType,
          date: bastDate,
          maintenanceEndsAt:
            bastType === "PHO" && bastMaintenanceEndsAt
              ? bastMaintenanceEndsAt
              : undefined,
          notes: bastNotes.trim() || undefined,
        });
        if (result.success) {
          toast.success(result.message);
          setBastProjectId("");
          setBastType("PHO");
          setBastDate("");
          setBastMaintenanceEndsAt("");
          setBastNotes("");
          requestNotificationFeedRefresh();
          router.refresh();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Create BAST failed:", error);
        toast.error("Draf BAST gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {(role === UserRole.DIRECTOR || role === UserRole.DEPUTY_DIRECTOR) && (
        <Card>
          <CardHeader>
            <CardTitle className="type-h3">
              Siapkan SPK Subkon untuk Persetujuan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmitSpk}>
              <div className="space-y-1.5">
                <FormLabel htmlFor="spk-project" className="type-p3 font-medium">
                  Proyek *
                </FormLabel>
                <Combobox
                  id="spk-project"
                  options={projectOptions}
                  value={spkProjectId}
                  onValueChange={setSpkProjectId}
                  placeholder="Pilih proyek"
                  searchPlaceholder="Cari nama proyek..."
                  emptyText="Proyek tidak ditemukan"
                />
              </div>

              <div className="space-y-1.5">
                <FormLabel
                  htmlFor="spk-subkon-name"
                  className="type-p3 font-medium"
                >
                  Nama Subkontraktor / Mandor *
                </FormLabel>
                <Input
                  id="spk-subkon-name"
                  value={spkSubkonName}
                  onChange={(event) => setSpkSubkonName(event.target.value)}
                  required
                  maxLength={180}
                  placeholder="Nama subkontraktor / mandor"
                />
              </div>

              <div className="space-y-1.5">
                <FormLabel htmlFor="spk-value" className="type-p3 font-medium">
                  Nilai Kontrak (Rp) *
                </FormLabel>
                <RupiahAmountInput
                  id="spk-value"
                  value={spkContractValue}
                  onChange={setSpkContractValue}
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <FormLabel htmlFor="spk-scope" className="type-p3 font-medium">
                  Lingkup Pekerjaan *
                </FormLabel>
                <Textarea
                  id="spk-scope"
                  value={spkWorkScope}
                  onChange={(event) => setSpkWorkScope(event.target.value)}
                  required
                  maxLength={4000}
                  placeholder="Uraikan lingkup pekerjaan SPK..."
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <Button disabled={isPending} type="submit">
                  <FileSignature className="size-4" />
                  Kirim SPK
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="type-h3">Persetujuan SPK Subkon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contracts.length === 0 ? (
            <EmptyState
              icon={<FileSignature className="size-6" />}
              title="Tidak ada SPK menunggu"
              description="Seluruh kontrak SPK subkon telah ditinjau."
              variant="inline"
            />
          ) : (
            contracts.map((contract) => (
              <PendingContractCard
                key={contract.publicCode}
                contract={contract}
                role={role}
                currentUserId={currentUserId}
                isPending={isPending}
                onDecision={(publicCode, decision) =>
                  run(() => approveSubkonContract(publicCode, decision))
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="type-h3">Persetujuan Addendum / CCO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addendums.length === 0 ? (
            <EmptyState
              icon={<FileCheck2 className="size-6" />}
              title="Tidak ada CCO menunggu"
              description="Belum ada pengajuan perubahan kontrak / addendum."
              variant="inline"
            />
          ) : (
            addendums.map((item) => (
              <PendingAddendumCard
                key={item.id}
                item={item}
                isPending={isPending}
                onDecision={(id, decision) =>
                  run(() => approveProjectAddendum(id, decision))
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="type-h3">BAST PHO / FHO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2"
            onSubmit={handleSubmitBast}
          >
            <div className="space-y-1.5">
              <FormLabel htmlFor="bast-project" className="type-p3 font-medium">
                Proyek *
              </FormLabel>
              <Combobox
                id="bast-project"
                options={projectOptions}
                value={bastProjectId}
                onValueChange={setBastProjectId}
                placeholder="Pilih proyek"
                searchPlaceholder="Cari proyek..."
                emptyText="Proyek tidak ditemukan"
              />
            </div>

            <div className="space-y-1.5">
              <FormLabel htmlFor="bast-type" className="type-p3 font-medium">
                Jenis BAST *
              </FormLabel>
              <Select
                value={bastType}
                onValueChange={(value) => setBastType(value as "PHO" | "FHO")}
              >
                <SelectTrigger id="bast-type" className="w-full">
                  <SelectValue placeholder="Pilih jenis BAST" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHO">BAST-1 / PHO</SelectItem>
                  <SelectItem value="FHO">BAST-2 / FHO</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <FormLabel htmlFor="bast-date" className="type-p3 font-medium">
                Tanggal Serah Terima *
              </FormLabel>
              <DatePicker
                id="bast-date"
                value={bastDate}
                onValueChange={setBastDate}
                placeholder="Pilih tanggal BAST"
              />
            </div>

            <div className="space-y-1.5">
              <FormLabel
                htmlFor="bast-maintenance"
                className="type-p3 font-medium"
              >
                Akhir Masa Pemeliharaan (PHO)
              </FormLabel>
              <DatePicker
                id="bast-maintenance"
                value={bastMaintenanceEndsAt}
                onValueChange={setBastMaintenanceEndsAt}
                disabled={bastType !== "PHO"}
                placeholder="Pilih tanggal selesai"
                clearable
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <FormLabel htmlFor="bast-notes" className="type-p3 font-medium">
                Catatan Serah Terima
              </FormLabel>
              <Textarea
                id="bast-notes"
                value={bastNotes}
                onChange={(event) => setBastNotes(event.target.value)}
                maxLength={4000}
                placeholder="Catatan pemeriksaan lapangan atau lampiran..."
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={isPending}>
                Buat Draf BAST
              </Button>
            </div>
          </form>

          {bastDocuments.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-6" />}
              title="Tidak ada BAST menunggu"
              description="Seluruh dokumen serah terima telah disahkan."
              variant="inline"
            />
          ) : (
            <div className="space-y-2.5">
              {bastDocuments.map((bast) => (
                <PendingBastCard
                  key={bast.id}
                  bast={bast}
                  isPending={isPending}
                  onApprove={(id) => run(() => approveBAST(id))}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
