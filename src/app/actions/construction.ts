"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import {
  BASTType,
  BlueprintCategory,
  BlueprintStatus,
  EquipmentStatus,
  NotificationType,
  ProjectAddendumStatus,
  SPKStatus,
  SubkonTermynStatus,
  UserRole,
} from "@/generated/prisma/enums";
import { z } from "zod";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";
import {
  generateAvailablePublicCode,
  isValidPublicCode,
} from "@/lib/documents/random-code";
import { nextDocumentNumber } from "@/lib/documents/numbering";
import {
  BlueprintFileValidationError,
  saveBlueprintFile,
} from "@/lib/blueprint-files";
import {
  removeTicketReceipt,
  saveTicketReceipt,
} from "@/lib/ticket-receipts";
import { recordFinanceCashflowOutflow } from "@/lib/finance-cashflow-ledger";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";
import {
  decimalFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";

export type ConstructionActionResult = {
  success: boolean;
  message: string;
  publicCode?: string;
};

const failure = (message: string): ConstructionActionResult => ({
  success: false,
  message,
});

const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,2})?$/, "Nominal kontrak tidak valid.");

const projectRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
];
const executiveRoles: UserRole[] = [
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
];
const logisticsRoles: UserRole[] = [
  UserRole.LOGISTICS,
  UserRole.ADMINISTRATIONS,
];

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function validCode(value: string) {
  return isValidPublicCode(value);
}

function revalidateConstruction() {
  revalidatePath("/apps/approvals");
  revalidatePath("/apps/projects");
  revalidatePath("/apps/logistics");
  revalidatePath("/apps/finance");
  revalidatePath("/apps/blueprints");
}

export async function createBlueprint(
  projectId: string,
  input: FormData,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk mengunggah gambar kerja.");
  if (
    session.user.role !== UserRole.DRAFTER &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return failure("Hanya Drafter atau Admin yang dapat mengunggah gambar kerja.");
  }
  if (!validId(projectId) || !(input instanceof FormData)) {
    return failure("Data gambar kerja tidak valid.");
  }
  const parsed = z
    .object({
      drawingNumber: z.string().trim().min(1).max(80),
      title: z.string().trim().min(1).max(180),
      category: z.enum(BlueprintCategory),
      revision: z.string().trim().min(1).max(30),
      file: z.instanceof(File),
    })
    .safeParse({
      drawingNumber: input.get("drawingNumber"),
      title: input.get("title"),
      category: input.get("category"),
      revision: input.get("revision"),
      file: input.get("file"),
    });
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Data gambar kerja tidak valid.");
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return failure("Proyek tidak ditemukan.");

  let fileUrl: string | null = null;
  try {
    fileUrl = await saveBlueprintFile(parsed.data.file);
    const result = await prisma.$transaction(async (transaction) => {
      const publicCode = await generateAvailablePublicCode(transaction);
      await transaction.blueprint.create({
        data: {
          publicCode,
          projectId,
          drawingNumber: parsed.data.drawingNumber,
          title: parsed.data.title,
          category: parsed.data.category,
          revision: parsed.data.revision,
          fileUrl: fileUrl!,
          drafterId: session.user.id,
          status: BlueprintStatus.FOR_APPROVAL,
        },
      });
      return publicCode;
    });
    revalidateConstruction();
    return {
      success: true,
      message: "Gambar kerja berhasil diunggah dan dikirim untuk review.",
      publicCode: result,
    };
  } catch (error) {
    console.error("Blueprint upload failed:", error);
    return failure(
      error instanceof BlueprintFileValidationError
        ? error.message
        : "Gambar kerja gagal disimpan. Silakan coba kembali.",
    );
  }
}

export async function reviewBlueprint(
  publicCode: string,
  decision: "APPROVED_FOR_CONSTRUCTION" | "REJECTED",
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk meninjau gambar.");
  if (
    session.user.role !== UserRole.KOORDINATOR &&
    session.user.role !== UserRole.DIRECTOR &&
    session.user.role !== UserRole.DEPUTY_DIRECTOR
  ) {
    return failure("Role Anda tidak diizinkan meninjau gambar kerja.");
  }
  if (
    !validCode(publicCode) ||
    ![BlueprintStatus.APPROVED_FOR_CONSTRUCTION, BlueprintStatus.REJECTED].includes(
      decision,
    )
  ) {
    return failure("Data review gambar kerja tidak valid.");
  }
  const result = await prisma.blueprint.updateMany({
    where: { publicCode, status: BlueprintStatus.FOR_APPROVAL },
    data: {
      status: decision,
      reviewerId: session.user.id,
      reviewedAt: new Date(),
    },
  });
  if (result.count !== 1) {
    return failure("Gambar tidak ditemukan atau status review telah berubah.");
  }
  revalidateConstruction();
  return {
    success: true,
    message:
      decision === BlueprintStatus.APPROVED_FOR_CONSTRUCTION
        ? "Gambar disetujui untuk konstruksi."
        : "Gambar ditolak.",
  };
}

const equipmentSchema = z.object({
  projectId: z.string().min(1).max(100),
  equipmentMasterId: z.string().max(100).optional(),
  equipmentName: z.string().trim().min(1).max(120),
  operatorName: z.string().trim().max(120).optional(),
  date: z.iso.date(),
  hmStart: z.coerce.number().finite().min(0).max(1_000_000),
  hmEnd: z.coerce.number().finite().min(0).max(1_000_000),
  effectiveHours: z.coerce.number().finite().min(0).max(24),
  fuelLiter: z.coerce.number().finite().min(0).max(1_000_000),
  notes: z.string().trim().max(2000).optional(),
});

const equipmentMasterSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(120).optional(),
  licensePlate: z.string().trim().max(80).optional(),
  hourlyRate: z.coerce.number().finite().min(0).max(1_000_000_000_000),
  currentHM: z.coerce.number().finite().min(0).max(1_000_000),
});

export async function createEquipmentMaster(
  input: unknown,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (
    !session?.user?.id ||
    !logisticsRoles.includes(session.user.role) ||
    session.user.role === UserRole.MOVER
  ) {
    return failure("Hanya Logistik atau Admin yang dapat mendaftarkan alat.");
  }
  const parsed = equipmentMasterSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Data master alat tidak valid.");
  }
  try {
    const code = `ALT-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    await prisma.equipmentMaster.create({
      data: {
        code,
        name: parsed.data.name,
        brand: parsed.data.brand || null,
        licensePlate: parsed.data.licensePlate || null,
        hourlyRate: scaledIntegerFromDecimal(parsed.data.hourlyRate),
        currentHM: scaledIntegerFromDecimal(parsed.data.currentHM),
        status: EquipmentStatus.READY,
      },
    });
    revalidateConstruction();
    return { success: true, message: `Alat ${code} berhasil didaftarkan.` };
  } catch (error) {
    console.error("Equipment master creation failed:", error);
    return failure("Master alat gagal disimpan. Silakan coba kembali.");
  }
}

export async function createEquipmentLog(
  input: unknown,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk mencatat alat.");
  const equipmentLogRoles: UserRole[] = [
    ...logisticsRoles,
    UserRole.FIELD_TEAM,
    UserRole.KOORDINATOR,
  ];
  if (!equipmentLogRoles.includes(session.user.role)) {
    return failure("Role Anda tidak diizinkan mencatat log alat.");
  }
  const parsed = equipmentSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Data log alat tidak valid.");
  }
  const values = parsed.data;
  if (values.hmEnd < values.hmStart) {
    return failure("HM akhir tidak boleh lebih kecil dari HM awal.");
  }
  if (values.effectiveHours > values.hmEnd - values.hmStart) {
    return failure("Jam efektif tidak boleh melebihi selisih HM.");
  }
  const project = await prisma.project.findUnique({
    where: { id: values.projectId },
    select: { fieldPicId: true },
  });
  if (!project) return failure("Proyek tidak ditemukan.");
  if (
    session.user.role === UserRole.FIELD_TEAM &&
    project.fieldPicId !== session.user.id
  ) {
    return failure("Anda hanya dapat mencatat alat untuk proyek yang ditugaskan kepada Anda.");
  }
  try {
    await prisma.$transaction(async (transaction) => {
      let equipmentName = values.equipmentName;
      if (values.equipmentMasterId) {
        const master = await transaction.equipmentMaster.findUnique({
          where: { id: values.equipmentMasterId },
          select: { id: true, name: true, currentHM: true },
        });
        if (!master) throw new Error("Master alat tidak ditemukan.");
        if (
          !decimalFromScaledInteger(master.currentHM).equals(
            new Prisma.Decimal(values.hmStart),
          )
        ) {
          throw new Error("HM awal harus sama dengan HM terakhir alat pada master.");
        }
        const updated = await transaction.equipmentMaster.updateMany({
          where: {
            id: master.id,
            currentHM: master.currentHM,
          },
          data: {
            currentHM: scaledIntegerFromDecimal(values.hmEnd),
            status: EquipmentStatus.IN_USE,
          },
        });
        if (updated.count !== 1) {
          throw new Error("HM alat berubah bersamaan. Muat ulang data master alat.");
        }
        equipmentName = master.name;
      }
      await transaction.equipmentLog.create({
        data: {
          projectId: values.projectId,
          equipmentMasterId: values.equipmentMasterId || null,
          equipmentName,
          operatorName: values.operatorName || null,
          date: new Date(`${values.date}T00:00:00.000Z`),
          hmStart: scaledIntegerFromDecimal(values.hmStart),
          hmEnd: scaledIntegerFromDecimal(values.hmEnd),
          effectiveHours: scaledIntegerFromDecimal(values.effectiveHours),
          fuelLiter: scaledIntegerFromDecimal(values.fuelLiter),
          notes: values.notes || null,
          createdById: session.user.id,
        },
      });
    });
    revalidateConstruction();
    return { success: true, message: "Log alat berat dan BBM berhasil disimpan." };
  } catch (error) {
    console.error("Equipment log creation failed:", error);
    return failure(
      error instanceof Error
        ? error.message
        : "Log alat gagal disimpan. Periksa proyek dan coba kembali.",
    );
  }
}

const contractSchema = z.object({
  projectId: z.string().min(1).max(100),
  subkonName: z.string().trim().min(1).max(180),
  workScope: z.string().trim().min(1).max(4000),
  contractValue: moneySchema,
});

export async function createSubkonContract(
  input: unknown,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk membuat SPK.");
  if (
    !logisticsRoles.includes(session.user.role) &&
    !executiveRoles.includes(session.user.role)
  ) {
    return failure("Role Anda tidak diizinkan menyiapkan SPK.");
  }
  const parsed = contractSchema.safeParse(input);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Data SPK tidak valid.");
  }
  try {
    const publicCode = await prisma.$transaction(async (transaction) => {
      const code = await generateAvailablePublicCode(transaction);
      const sequence = await transaction.documentNumberSequence.upsert({
        where: { kind_year: { kind: "SPK", year: new Date().getFullYear() } },
        update: { value: { increment: 1 } },
        create: { kind: "SPK", year: new Date().getFullYear(), value: 1 },
        select: { value: true },
      });
      const contractNumber = `SPE-${String(sequence.value).padStart(3, "0")}/SPK/${new Date().getFullYear()}`;
      await transaction.subkonContract.create({
        data: {
          publicCode: code,
          contractNumber,
          projectId: parsed.data.projectId,
          subkonName: parsed.data.subkonName,
          workScope: parsed.data.workScope,
          contractValue: scaledIntegerFromDecimal(parsed.data.contractValue),
          status: SPKStatus.PENDING_APPROVAL,
          createdById: session.user.id,
        },
      });
      return code;
    });
    revalidateConstruction();
    return { success: true, message: "Draf SPK dikirim untuk persetujuan Direktur.", publicCode };
  } catch (error) {
    console.error("Subcontract contract creation failed:", error);
    return failure("SPK gagal dibuat. Periksa proyek dan coba kembali.");
  }
}

export async function approveSubkonContract(
  publicCode: string,
  decision: "ACTIVE" | "REJECTED",
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk menyetujui SPK.");
  if (!executiveRoles.includes(session.user.role)) {
    return failure("Hanya Direktur/Wakil Direktur yang dapat menyetujui SPK.");
  }
  if (!validCode(publicCode) || !["ACTIVE", "REJECTED"].includes(decision)) {
    return failure("Data persetujuan SPK tidak valid.");
  }
  const current = await prisma.subkonContract.findUnique({
    where: { publicCode },
    select: { status: true, createdById: true },
  });
  if (
    decision === "ACTIVE" &&
    current?.createdById === session.user.id &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return failure("Pembuat SPK tidak dapat menyetujui SPK yang sama.");
  }
  const result = await prisma.subkonContract.updateMany({
    where: { publicCode, status: SPKStatus.PENDING_APPROVAL },
    data: {
      status: decision === "ACTIVE" ? SPKStatus.ACTIVE : SPKStatus.REJECTED,
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });
  if (result.count !== 1) return failure("SPK tidak ditemukan atau telah diproses.");
  revalidateConstruction();
  return { success: true, message: decision === "ACTIVE" ? "SPK disetujui." : "SPK ditolak." };
}

export async function submitSubkonTermyn(
  publicCode: string,
  claimedPercent: number,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk mengajukan termin.");
  const termynSubmitRoles: UserRole[] = [
    UserRole.LOGISTICS,
    UserRole.ADMINISTRATIONS,
    UserRole.FIELD_TEAM,
    UserRole.KOORDINATOR,
  ];
  if (
    !termynSubmitRoles.includes(session.user.role)
  ) {
    return failure("Role Anda tidak diizinkan mengajukan termin.");
  }
  if (!validCode(publicCode) || !Number.isFinite(claimedPercent) || claimedPercent <= 0 || claimedPercent > 100) {
    return failure("Persentase klaim harus lebih dari 0% dan maksimal 100%.");
  }
  try {
    await prisma.$transaction(async (transaction) => {
      await acquireMongoTransactionLock(transaction, `subkon-termyn-${publicCode}`);
      const contract = await transaction.subkonContract.findUnique({
        where: { publicCode },
        select: {
          id: true,
          status: true,
          contractValue: true,
          retentionPct: true,
          contractNumber: true,
          subkonName: true,
          workScope: true,
          projectId: true,
          project: { select: { fieldPicId: true } },
          termyns: { select: { claimedPercent: true } },
        },
      });
      if (!contract || contract.status !== SPKStatus.ACTIVE) {
        throw new Error("SPK tidak aktif.");
      }
      if (
        session.user.role === UserRole.FIELD_TEAM &&
        contract.project.fieldPicId !== session.user.id
      ) {
        throw new Error("Anda hanya dapat mengajukan termin untuk proyek yang ditugaskan kepada Anda.");
      }
      const maxClaimed = contract.termyns.reduce(
        (maximum, termyn) =>
          Math.max(
            maximum,
            decimalFromScaledInteger(termyn.claimedPercent).toNumber(),
          ),
        0,
      );
      if (claimedPercent <= maxClaimed) {
        throw new Error(`Klaim harus lebih besar dari progres terdahulu ${maxClaimed}%.`);
      }
      const incrementalPercent = new Prisma.Decimal(claimedPercent - maxClaimed);
      const grossAmount = decimalFromScaledInteger(contract.contractValue)
        .mul(incrementalPercent)
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const retentionAmount = grossAmount
        .mul(decimalFromScaledInteger(contract.retentionPct))
        .div(100)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const count = await transaction.subkonTermyn.count({
        where: { subkonContractId: contract.id },
      });
      const termynNumber = count + 1;
      const termyn = await transaction.subkonTermyn.create({
        data: {
          subkonContractId: contract.id,
          termynNumber,
          claimedPercent: scaledIntegerFromDecimal(claimedPercent),
          grossAmount: scaledIntegerFromDecimal(grossAmount),
          retentionAmount: scaledIntegerFromDecimal(retentionAmount),
          netAmount: scaledIntegerFromDecimal(grossAmount.minus(retentionAmount)),
          status: SubkonTermynStatus.SUBMITTED,
          createdById: session.user.id,
        },
        select: { id: true },
      });
      const invoiceNumber = await nextDocumentNumber(transaction, "INV");
      await transaction.invoice.create({
        data: {
          publicCode: await generateAvailablePublicCode(transaction),
          invoiceNumber,
          projectId: contract.projectId,
          subkonTermynId: termyn.id,
          vendorName: contract.subkonName,
          periodOrDate: `Termin ${termynNumber} · progres ${claimedPercent}%`,
          subTotal: grossAmount.toNumber(),
          tax: 0,
          deduction: retentionAmount.toNumber(),
          grandTotal: grossAmount.minus(retentionAmount).toNumber(),
          status: "UNPAID",
          items: {
            create: {
              description: contract.workScope,
              quantity: 1,
              unit: `Termin ${termynNumber}`,
              unitPrice: grossAmount.toNumber(),
              totalPrice: grossAmount.toNumber(),
            },
          },
        },
      });
    });
  } catch (error) {
    console.error("Subcontract termyn submission failed:", error);
    return failure(
      error instanceof Error && error.message !== "Transaction failed"
        ? error.message
        : "Pengajuan termin gagal disimpan.",
    );
  }
  revalidateConstruction();
  return { success: true, message: "Klaim termin disimpan dengan potongan retensi otomatis 5%." };
}

async function transitionSubkonTermyn(
  id: string,
  expectedStatus: SubkonTermynStatus,
  nextStatus: SubkonTermynStatus,
  allowedRoles: UserRole[],
  actorField:
    | "fieldVerifiedById"
    | "financeReviewedById"
    | "approvedById"
    | "paidById",
  timestampField:
    | "fieldVerifiedAt"
    | "financeReviewedAt"
    | "approvedAt"
    | "paidAt",
  paymentProofUrl?: string,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk memproses termin.");
  if (!allowedRoles.includes(session.user.role)) {
    return failure("Role Anda tidak diizinkan memproses termin.");
  }
  if (!validId(id)) return failure("Data termin tidak valid.");
  const result = await prisma.subkonTermyn.updateMany({
    where: { id, status: expectedStatus },
    data: {
      status: nextStatus,
      [actorField]: session.user.id,
      [timestampField]: new Date(),
      ...(paymentProofUrl ? { paymentProofUrl } : {}),
    },
  });
  if (result.count !== 1) return failure("Termin tidak ditemukan atau statusnya telah berubah.");
  revalidateConstruction();
  return { success: true, message: "Status termin berhasil diperbarui." };
}

export async function verifySubkonTermynField(id: string) {
  return transitionSubkonTermyn(
    id,
    SubkonTermynStatus.SUBMITTED,
    SubkonTermynStatus.FIELD_VERIFIED,
    [UserRole.KOORDINATOR, UserRole.DIRECTOR, UserRole.ADMINISTRATIONS],
    "fieldVerifiedById",
    "fieldVerifiedAt",
  );
}

export async function reviewSubkonTermynFinance(id: string) {
  return transitionSubkonTermyn(
    id,
    SubkonTermynStatus.FIELD_VERIFIED,
    SubkonTermynStatus.FINANCE_CHECKED,
    [UserRole.FINANCE, UserRole.ADMINISTRATIONS],
    "financeReviewedById",
    "financeReviewedAt",
  );
}

export async function approveSubkonTermyn(id: string) {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk menyetujui termin.");
  if (!executiveRoles.includes(session.user.role)) {
    return failure("Hanya Direktur/Wakil Direktur yang dapat menyetujui termin.");
  }
  if (!validId(id)) return failure("Data termin tidak valid.");

  try {
    await prisma.$transaction(async (transaction) => {
      const approval = await transaction.subkonTermyn.updateMany({
        where: { id, status: SubkonTermynStatus.FINANCE_CHECKED },
        data: {
          status: SubkonTermynStatus.APPROVED,
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });
      if (approval.count !== 1) {
        throw new Error("Termin tidak ditemukan atau statusnya telah berubah.");
      }

      const termyn = await transaction.subkonTermyn.findUniqueOrThrow({
        where: { id },
        select: {
          termynNumber: true,
          netAmount: true,
          subkonContract: {
            select: { contractNumber: true, subkonName: true },
          },
        },
      });
      const recipients = await sendNotification({
        roleTarget: UserRole.FINANCE,
        title: "Termin Subkon Siap Dibayar",
        message: `Termin ${termyn.termynNumber} untuk SPK ${termyn.subkonContract.contractNumber} (${termyn.subkonContract.subkonName}) disetujui sebesar Rp ${decimalFromScaledInteger(termyn.netAmount).toString()}.`,
        actionUrl: "/apps/finance?tab=subcontract",
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      if (recipients === 0) {
        throw new Error("Tidak ada akun Keuangan aktif untuk menerima notifikasi termin.");
      }
    });
  } catch (error) {
    console.error("Subcontract termyn approval failed:", error);
    return failure(
      error instanceof Error &&
        error.message.startsWith("Termin tidak ditemukan")
        ? error.message
        : "Persetujuan termin gagal disimpan. Silakan coba kembali.",
    );
  }

  revalidateConstruction();
  return {
    success: true,
    message: "Termin disetujui dan diteruskan ke Keuangan untuk pembayaran.",
  };
}

export async function paySubkonTermyn(
  id: string,
  file: File,
  financeAccountId: string,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk memproses pembayaran termin.");
  if (session.user.role !== UserRole.FINANCE) {
    return failure("Hanya Keuangan yang dapat membayar termin.");
  }
  if (!validId(id) || !validId(financeAccountId)) {
    return failure("Data termin atau buku kas/bank tidak valid.");
  }
  const current = await prisma.subkonTermyn.findUnique({
    where: { id },
    select: { status: true },
  });
  if (current?.status !== SubkonTermynStatus.APPROVED) {
    return failure("Termin harus disetujui Direktur sebelum dibayar.");
  }
  let proofUrl: string;
  try {
    proofUrl = await saveTicketReceipt(file);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Bukti pembayaran tidak valid.");
  }
  try {
    await prisma.$transaction(async (transaction) => {
      const transitioned = await transaction.subkonTermyn.updateMany({
        where: { id, status: SubkonTermynStatus.APPROVED },
        data: {
          status: SubkonTermynStatus.PAID,
          paidById: session.user.id,
          paidAt: new Date(),
          paymentProofUrl: proofUrl,
        },
      });
      if (transitioned.count !== 1) {
        throw new Error("Termin tidak ditemukan atau statusnya telah berubah.");
      }
      const termyn = await transaction.subkonTermyn.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          termynNumber: true,
          claimedPercent: true,
          grossAmount: true,
          retentionAmount: true,
          netAmount: true,
          invoice: { select: { id: true } },
          subkonContract: {
            select: {
              projectId: true,
              contractNumber: true,
              subkonName: true,
              workScope: true,
            },
          },
        },
      });
      await recordFinanceCashflowOutflow(transaction, {
        financeAccountId,
        amount: decimalFromScaledInteger(termyn.netAmount).toNumber(),
        sourceDesc: `Pembayaran Termin ${termyn.termynNumber} · ${termyn.subkonContract.contractNumber} · ${termyn.subkonContract.subkonName}`,
        projectId: termyn.subkonContract.projectId,
        paymentMethod: "TRANSFER",
        proofUrl,
        recordedBy: session.user.id,
      });
      if (termyn.invoice) {
        await transaction.invoice.update({
          where: { id: termyn.invoice.id },
          data: { status: "PAID" },
        });
      } else {
        const invoiceNumber = await nextDocumentNumber(transaction, "INV");
        await transaction.invoice.create({
          data: {
            publicCode: await generateAvailablePublicCode(transaction),
            invoiceNumber,
            projectId: termyn.subkonContract.projectId,
            subkonTermynId: termyn.id,
            vendorName: termyn.subkonContract.subkonName,
            periodOrDate: `Termin ${termyn.termynNumber} · progres ${decimalFromScaledInteger(termyn.claimedPercent).toString()}%`,
            subTotal: decimalFromScaledInteger(termyn.grossAmount).toNumber(),
            tax: 0,
            deduction: decimalFromScaledInteger(termyn.retentionAmount).toNumber(),
            grandTotal: decimalFromScaledInteger(termyn.netAmount).toNumber(),
            status: "PAID",
            items: {
              create: {
                description: termyn.subkonContract.workScope,
                quantity: 1,
                unit: `Termin ${termyn.termynNumber}`,
                unitPrice: decimalFromScaledInteger(termyn.grossAmount).toNumber(),
                totalPrice: decimalFromScaledInteger(termyn.grossAmount).toNumber(),
              },
            },
          },
        });
      }
    });
  } catch (error) {
    try {
      await removeTicketReceipt(proofUrl);
    } catch (cleanupError) {
      console.error("Failed to remove unused subcontract payment proof:", cleanupError);
    }
    console.error("Subcontract termyn payment failed:", error);
    return failure(
      error instanceof Error ? error.message : "Pembayaran termin gagal disimpan.",
    );
  }
  revalidateConstruction();
  return { success: true, message: "Pembayaran termin berhasil dicatat." };
}

const addendumSchema = z.object({
  projectId: z.string().min(1).max(100),
  addendumNumber: z.string().trim().min(1).max(80),
  budgetChange: z.string().trim().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/),
  timeExtension: z.number().int().min(-3650).max(3650),
  reason: z.string().trim().min(5).max(4000),
});

export async function createProjectAddendum(
  input: unknown,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk membuat addendum.");
  if (
    session.user.role !== UserRole.KOORDINATOR &&
    session.user.role !== UserRole.ADMINISTRATIONS
  ) {
    return failure("Hanya Koordinator Lapangan atau Admin yang dapat membuat CCO.");
  }
  const parsed = addendumSchema.safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Data CCO tidak valid.");
  if (new Prisma.Decimal(parsed.data.budgetChange).isZero() && parsed.data.timeExtension === 0) {
    return failure("CCO harus mengubah pagu atau waktu proyek.");
  }
  try {
    await prisma.projectAddendum.create({
      data: {
        ...parsed.data,
        budgetChange: scaledIntegerFromDecimal(parsed.data.budgetChange),
        status: ProjectAddendumStatus.PENDING_APPROVAL,
        createdById: session.user.id,
      },
    });
  } catch (error) {
    console.error("Project addendum creation failed:", error);
    return failure("CCO gagal disimpan. Nomor addendum mungkin sudah digunakan.");
  }
  revalidateConstruction();
  return { success: true, message: "CCO dikirim untuk persetujuan Direktur." };
}

export async function approveProjectAddendum(
  id: string,
  decision: "APPROVED" | "REJECTED",
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk memproses CCO.");
  if (!executiveRoles.includes(session.user.role)) {
    return failure("Hanya Direktur/Wakil Direktur yang dapat memproses CCO.");
  }
  if (!validId(id) || !["APPROVED", "REJECTED"].includes(decision)) {
    return failure("Data persetujuan CCO tidak valid.");
  }
  try {
    await prisma.$transaction(async (transaction) => {
      const addendum = await transaction.projectAddendum.findFirst({
        where: { id, status: ProjectAddendumStatus.PENDING_APPROVAL },
        select: {
          projectId: true,
          budgetChange: true,
          timeExtension: true,
        },
      });
      if (!addendum) throw new Error("CCO tidak ditemukan atau telah diproses.");
      const changed = await transaction.projectAddendum.updateMany({
        where: { id, status: ProjectAddendumStatus.PENDING_APPROVAL },
        data: {
          status:
            decision === "APPROVED"
              ? ProjectAddendumStatus.APPROVED
              : ProjectAddendumStatus.REJECTED,
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });
      if (changed.count !== 1) throw new Error("Status CCO berubah saat diproses.");
      if (decision === "APPROVED") {
        const project = await transaction.project.findUnique({
          where: { id: addendum.projectId },
          select: { endDate: true, pagu: true },
        });
        const budgetChange = decimalFromScaledInteger(addendum.budgetChange);
        if (
          project &&
          decimalFromScaledInteger(project.pagu).plus(budgetChange).lessThan(0)
        ) {
          throw new Error("Perubahan CCO tidak boleh membuat pagu proyek negatif.");
        }
        await transaction.project.update({
          where: { id: addendum.projectId },
          data: {
            pagu: { increment: addendum.budgetChange },
            ...(project?.endDate
              ? {
                  endDate: new Date(
                    project.endDate.getTime() +
                      addendum.timeExtension * 24 * 60 * 60 * 1000,
                  ),
                }
              : {}),
          },
        });
      }
    });
  } catch (error) {
    console.error("Project addendum approval failed:", error);
    return failure(error instanceof Error ? error.message : "Persetujuan CCO gagal.");
  }
  revalidateConstruction();
  return { success: true, message: decision === "APPROVED" ? "CCO disetujui; pagu dan waktu proyek diperbarui." : "CCO ditolak." };
}

export async function createBAST(
  input: {
    projectId: string;
    type: BASTType;
    date: string;
    maintenanceEndsAt?: string;
    notes?: string;
  },
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk membuat BAST.");
  if (!executiveRoles.includes(session.user.role)) {
    return failure("Hanya Direktur/Wakil Direktur yang dapat menerbitkan BAST.");
  }
  const parsed = z
    .object({
      projectId: z.string().min(1).max(100),
      type: z.enum(BASTType),
      date: z.iso.date(),
      maintenanceEndsAt: z.iso.date().optional(),
      notes: z.string().trim().max(4000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Data BAST tidak valid.");
  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: {
      progress: true,
      bastDocuments: {
        where: { type: BASTType.PHO, isApproved: true },
        select: { id: true, maintenanceEndsAt: true },
      },
      subkonContracts: {
        where: { termyns: { some: {} } },
        select: { retentionReleasedAt: true },
      },
    },
  });
  if (!project) return failure("Proyek tidak ditemukan.");
  if (parsed.data.type === BASTType.PHO && project.progress < 100) {
    return failure("BAST PHO hanya dapat dibuat saat progres proyek mencapai 100%.");
  }
  if (parsed.data.type === BASTType.PHO && !parsed.data.maintenanceEndsAt) {
    return failure("Tanggal akhir masa pemeliharaan wajib dicantumkan pada BAST PHO.");
  }
  if (
    parsed.data.type === BASTType.PHO &&
    parsed.data.maintenanceEndsAt &&
    parsed.data.maintenanceEndsAt < parsed.data.date
  ) {
    return failure("Masa pemeliharaan tidak boleh berakhir sebelum tanggal PHO.");
  }
  if (parsed.data.type === BASTType.FHO && project.bastDocuments.length === 0) {
    return failure("BAST FHO memerlukan PHO yang sudah disetujui.");
  }
  if (
    parsed.data.type === BASTType.FHO &&
    project.bastDocuments.some(
      (bast) =>
        !bast.maintenanceEndsAt ||
        bast.maintenanceEndsAt.getTime() > Date.now(),
    )
  ) {
    return failure("Masa pemeliharaan BAST PHO belum berakhir.");
  }
  if (
    parsed.data.type === BASTType.FHO &&
    project.subkonContracts.some((contract) => !contract.retentionReleasedAt)
  ) {
    return failure("Retensi subkon harus dicairkan sebelum BAST FHO dibuat.");
  }
  try {
    const publicCode = await prisma.$transaction(async (transaction) => {
      const code = await generateAvailablePublicCode(transaction);
      const year = new Date(`${parsed.data.date}T00:00:00.000Z`).getUTCFullYear();
      const sequenceKind = `BAST-${parsed.data.type}`;
      const sequence = await transaction.documentNumberSequence.upsert({
        where: { kind_year: { kind: sequenceKind, year } },
        update: { value: { increment: 1 } },
        create: { kind: sequenceKind, year, value: 1 },
        select: { value: true },
      });
      await transaction.bASTDocument.create({
        data: {
          publicCode: code,
          bastNumber: `SPE-${String(sequence.value).padStart(3, "0")}/${sequenceKind}/${year}`,
          projectId: parsed.data.projectId,
          type: parsed.data.type,
          date: new Date(`${parsed.data.date}T00:00:00.000Z`),
          maintenanceEndsAt: parsed.data.maintenanceEndsAt
            ? new Date(`${parsed.data.maintenanceEndsAt}T00:00:00.000Z`)
            : null,
          notes: parsed.data.notes || null,
        },
      });
      return code;
    });
    revalidateConstruction();
    return { success: true, message: "Draf BAST berhasil dibuat.", publicCode };
  } catch (error) {
    console.error("BAST creation failed:", error);
    return failure("BAST gagal dibuat. Periksa data proyek dan coba kembali.");
  }
}

export async function approveBAST(
  id: string,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk menyetujui BAST.");
  if (!executiveRoles.includes(session.user.role)) {
    return failure("Hanya Direktur/Wakil Direktur yang dapat menyetujui BAST.");
  }
  if (!validId(id)) return failure("Data BAST tidak valid.");
  const bast = await prisma.bASTDocument.findUnique({
    where: { id },
    select: {
      type: true,
      project: {
        select: {
          progress: true,
          bastDocuments: {
            where: { type: BASTType.PHO, isApproved: true },
            select: { maintenanceEndsAt: true },
          },
          subkonContracts: {
            where: { termyns: { some: {} } },
            select: { retentionReleasedAt: true },
          },
        },
      },
    },
  });
  if (!bast) return failure("BAST tidak ditemukan.");
  if (bast.type === BASTType.PHO && bast.project.progress < 100) {
    return failure("BAST PHO memerlukan progres proyek 100%.");
  }
  if (
    bast.type === BASTType.FHO &&
    (bast.project.bastDocuments.length === 0 ||
      bast.project.bastDocuments.some(
        (pho) => !pho.maintenanceEndsAt || pho.maintenanceEndsAt.getTime() > Date.now(),
      ) ||
      bast.project.subkonContracts.some((contract) => !contract.retentionReleasedAt))
  ) {
    return failure("Masa pemeliharaan atau pencairan retensi belum selesai.");
  }
  const result = await prisma.bASTDocument.updateMany({
    where: { id, isApproved: false },
    data: {
      isApproved: true,
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });
  if (result.count !== 1) return failure("BAST tidak ditemukan atau sudah disetujui.");
  revalidateConstruction();
  return { success: true, message: "BAST berhasil disetujui." };
}

export async function releaseSubkonRetention(
  contractId: string,
  file: File,
  financeAccountId: string,
): Promise<ConstructionActionResult> {
  const session = await auth();
  if (!session?.user?.id) return failure("Silakan masuk untuk mencairkan retensi.");
  if (session.user.role !== UserRole.FINANCE) {
    return failure("Hanya Keuangan yang dapat mencairkan retensi.");
  }
  if (!validId(contractId) || !validId(financeAccountId)) {
    return failure("Data kontrak atau buku kas/bank tidak valid.");
  }
  const contract = await prisma.subkonContract.findUnique({
    where: { id: contractId },
    select: {
      contractNumber: true,
      subkonName: true,
      projectId: true,
      retentionReleasedAt: true,
      termyns: { select: { status: true, retentionAmount: true } },
      project: {
        select: {
          bastDocuments: {
            where: { type: BASTType.PHO, isApproved: true },
            select: { maintenanceEndsAt: true },
          },
        },
      },
    },
  });
  if (!contract || contract.retentionReleasedAt) {
    return failure("Kontrak tidak ditemukan atau retensinya sudah dicairkan.");
  }
  if (
    contract.termyns.length === 0 ||
    contract.termyns.some((termyn) => termyn.status !== SubkonTermynStatus.PAID)
  ) {
    return failure("Seluruh termin harus sudah dibayar sebelum retensi dicairkan.");
  }
  if (
    contract.project.bastDocuments.length === 0 ||
    contract.project.bastDocuments.some(
      (pho) => !pho.maintenanceEndsAt || pho.maintenanceEndsAt.getTime() > Date.now(),
    )
  ) {
    return failure("Masa pemeliharaan setelah PHO belum selesai.");
  }
  const totalRetention = contract.termyns.reduce(
    (sum, termyn) =>
  sum.plus(decimalFromScaledInteger(termyn.retentionAmount)),
    new Prisma.Decimal(0),
  );
  if (totalRetention.lessThanOrEqualTo(0)) {
    return failure("Tidak ada saldo retensi yang perlu dicairkan.");
  }
  let proofUrl: string;
  try {
    proofUrl = await saveTicketReceipt(file);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Bukti transfer tidak valid.");
  }
  try {
    await prisma.$transaction(async (transaction) => {
      const result = await transaction.subkonContract.updateMany({
        where: { id: contractId, retentionReleasedAt: null },
        data: {
          retentionReleasedAt: new Date(),
          retentionReleasedById: session.user.id,
          retentionReleaseProofUrl: proofUrl,
        },
      });
      if (result.count !== 1) {
        throw new Error("Retensi sudah dicairkan oleh proses lain.");
      }
      await recordFinanceCashflowOutflow(transaction, {
        financeAccountId,
        amount: totalRetention.toNumber(),
        sourceDesc: `Pencairan retensi ${contract.contractNumber} · ${contract.subkonName}`,
        projectId: contract.projectId,
        paymentMethod: "TRANSFER",
        proofUrl,
        recordedBy: session.user.id,
      });
    });
  } catch (error) {
    try {
      await removeTicketReceipt(proofUrl);
    } catch (cleanupError) {
      console.error("Removing orphaned subcontract retention proof failed:", cleanupError);
    }
    console.error("Subcontract retention release failed:", error);
    return failure(
      error instanceof Error &&
        (error.message.startsWith("Retensi sudah") ||
          error.message.startsWith("Saldo buku bank/kas") ||
          error.message.startsWith("Buku bank/kas sumber"))
        ? error.message
        : "Pencairan retensi gagal disimpan. Silakan coba kembali.",
    );
  }
  revalidateConstruction();
  return {
    success: true,
    message: `Retensi ${new Intl.NumberFormat("id-ID").format(totalRetention.toNumber())} berhasil dicatat telah dicairkan.`,
  };
}
