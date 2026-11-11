"use client";
import { FormLabel } from "@/components/ui/label"

import { useState, useTransition, type FormEvent } from "react";
import {
  approveBAST,
  approveProjectAddendum,
  approveSubkonContract,
  createBAST,
  createSubkonContract,
} from "@/app/actions/construction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserRole } from "@prisma/client";

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
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const run = (
    action: () => Promise<{ success: boolean; message: string }>,
  ) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(result.message);
      } catch (error) {
        console.error("Executive construction approval failed:", error);
        setMessage("Aksi gagal diproses. Silakan coba kembali.");
      }
    });
  };

  const submitForm = (
    event: FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<{ success: boolean; message: string }>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const result = await action(data);
        setMessage(result.message);
        if (result.success) form.reset();
      } catch (error) {
        console.error("Executive construction form failed:", error);
        setMessage("Data gagal disimpan. Silakan coba kembali.");
      }
    });
  };

  return (
    <div className="space-y-5">
      {role === UserRole.DIRECTOR && (
        <Card>
          <CardHeader>
            <CardTitle>Siapkan SPK Subkon untuk Persetujuan</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) =>
                submitForm(event, (data) =>
                  createSubkonContract({
                    projectId: String(data.get("projectId") ?? ""),
                    subkonName: String(data.get("subkonName") ?? ""),
                    workScope: String(data.get("workScope") ?? ""),
                    contractValue: String(data.get("contractValue") ?? ""),
                  }),
                )
              }
            >
              <select name="projectId" required className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="">Pilih proyek</option>
                {projects.map((project) => (
                  <option value={project.id} key={project.id}>{project.title}</option>
                ))}
              </select>
              <Input name="subkonName" required maxLength={180} placeholder="Nama subkontraktor/mandor" />
              <Input name="contractValue" required inputMode="decimal" placeholder="Nilai kontrak (Rp)" />
              <Input name="workScope" required maxLength={4000} placeholder="Lingkup pekerjaan" className="sm:col-span-2" />
              <Button disabled={isPending} type="submit" className="sm:col-span-2">
                Kirim SPK untuk Persetujuan
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Persetujuan SPK Subkon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {contracts.map((contract) => (
            <article key={contract.publicCode} className="rounded-lg border p-4">
              <p className="font-semibold text-primary">
                {contract.contractNumber} · {contract.subkonName}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{contract.projectName}</p>
              <p className="mt-2 text-sm">{contract.workScope}</p>
              <p className="mt-1 font-medium">{money(contract.contractValue)}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={
                    isPending ||
                    (contract.createdById === currentUserId &&
                      role !== UserRole.ADMINISTRATIONS)
                  }
                  onClick={() => run(() => approveSubkonContract(contract.publicCode, "ACTIVE"))}
                >
                  {contract.createdById === currentUserId
                    ? "Menunggu approver lain"
                    : "Setujui SPK"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => run(() => approveSubkonContract(contract.publicCode, "REJECTED"))}
                >
                  Tolak
                </Button>
              </div>
            </article>
          ))}
          {contracts.length === 0 && (
            <p className="text-sm text-muted-foreground">Tidak ada SPK menunggu persetujuan.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Persetujuan Addendum / CCO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addendums.map((item) => (
            <article key={item.id} className="rounded-lg border p-4">
              <p className="font-semibold text-primary">
                {item.addendumNumber} · {item.projectName}
              </p>
              <p className="mt-1 text-sm">{item.reason}</p>
              <p className="mt-1 text-sm">
                Perubahan pagu {money(item.budgetChange)} · Perpanjangan {item.timeExtension} hari
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  disabled={isPending}
                  onClick={() => run(() => approveProjectAddendum(item.id, "APPROVED"))}
                >
                  Setujui CCO
                </Button>
                <Button
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => run(() => approveProjectAddendum(item.id, "REJECTED"))}
                >
                  Tolak
                </Button>
              </div>
            </article>
          ))}
          {addendums.length === 0 && (
            <p className="text-sm text-muted-foreground">Tidak ada CCO menunggu persetujuan.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>BAST PHO / FHO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
            onSubmit={(event) =>
              submitForm(event, (data) =>
                createBAST({
                  projectId: String(data.get("projectId") ?? ""),
                  type: String(data.get("type")) as "PHO" | "FHO",
                  date: String(data.get("date") ?? ""),
                  maintenanceEndsAt:
                    String(data.get("type")) === "PHO"
                      ? String(data.get("maintenanceEndsAt") ?? "")
                      : undefined,
                  notes: String(data.get("notes") ?? ""),
                }),
              )
            }
          >
            <select name="projectId" required className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="">Pilih proyek</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>{project.title}</option>
              ))}
            </select>
            <select name="type" className="h-10 rounded-md border bg-background px-3 text-sm">
              <option value="PHO">BAST-1 / PHO</option>
              <option value="FHO">BAST-2 / FHO</option>
            </select>
            <Input name="date" type="date" required />
            <FormLabel className="space-y-1 text-sm">
              Akhir masa pemeliharaan (PHO)
              <Input name="maintenanceEndsAt" type="date" />
            </FormLabel>
            <Input name="notes" maxLength={4000} placeholder="Catatan serah terima" />
            <Button type="submit" disabled={isPending} className="sm:col-span-2">
              Buat Draf BAST
            </Button>
          </form>
          {bastDocuments.map((bast) => (
            <article key={bast.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <p className="font-semibold text-primary">
                  {bast.bastNumber} · <Badge variant="outline">{bast.type}</Badge>
                </p>
                <p className="text-sm text-muted-foreground">{bast.projectName} · {bast.date}</p>
                {bast.notes && <p className="mt-1 text-sm">{bast.notes}</p>}
              </div>
              <Button disabled={isPending} onClick={() => run(() => approveBAST(bast.id))}>
                Setujui BAST
              </Button>
            </article>
          ))}
          {bastDocuments.length === 0 && (
            <p className="text-sm text-muted-foreground">Tidak ada BAST menunggu persetujuan.</p>
          )}
        </CardContent>
      </Card>
      {message && <p className="rounded-md border border-border bg-background p-3 text-sm text-foreground" role="status">{message}</p>}
    </div>
  );
}
