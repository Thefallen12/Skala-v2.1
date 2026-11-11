"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  NotificationType,
  ProjectPriority,
  ProjectStatus,
  UserRole,
} from "@prisma/client";
import { z } from "zod";
import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notifications";
import { PrivatePhotoValidationError } from "@/lib/private-photos";
import {
  removeProjectProgressPhoto,
  saveProjectProgressPhoto,
  saveProjectWorkPointPhoto,
  type StoredProjectProgressPhoto,
} from "@/lib/project-progress-photos";
import { removeBlueprintFile } from "@/lib/blueprint-files";
import { getPaidProjectTicketRealization } from "@/lib/project-realization";
import {
  decimalFromScaledInteger,
  decimalNumberFromScaledInteger,
  scaledIntegerFromDecimal,
} from "@/lib/scaled-decimal";
import { parseDrtRabWorkbook } from "@/lib/drt-rab-parser";

export type ProjectFinancialCategory = {
  key: "MATERIAL" | "LABOR" | "TRANSPORT" | "OPERATIONAL";
  label: string;
  amount: string;
};

export type ProjectFinancialBreakdown =
  | {
      success: true;
      data: {
        projectTitle: string;
        budget: string;
        realized: string;
        remaining: string;
        percentage: number;
        categories: ProjectFinancialCategory[];
      };
    }
  | { success: false; message: string };

const failure = (message: string): ProjectFinancialBreakdown => ({
  success: false,
  message,
});

const projectPriorities = [
  ProjectPriority.LOW,
  ProjectPriority.MEDIUM,
  ProjectPriority.HIGH,
  ProjectPriority.URGENT,
] as const;

const projectMoneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,2})?$/, "Masukkan nominal maksimal 2 angka desimal.");

const projectInputSchema = z
  .object({
    code: z.string().trim().min(1, "Kode proyek wajib diisi.").max(40),
    title: z.string().trim().min(1, "Nama proyek wajib diisi.").max(180),
    kelompokTani: z
      .string()
      .trim()
      .min(1, "Kelompok tani wajib diisi.")
      .max(160),
    address: z.string().trim().min(1, "Alamat wajib diisi.").max(240),
    jenisPekerjaan: z.string().trim().max(180),
    fieldPicId: z.union([z.literal(""), z.string().min(1).max(100)]),
    pagu: z.union([z.literal(""), projectMoneySchema]).optional(),
    landArea: z.union([
      z.literal(""),
      z.string().regex(
        /^\d{1,10}(?:\.\d{1,2})?$/,
        "Luas lahan harus berupa angka positif maksimal 2 desimal.",
      ),
    ]),
    progress: z.coerce.number().finite().min(0).max(100),
    priority: z.enum(projectPriorities),
    vendor: z.string().trim().max(160),
    clientName: z.string().trim().max(160),
    location: z.string().trim().max(240),
    startDate: z.union([z.literal(""), z.iso.date()]),
    endDate: z.union([z.literal(""), z.iso.date()]),
    budget: z.union([z.literal(""), projectMoneySchema]).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.startDate &&
      value.endDate &&
      value.endDate < value.startDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
      });
    }
  });

export type ProjectFormInput = z.infer<typeof projectInputSchema>;
export type ProjectMutationResult =
  | { success: true; message: string }
  | { success: false; message: string };

const projectManagerRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
];

const projectAccessRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
  UserRole.DRAFTER,
];

const setupProjectStatuses: ProjectStatus[] = [
  ProjectStatus.PENDING_SETUP,
  ProjectStatus.PENDING,
  ProjectStatus.PLANNED,
];

async function activateProjectIfReady(projectId: string) {
  return prisma.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: {
        id: true,
        name: true,
        status: true,
        fieldPicId: true,
        workPoints: {
          where: { approvedTotalWage: { gt: 0 } },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (
      !project ||
      !setupProjectStatuses.includes(project.status) ||
      !project.fieldPicId ||
      project.workPoints.length === 0
    ) {
      return false;
    }

    const updated = await transaction.project.updateMany({
      where: {
        id: project.id,
        isDeleted: false,
        status: { in: setupProjectStatuses },
        fieldPicId: project.fieldPicId,
      },
      data: { status: ProjectStatus.RUNNING },
    });
    if (updated.count !== 1) return false;

    await transaction.notification.create({
      data: {
        userId: project.fieldPicId,
        title: "Proyek Aktif",
        message: `Proyek ${project.name} resmi berjalan. Silakan mulai mengisi laporan harian dan progres.`,
        actionUrl: `/apps/projects?projectId=${encodeURIComponent(project.id)}`,
      },
    });
    return true;
  });
}

export async function checkProjectActivation(
  projectId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk memeriksa aktivasi proyek." };
  }
  if (!projectAccessRoles.includes(session.user.role)) {
    return { success: false, message: "Role Anda tidak diizinkan memeriksa aktivasi proyek." };
  }
  if (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 100) {
    return { success: false, message: "Project yang dipilih tidak valid." };
  }

  try {
    const activated = await activateProjectIfReady(projectId);
    return {
      success: true,
      message: activated
        ? "Prasyarat terpenuhi. Status proyek berubah menjadi RUNNING dan PIC telah diberi notifikasi."
        : "Proyek masih menunggu PIC lapangan dan persetujuan minimal satu upah titik.",
    };
  } catch (error) {
    console.error("Checking project activation failed:", error);
    return { success: false, message: "Aktivasi proyek gagal diperiksa. Silakan coba kembali." };
  }
}

export async function saveProject(
  projectId: string | null,
  input: ProjectFormInput,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengelola proyek." };
  }
  if (!projectManagerRoles.includes(session.user.role)) {
    return { success: false, message: "Role Anda tidak diizinkan mengelola proyek." };
  }
  if (
    projectId !== null &&
    (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 100)
  ) {
    return { success: false, message: "Project yang dipilih tidak valid." };
  }
  const existingProject = projectId
    ? await prisma.project.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { id: true, pagu: true, budget: true },
      })
    : null;
  if (projectId && !existingProject) {
    return { success: false, message: "Project tidak ditemukan atau sudah diarsipkan." };
  }

  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Data proyek tidak valid.",
    };
  }

  const values = parsed.data;
  if (
    !projectId &&
    (!values.pagu || values.pagu === "")
  ) {
    return { success: false, message: "Pagu proyek wajib diisi." };
  }
  if (
    projectId &&
    session.user.role !== UserRole.DIRECTOR &&
    (values.pagu !== undefined || values.budget !== undefined)
  ) {
    return { success: false, message: "Hanya Direktur yang dapat mengubah pagu atau anggaran proyek." };
  }
  if (projectId && values.pagu === "") {
    return { success: false, message: "Pagu proyek wajib diisi." };
  }
  if (values.fieldPicId) {
    const fieldPic = await prisma.user.findFirst({
      where: {
        id: values.fieldPicId,
        role: { in: [UserRole.FIELD_TEAM, UserRole.KOORDINATOR] },
        isActive: true,
      },
      select: { id: true },
    });
    if (!fieldPic) {
      return {
        success: false,
        message: "PIC harus dipilih dari akun Team Lapangan/Koordinator Lapangan yang aktif.",
      };
    }
  }
  const data = {
    code: values.code,
    name: values.title,
    title: values.title,
    kelompokTani: values.kelompokTani,
    address: values.address,
    jenisPekerjaan: values.jenisPekerjaan || null,
    fieldPicId: values.fieldPicId || null,
    ...(values.pagu
      ? { pagu: scaledIntegerFromDecimal(values.pagu) }
      : {}),
    landArea: values.landArea ? scaledIntegerFromDecimal(values.landArea) : null,
    progress: values.progress,
    priority: values.priority,
    vendor: values.vendor || null,
    clientName: values.clientName || null,
    location: values.location || null,
    startDate: values.startDate
      ? new Date(`${values.startDate}T00:00:00.000Z`)
      : null,
    endDate: values.endDate
      ? new Date(`${values.endDate}T00:00:00.000Z`)
      : null,
    ...(values.budget !== undefined
      ? {
          budget: values.budget
            ? scaledIntegerFromDecimal(values.budget)
            : null,
        }
      : {}),
  };

  try {
    let savedProjectId = projectId;
    if (projectId) {
      await prisma.project.update({ where: { id: projectId }, data });
    } else {
      if (!values.pagu) {
        return { success: false, message: "Pagu proyek wajib diisi." };
      }
      const created = await prisma.project.create({
        data: {
          ...data,
          pagu: scaledIntegerFromDecimal(values.pagu),
          status: ProjectStatus.PENDING_SETUP,
        },
        select: { id: true },
      });
      savedProjectId = created.id;
    }
    if (!savedProjectId) throw new Error("Saved project ID is unavailable.");
    const activated = await activateProjectIfReady(savedProjectId);
    revalidatePath("/apps/project");
    revalidatePath("/apps/projects");
    revalidatePath("/apps/habits");
    return {
      success: true,
      message: activated
        ? "Proyek berhasil disimpan dan otomatis berubah menjadi RUNNING."
        : projectId
          ? "Perubahan proyek berhasil disimpan."
          : "Proyek berhasil ditambahkan dengan status PENDING SETUP.",
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, message: "Kode proyek sudah digunakan." };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { success: false, message: "Project tidak ditemukan." };
    }
    console.error("Saving project failed:", error);
    return {
      success: false,
      message: "Data proyek gagal disimpan. Silakan coba kembali.",
    };
  }
}

export async function assignProjectFieldPic(
  projectId: string,
  fieldPicId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menetapkan PIC proyek." };
  }
  if (!projectManagerRoles.includes(session.user.role)) {
    return { success: false, message: "Role Anda tidak diizinkan menetapkan PIC proyek." };
  }
  if (
    typeof projectId !== "string" ||
    projectId.length < 1 ||
    projectId.length > 100 ||
    typeof fieldPicId !== "string" ||
    fieldPicId.length > 100
  ) {
    return { success: false, message: "Data proyek atau PIC tidak valid." };
  }

  if (fieldPicId) {
    const fieldPic = await prisma.user.findFirst({
      where: {
        id: fieldPicId,
        role: { in: [UserRole.FIELD_TEAM, UserRole.KOORDINATOR] },
        isActive: true,
      },
      select: { id: true },
    });
    if (!fieldPic) {
      return {
        success: false,
        message: "PIC harus akun aktif Tim Lapangan atau Koordinator Lapangan.",
      };
    }
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: { id: true },
    });
    if (!project) {
      return { success: false, message: "Proyek tidak ditemukan atau sudah dihapus." };
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { fieldPicId: fieldPicId || null },
    });
    const activated = await activateProjectIfReady(projectId);
    revalidatePath("/apps/projects");
    revalidatePath("/apps/project");
    return {
      success: true,
      message: activated
        ? "PIC ditetapkan dan proyek otomatis berubah menjadi RUNNING."
        : "Penunjukan PIC proyek berhasil disimpan.",
    };
  } catch (error) {
    console.error("Assigning project field PIC failed:", error);
    return {
      success: false,
      message: "Penunjukan PIC gagal disimpan. Silakan coba kembali.",
    };
  }
}

const projectImportRowSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(180),
  pagu: z.union([z.string(), z.number()]).transform(String).pipe(projectMoneySchema),
  jenisPekerjaan: z.string().trim().max(180).optional().default(""),
  desa: z.string().trim().max(160).optional().default(""),
  kecamatan: z.string().trim().max(160).optional().default(""),
  kabupaten: z.string().trim().max(160).optional().default(""),
  status: z.string().trim().max(40).optional().default(""),
});

const importStatusValues: Record<string, ProjectStatus> = {
  PENDING: ProjectStatus.PENDING_SETUP,
  "PENDING SETUP": ProjectStatus.PENDING_SETUP,
  "BELUM DIMULAI": ProjectStatus.PENDING_SETUP,
  RUNNING: ProjectStatus.PENDING_SETUP,
  PLANNED: ProjectStatus.PLANNED,
  DIRENCANAKAN: ProjectStatus.PLANNED,
  ON_PROGRESS: ProjectStatus.PENDING_SETUP,
  "ON PROGRESS": ProjectStatus.PENDING_SETUP,
  ACTIVE: ProjectStatus.PENDING_SETUP,
  BERJALAN: ProjectStatus.PENDING_SETUP,
  TERHAMBAT: ProjectStatus.TERHAMBAT,
  ON_HOLD: ProjectStatus.ON_HOLD,
  DITUNDA: ProjectStatus.ON_HOLD,
  DONE: ProjectStatus.DONE,
  COMPLETED: ProjectStatus.COMPLETED,
  SELESAI: ProjectStatus.COMPLETED,
};

export async function importProjects(
  input: unknown,
): Promise<ProjectMutationResult & { importedCount?: number; skippedCount?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengimpor proyek." };
  }
  if (!projectManagerRoles.includes(session.user.role)) {
    return { success: false, message: "Role Anda tidak diizinkan mengimpor proyek." };
  }
  const parsed = z.array(projectImportRowSchema).min(1).max(500).safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ??
        "Data proyek tidak valid. Maksimal 500 baris per impor.",
    };
  }

  const invalidStatus = parsed.data.find(
    (row) => row.status && !importStatusValues[row.status.toUpperCase()],
  );
  if (invalidStatus) {
    return {
      success: false,
      message: `Status proyek "${invalidStatus.status}" tidak dikenali.`,
    };
  }

  const data = parsed.data.map((row) => {
    const village = row.desa || row.title;
    const address = [
      village,
      row.kecamatan && `Kec. ${row.kecamatan}`,
      row.kabupaten && `Kab. ${row.kabupaten}`,
    ]
      .filter(Boolean)
      .join(", ");
    const status = row.status
      ? importStatusValues[row.status.toUpperCase()]
      : ProjectStatus.PENDING_SETUP;

    return {
      code: row.code,
      name: row.title,
      title: row.title,
      kelompokTani: village,
      address,
      location: address,
      jenisPekerjaan: row.jenisPekerjaan || null,
      pagu: scaledIntegerFromDecimal(row.pagu),
      status,
      isDeleted: false,
    };
  });

  try {
    let importedCount = 0;
    let skippedCount = 0;
    for (const project of data) {
      try {
        await prisma.project.create({ data: project });
        importedCount += 1;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          skippedCount += 1;
          continue;
        }
        throw error;
      }
    }
    revalidatePath("/apps/projects");
    revalidatePath("/apps/project");
    revalidatePath("/apps/habits");
    return {
      success: true,
      message: `${importedCount} proyek diimpor. Kode yang sudah ada dilewati.`,
      importedCount,
      skippedCount,
    };
  } catch (error) {
    console.error("Importing projects failed:", error);
    return {
      success: false,
      message: "Impor proyek gagal disimpan. Periksa format file dan coba kembali.",
    };
  }
}

export async function deleteProject(
  projectId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menghapus proyek." };
  }
  if (session.user.role !== UserRole.DIRECTOR) {
    return { success: false, message: "Role Anda tidak diizinkan menghapus proyek." };
  }
  if (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 100) {
    return { success: false, message: "Project yang dipilih tidak valid." };
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      select: {
        dailyReports: {
          select: {
            progressPhotos: {
              select: { url: true, fileUrl: true, publicId: true },
            },
          },
        },
        workPoints: {
          select: {
            progressReports: {
              select: {
                photos: { select: { url: true, fileUrl: true, publicId: true } },
              },
            },
          },
        },
        blueprints: { select: { fileUrl: true } },
      },
    });
    if (!project) {
      return { success: false, message: "Proyek tidak ditemukan atau sudah dihapus." };
    }

    await prisma.project.delete({ where: { id: projectId } });
    revalidatePath("/apps/projects");
    revalidatePath("/apps/project");
    revalidatePath("/apps/habits");

    const projectPhotos = [
      ...project.dailyReports.flatMap((report) =>
        report.progressPhotos.map((photo) => ({
          url: photo.fileUrl ?? photo.url,
          publicId: photo.publicId,
        })),
      ),
      ...project.workPoints.flatMap((point) =>
        point.progressReports.flatMap((report) =>
          report.photos.map((photo) => ({
            url: photo.fileUrl ?? photo.url,
            publicId: photo.publicId,
          })),
        ),
      ),
    ];
    const fileCleanupResults = await Promise.allSettled([
      ...projectPhotos.map(removeProjectProgressPhoto),
      ...project.blueprints.map((blueprint) =>
        removeBlueprintFile(blueprint.fileUrl),
      ),
    ]);
    const cleanupErrors = fileCleanupResults.filter(
      (result) => result.status === "rejected",
    );
    if (cleanupErrors.length > 0) {
      console.error(
        `Project ${projectId} was deleted, but ${cleanupErrors.length} uploaded file(s) could not be removed:`,
        cleanupErrors.map((result) =>
          result.status === "rejected" ? result.reason : undefined,
        ),
      );
      return {
        success: true,
        message: `Proyek dan data terkait berhasil dihapus permanen, tetapi ${cleanupErrors.length} file unggahan gagal dibersihkan.`,
      };
    }
    return {
      success: true,
      message: "Proyek dan data terkait berhasil dihapus permanen.",
    };
  } catch (error) {
    console.error("Permanently deleting project failed:", error);
    return {
      success: false,
      message: "Proyek gagal dihapus permanen. Silakan coba kembali.",
    };
  }
}

export async function duplicateProject(
  projectId: string,
): Promise<ProjectMutationResult & { newProjectId?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menduplikasi proyek." };
  }
  if (!projectManagerRoles.includes(session.user.role)) {
    return { success: false, message: "Role Anda tidak diizinkan menduplikasi proyek." };
  }
  try {
    const source = await prisma.project.findFirst({
      where: { id: projectId, isDeleted: false },
      include: {
        workPoints: true,
      },
    });
    if (!source) {
      return { success: false, message: "Proyek tidak ditemukan." };
    }
    const year = new Date().getFullYear();
    const count = await prisma.project.count();
    const nextCode = `PRJ-${year}-${String(count + 1).padStart(3, "0")}`;
    const duplicated = await prisma.project.create({
      data: {
        code: nextCode,
        name: `${source.name} (Salinan)`,
        title: `${source.title} (Salinan)`,
        kelompokTani: source.kelompokTani,
        address: source.address,
        jenisPekerjaan: source.jenisPekerjaan,
        location: source.location,
        status: ProjectStatus.PENDING_SETUP,
        progress: 0,
        pagu: source.pagu,
        budget: source.budget,
        priority: source.priority,
        vendor: source.vendor,
        clientName: source.clientName,
        fieldPicId: source.fieldPicId,
        startDate: source.startDate,
        endDate: source.endDate,
        workPoints: {
          create: source.workPoints.map((pt) => ({
            title: pt.title,
            location: pt.location,
            plannedStartDate: pt.plannedStartDate,
            targetDate: pt.targetDate,
            proposedVolume: pt.proposedVolume,
            proposedUnit: pt.proposedUnit,
            proposedUnitPrice: pt.proposedUnitPrice,
            proposedTotalWage: pt.proposedTotalWage,
            proposedById: session.user.id,
            progress: 0,
          })),
        },
      },
      select: { id: true, code: true },
    });
    revalidatePath("/apps/projects");
    return {
      success: true,
      message: `Proyek berhasil diduplikasi menjadi ${duplicated.code}.`,
      newProjectId: duplicated.id,
    };
  } catch (error) {
    console.error("Duplicate project failed:", error);
    return {
      success: false,
      message: "Gagal menduplikasi proyek. Silakan coba kembali.",
    };
  }
}

const workPointInputSchema = z
  .object({
    title: z.string().trim().min(1, "Nama tugas/titik wajib diisi.").max(180),
    location: z.string().trim().max(240),
    proposedVolume: z
      .string()
      .trim()
      .regex(/^\d{1,11}(?:\.\d{1,3})?$/, "Volume harus lebih besar dari nol."),
    proposedUnit: z.string().trim().min(1, "Satuan volume wajib diisi.").max(40),
    proposedUnitPrice: projectMoneySchema,
    proposedTotalWage: projectMoneySchema,
    plannedStartDate: z.union([z.literal(""), z.iso.date()]).optional().default(""),
    targetDate: z.union([z.literal(""), z.iso.date()]).optional().default(""),
  })
  .superRefine((value, context) => {
    const volume = new Prisma.Decimal(value.proposedVolume);
    const unitPrice = new Prisma.Decimal(value.proposedUnitPrice);
    const total = new Prisma.Decimal(value.proposedTotalWage);
    if (volume.lessThanOrEqualTo(0)) {
      context.addIssue({
        code: "custom",
        path: ["proposedVolume"],
        message: "Volume harus lebih besar dari nol.",
      });
    }
    if (unitPrice.lessThanOrEqualTo(0) || total.lessThanOrEqualTo(0)) {
      context.addIssue({
        code: "custom",
        path: ["proposedUnitPrice"],
        message: "Harga satuan dan total upah harus lebih besar dari nol.",
      });
    }
    if (
      value.plannedStartDate &&
      value.targetDate &&
      value.targetDate < value.plannedStartDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["targetDate"],
        message: "Tanggal target tidak boleh sebelum tanggal mulai.",
      });
    }
  });

const workPointProgressSchema = z.object({
  reportDate: z.iso.date(),
  progress: z.coerce.number().finite().min(0).max(100),
  workSummary: z.string().trim().max(2000),
});

const projectWageAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,2})?$/, "Masukkan nominal maksimal 2 angka desimal.");

async function isAssignedProjectFieldPic(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { fieldPicId: true, isDeleted: true },
  });
  return !project?.isDeleted && project?.fieldPicId === userId;
}

function isFieldPicRole(role: UserRole) {
  return role === UserRole.FIELD_TEAM || role === UserRole.KOORDINATOR;
}

export async function createProjectWorkPoint(
  projectId: string,
  input: {
    title: string;
    location: string;
    proposedVolume: string;
    proposedUnit: string;
    proposedUnitPrice: string;
    proposedTotalWage: string;
    plannedStartDate?: string;
    targetDate?: string;
  },
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengajukan titik pekerjaan." };
  }
  if (
    typeof projectId !== "string" ||
    projectId.length < 1 ||
    projectId.length > 100
  ) {
    return { success: false, message: "Project yang dipilih tidak valid." };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { fieldPicId: true, isDeleted: true, title: true },
  });
  if (!project || project.isDeleted) {
    return { success: false, message: "Project tidak ditemukan atau sudah diarsipkan." };
  }

  const canManageProject = projectManagerRoles.includes(session.user.role);
  const isAssignedFieldPic =
    isFieldPicRole(session.user.role) && project.fieldPicId === session.user.id;
  if (!canManageProject && !isAssignedFieldPic) {
    return {
      success: false,
      message:
        "Hanya PIC proyek yang ditunjuk, Direktur, atau Administrasi yang dapat mengajukan titik dan upah.",
    };
  }

  const parsed = workPointInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Data titik pekerjaan tidak valid.",
    };
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const workPoint = await transaction.projectWorkPoint.create({
        data: {
          projectId,
          title: parsed.data.title,
          location: parsed.data.location || null,
          plannedStartDate: parsed.data.plannedStartDate
            ? new Date(`${parsed.data.plannedStartDate}T00:00:00.000Z`)
            : null,
          targetDate: parsed.data.targetDate
            ? new Date(`${parsed.data.targetDate}T00:00:00.000Z`)
            : null,
          proposedVolume: scaledIntegerFromDecimal(parsed.data.proposedVolume),
          proposedUnit: parsed.data.proposedUnit,
          proposedUnitPrice: scaledIntegerFromDecimal(
            parsed.data.proposedUnitPrice,
          ),
          proposedTotalWage: scaledIntegerFromDecimal(
            parsed.data.proposedTotalWage,
          ),
          proposedById: session.user.id,
        },
        select: { id: true },
      });
      const notifiedDirectors = await sendNotification({
        roleTarget: [UserRole.DIRECTOR, UserRole.DEPUTY_DIRECTOR],
        title: "Usulan Upah Titik Menunggu Persetujuan",
        message: `${session.user.name} mengajukan upah untuk ${parsed.data.title} di proyek ${project.title}; mohon tinjau di pusat persetujuan eksekutif.`,
        actionUrl: `/apps/approvals?tab=wages&openSheet=${encodeURIComponent(workPoint.id)}`,
        type: NotificationType.APPROVAL,
        database: transaction,
      });
      if (notifiedDirectors === 0) {
        throw new Error("Tidak ada akun Direktur atau Wakil Direktur aktif untuk menerima usulan upah.");
      }
    });
    revalidatePath("/apps/project");
    revalidatePath("/apps/projects");
    revalidatePath("/apps/approvals");
    return {
      success: true,
      message: canManageProject
        ? "Titik dan usulan total upah berhasil dicatat dan dikirim ke persetujuan Direktur."
        : "Usulan titik dan total upah berhasil dikirim kepada Direktur.",
    };
  } catch (error) {
    console.error("Creating project work point failed:", error);
    return {
      success: false,
      message:
        error instanceof Error &&
        error.message === "Tidak ada akun Direktur aktif untuk menerima usulan upah."
          ? error.message
          : "Titik pekerjaan gagal disimpan. Silakan coba kembali.",
    };
  }
}

export async function addProjectWorkPointProgress(
  workPointId: string,
  input: FormData,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengirim progres titik." };
  }
  if (!(input instanceof FormData)) {
    return { success: false, message: "Data progres titik tidak valid." };
  }
  const workPoint = await prisma.projectWorkPoint.findUnique({
    where: { id: workPointId },
    select: { id: true, projectId: true },
  });
  if (!workPoint) {
    return { success: false, message: "Titik pekerjaan tidak ditemukan." };
  }
  if (
    !isFieldPicRole(session.user.role) ||
    !(await isAssignedProjectFieldPic(workPoint.projectId, session.user.id))
  ) {
    return { success: false, message: "Anda tidak berhak mengirim progres titik ini." };
  }

  const photoEntries = input.getAll("photos");
  const photos: File[] = [];
  for (const entry of photoEntries) {
    if (!(entry instanceof File)) {
      return { success: false, message: "Data foto progres titik tidak valid." };
    }
    photos.push(entry);
  }
  if (photos.length > 5) {
    return { success: false, message: "Maksimal 5 foto untuk setiap progres titik." };
  }

  const parsed = workPointProgressSchema.safeParse({
    reportDate: input.get("reportDate"),
    progress: input.get("progress"),
    workSummary: input.get("workSummary"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Data progres titik tidak valid.",
    };
  }

  const storedPhotos: StoredProjectProgressPhoto[] = [];
  let transactionCommitted = false;
  try {
    for (const photo of photos) {
      storedPhotos.push(await saveProjectWorkPointPhoto(photo));
    }
    await prisma.$transaction(async (transaction) => {
      const progressReport = await transaction.projectWorkPointProgress.create({
        data: {
          workPointId,
          reportDate: new Date(`${parsed.data.reportDate}T00:00:00.000Z`),
          progress: parsed.data.progress,
          workSummary: parsed.data.workSummary || null,
        },
      });
      if (storedPhotos.length > 0) {
        await transaction.projectWorkPointProgressPhoto.createMany({
          data: storedPhotos.map((photo) => ({
            progressReportId: progressReport.id,
            url: photo.url,
            fileUrl: photo.fileUrl,
            publicId: photo.publicId,
          })),
        });
      }
      await transaction.projectWorkPoint.update({
        where: { id: workPointId },
        data: { progress: parsed.data.progress },
      });
    });
    transactionCommitted = true;
    revalidatePath("/apps/project");
    return { success: true, message: "Progres titik dan foto berhasil dikirim." };
  } catch (error) {
    if (!transactionCommitted) {
      for (const photo of storedPhotos) {
        try {
          await removeProjectProgressPhoto(photo);
        } catch (cleanupError) {
          console.error("Removing orphaned work point photo failed:", cleanupError);
        }
      }
    }
    if (error instanceof PrivatePhotoValidationError) {
      return { success: false, message: error.message };
    }
    console.error("Adding project work point progress failed:", error);
    return {
      success: false,
      message: "Progres titik gagal disimpan. Silakan coba kembali.",
    };
  }
}

export async function approveProjectWorkPointWage(
  workPointId: string,
  amount: string,
  reason = "Persetujuan awal atas nilai usulan.",
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menyetujui upah." };
  }
  if (
    session.user.role !== UserRole.DIRECTOR &&
    session.user.role !== UserRole.DEPUTY_DIRECTOR
  ) {
    return {
      success: false,
      message: "Hanya Direktur atau Wakil Direktur yang dapat menyetujui usulan upah.",
    };
  }
  const parsed = projectWageAmountSchema.safeParse(amount);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Nilai upah tidak valid." };
  }
  if (typeof reason !== "string" || reason.trim().length > 2000) {
    return { success: false, message: "Alasan perubahan upah tidak valid." };
  }
  try {
    const projectId = await prisma.$transaction(async (transaction) => {
      const workPoint = await transaction.projectWorkPoint.findUnique({
        where: { id: workPointId },
        select: { projectId: true, approvedTotalWage: true, proposedTotalWage: true },
      });
      if (!workPoint) throw new Error("Titik pekerjaan tidak ditemukan.");
      if (workPoint.approvedTotalWage) {
        if (reason.trim().length < 5) {
          throw new Error("Alasan wajib diisi minimal 5 karakter untuk perubahan upah yang sudah disetujui.");
        }
        if (
          session.user.role !== UserRole.ADMINISTRATIONS &&
          session.user.role !== UserRole.DIRECTOR &&
          session.user.role !== UserRole.DEPUTY_DIRECTOR
        ) {
          throw new Error("Hanya Admin/Direktur yang dapat mengoreksi upah yang sudah disetujui.");
        }
      }
      const newWage = new Prisma.Decimal(parsed.data);
      await transaction.projectWorkPoint.update({
        where: { id: workPointId },
        data: {
          approvedTotalWage: scaledIntegerFromDecimal(newWage),
          wageApprovedAt: new Date(),
          wageApprovedById: session.user.id,
        },
      });
      await transaction.wageAuditLog.create({
        data: {
          workPointId,
          oldWage:
            workPoint.approvedTotalWage ?? workPoint.proposedTotalWage,
          newWage: scaledIntegerFromDecimal(newWage),
          changedById: session.user.id,
          reason: reason.trim() || "Persetujuan awal atas nilai usulan.",
        },
      });
      return workPoint.projectId;
    });
    const activated = await activateProjectIfReady(projectId);
    revalidatePath("/apps/project");
    revalidatePath("/apps/projects");
    revalidatePath("/apps/approvals");
    return {
      success: true,
      message: activated
        ? "Total upah disetujui dan proyek otomatis berubah menjadi RUNNING. PIC telah diberi notifikasi."
        : "Total upah titik berhasil disetujui.",
    };
  } catch (error) {
    console.error("Approving work point wage failed:", error);
    return { success: false, message: "Persetujuan upah gagal disimpan." };
  }
}

export async function editApprovedProjectWorkPointWage(
  workPointId: string,
  amount: string,
  reason: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengubah nilai upah." };
  }
  if (
    session.user.role !== UserRole.ADMINISTRATIONS &&
    session.user.role !== UserRole.DIRECTOR
  ) {
    return { success: false, message: "Hanya Admin/Direktur yang dapat mengubah nilai upah." };
  }
  const parsed = projectWageAmountSchema.safeParse(amount);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Nilai upah tidak valid." };
  }
  if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 2000) {
    return { success: false, message: "Alasan perubahan wajib diisi minimal 5 karakter." };
  }
  try {
    const result = await prisma.$transaction(async (transaction) => {
      const workPoint = await transaction.projectWorkPoint.findFirst({
        where: { id: workPointId, approvedTotalWage: { not: null } },
        select: { approvedTotalWage: true },
      });
      if (!workPoint?.approvedTotalWage) return false;
      const newWage = new Prisma.Decimal(parsed.data);
      const updated = await transaction.projectWorkPoint.updateMany({
        where: { id: workPointId, approvedTotalWage: workPoint.approvedTotalWage },
        data: {
          approvedTotalWage: scaledIntegerFromDecimal(newWage),
          wageApprovedAt: new Date(),
          wageApprovedById: session.user.id,
        },
      });
      if (updated.count !== 1) return false;
      await transaction.wageAuditLog.create({
        data: {
          workPointId,
          oldWage: workPoint.approvedTotalWage,
          newWage: scaledIntegerFromDecimal(newWage),
          changedById: session.user.id,
          reason: reason.trim(),
        },
      });
      return true;
    });
    if (!result) {
      return { success: false, message: "Upah belum disetujui, titik tidak ditemukan, atau berubah bersamaan." };
    }
    revalidatePath("/apps/project");
    revalidatePath("/apps/projects");
    revalidatePath("/apps/approvals");
    return { success: true, message: "Nilai upah yang disetujui berhasil diperbarui." };
  } catch (error) {
    console.error("Editing approved work point wage failed:", error);
    return { success: false, message: "Nilai upah gagal diperbarui." };
  }
}

const projectProgressSchema = z
  .object({
    reportDate: z.iso.date(),
    progress: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce.number().finite().min(0).max(100).optional(),
    ),
    workPointId: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() ? value.trim() : undefined,
      z.string().max(100).optional(),
    ),
    dailyVolume: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce.number().finite().positive().optional(),
    ),
    workSummary: z.string().trim().min(1).max(2000),
    weather: z.enum(["Cerah", "Hujan Gerimis", "Hujan Lebat", "Mendung"]),
    workersCount: z.coerce.number().int().min(0).max(100000),
  })
  .superRefine((value, context) => {
    if (value.workPointId && value.dailyVolume === undefined) {
      context.addIssue({
        code: "custom",
        path: ["dailyVolume"],
        message: "Volume yang selesai hari ini wajib diisi.",
      });
    }
    if (!value.workPointId && value.progress === undefined) {
      context.addIssue({
        code: "custom",
        path: ["progress"],
        message: "Pilih item pekerjaan atau isi progres kumulatif proyek.",
      });
    }
    if (!value.workPointId && value.dailyVolume !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["workPointId"],
        message: "Pilih item pekerjaan untuk mencatat volume harian.",
      });
    }
  });

const progressUpdateRoles: UserRole[] = [
  UserRole.ADMINISTRATIONS,
  UserRole.DIRECTOR,
  UserRole.DEPUTY_DIRECTOR,
  UserRole.KOORDINATOR,
  UserRole.FIELD_TEAM,
];

export async function addProjectProgress(
  projectId: string,
  input: FormData,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk memperbarui progres." };
  }
  if (!progressUpdateRoles.includes(session.user.role)) {
    return {
      success: false,
      message: "Role Anda tidak diizinkan memperbarui progres proyek.",
    };
  }
  if (
    typeof projectId !== "string" ||
    projectId.length < 1 ||
    projectId.length > 100
  ) {
    return { success: false, message: "Project yang dipilih tidak valid." };
  }

  if (!(input instanceof FormData)) {
    return { success: false, message: "Data progres tidak valid." };
  }

  const photoEntries = input.getAll("photos");
  const photos: File[] = [];
  for (const entry of photoEntries) {
    if (!(entry instanceof File)) {
      return { success: false, message: "Data foto tidak valid." };
    }
    photos.push(entry);
  }

  const parsed = projectProgressSchema.safeParse({
    reportDate: input.get("reportDate"),
    progress: input.get("progress"),
    workPointId: input.get("workPointId"),
    dailyVolume: input.get("dailyVolume"),
    workSummary: input.get("workSummary"),
    weather: input.get("weather"),
    workersCount: input.get("workersCount"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Data progres tidak valid.",
    };
  }

  const values = parsed.data;
  const reportDate = new Date(`${values.reportDate}T00:00:00.000Z`);
  if (photos.length > 5) {
    return {
      success: false,
      message: "Setiap laporan progres dapat memiliki maksimal 5 foto.",
    };
  }

  const storedPhotos: StoredProjectProgressPhoto[] = [];
  let transactionCommitted = false;
  try {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        isDeleted: false,
        status: {
          in: [ProjectStatus.RUNNING, ProjectStatus.ON_PROGRESS, ProjectStatus.ACTIVE],
        },
      },
      select: {
        id: true,
        fieldPicId: true,
        progress: true,
      },
    });
    if (!project) {
      return {
        success: false,
        message: "Laporan harian hanya dapat dibuat setelah proyek berstatus RUNNING.",
      };
    }
    if (
      isFieldPicRole(session.user.role) &&
      project.fieldPicId !== session.user.id
    ) {
      return { success: false, message: "Hanya PIC proyek yang dapat mengirim laporan harian." };
    }
    if (
      !values.workPointId &&
      values.progress !== undefined &&
      values.progress < project.progress
    ) {
      return {
        success: false,
        message: "Progres kumulatif tidak boleh lebih rendah dari progres proyek saat ini.",
      };
    }

    for (const photo of photos) {
      storedPhotos.push(await saveProjectProgressPhoto(photo));
    }

    await prisma.$transaction(async (transaction) => {
      const existingReport = await transaction.dailyReport.findUnique({
        where: {
          projectId_reportDate: {
            projectId,
            reportDate,
          },
        },
        select: {
          id: true,
          workPointId: true,
          dailyVolume: true,
          _count: { select: { progressPhotos: true } },
        },
      });
      if ((existingReport?._count.progressPhotos ?? 0) + photos.length > 5) {
        throw new Error("Laporan pada tanggal ini sudah memiliki 5 foto.");
      }

      let reportProgress = values.progress ?? project.progress;
      let dailyVolume: number | null = null;
      let workPointId: string | null = null;
      if (values.workPointId) {
        const workPoint = await transaction.projectWorkPoint.findFirst({
          where: { id: values.workPointId, projectId },
          select: {
            id: true,
            progress: true,
            completedVolume: true,
            proposedVolume: true,
          },
        });
        if (!workPoint) {
          throw new Error("ITEM_PEKERJAAN_TIDAK_DITEMUKAN");
        }
        if (
          existingReport?.workPointId &&
          existingReport.workPointId !== workPoint.id
        ) {
          throw new Error("LAPORAN_TANGGAL_TERKAIT_ITEM_LAIN");
        }
        if (!workPoint.proposedVolume) {
          throw new Error("TARGET_VOLUME_TIDAK_VALID");
        }
        if (values.dailyVolume === undefined) {
          throw new Error("VOLUME_HARIAN_TIDAK_VALID");
        }
        const targetVolume = decimalNumberFromScaledInteger(
          workPoint.proposedVolume,
        );
        const alreadyCompleted =
          workPoint.completedVolume ??
          (targetVolume * workPoint.progress) / 100;
        const previousSameDayVolume =
          existingReport?.workPointId === workPoint.id
            ? existingReport.dailyVolume ?? 0
            : 0;
        const completedBeforeToday = Math.max(
          0,
          alreadyCompleted - previousSameDayVolume,
        );
        const nextCompleted =
          completedBeforeToday + values.dailyVolume;
        if (nextCompleted > targetVolume + 0.000001) {
          throw new Error("VOLUME_MELEBIHI_TARGET");
        }
        dailyVolume = values.dailyVolume;
        workPointId = workPoint.id;
        reportProgress =
          Math.round((Math.min(nextCompleted, targetVolume) / targetVolume) * 1000) /
          10;
        await transaction.projectWorkPoint.update({
          where: { id: workPoint.id },
          data: {
            completedVolume: Math.min(nextCompleted, targetVolume),
            progress: reportProgress,
          },
        });
      } else {
        if (existingReport?.workPointId) {
          throw new Error("LAPORAN_TANGGAL_TERKAIT_ITEM_LAIN");
        }
        if (values.progress === undefined) {
          throw new Error("PROGRES_KUMULATIF_TIDAK_VALID");
        }
        const updatedProject = await transaction.project.updateMany({
          where: { id: projectId, progress: { lte: values.progress } },
          data: { progress: values.progress },
        });
        if (updatedProject.count !== 1) {
          throw new Error("PROGRESS_CANNOT_DECREASE");
        }
      }

      const report = await transaction.dailyReport.upsert({
        where: {
          projectId_reportDate: {
            projectId,
            reportDate,
          },
        },
        create: {
          projectId,
          reportDate,
          workPointId,
          dailyVolume,
          progress: reportProgress,
          workSummary: values.workSummary || null,
          weather: values.weather,
          workersCount: values.workersCount,
        },
        update: {
          workPointId,
          dailyVolume,
          progress: reportProgress,
          workSummary: values.workSummary || null,
          weather: values.weather,
          workersCount: values.workersCount,
        },
      });
      if (storedPhotos.length > 0) {
        await transaction.projectProgressPhoto.createMany({
          data: storedPhotos.map((photo) => ({
            dailyReportId: report.id,
            url: photo.url,
            fileUrl: photo.fileUrl,
            publicId: photo.publicId,
          })),
        });
      }
    });
    transactionCommitted = true;
    revalidatePath("/apps/project");
    revalidatePath("/apps/projects");
    revalidatePath("/apps/habits");
    return { success: true, message: "Progres proyek berhasil diperbarui." };
  } catch (error) {
    if (!transactionCommitted) {
      for (const photo of storedPhotos) {
        try {
          await removeProjectProgressPhoto(photo);
        } catch (cleanupError) {
          console.error(
            "Removing orphaned project progress photo failed:",
            cleanupError,
          );
        }
      }
    }
    if (
      error instanceof Error &&
      error.message === "Laporan pada tanggal ini sudah memiliki 5 foto."
    ) {
      return { success: false, message: error.message };
    }
    if (error instanceof Error && error.message === "VOLUME_MELEBIHI_TARGET") {
      return {
        success: false,
        message: "Volume hari ini melebihi sisa target pekerjaan.",
      };
    }
    if (
      error instanceof Error &&
      error.message === "LAPORAN_TANGGAL_TERKAIT_ITEM_LAIN"
    ) {
      return {
        success: false,
        message:
          "Laporan pada tanggal ini sudah terkait item pekerjaan lain. Gunakan item yang sama atau ubah tanggal laporan.",
      };
    }
    if (
      error instanceof Error &&
      error.message === "ITEM_PEKERJAAN_TIDAK_DITEMUKAN"
    ) {
      return { success: false, message: "Item pekerjaan tidak ditemukan di proyek ini." };
    }
    if (error instanceof Error && error.message === "TARGET_VOLUME_TIDAK_VALID") {
      return {
        success: false,
        message: "Item pekerjaan belum memiliki target volume dan satuan yang valid.",
      };
    }
    if (error instanceof Error && error.message === "VOLUME_HARIAN_TIDAK_VALID") {
      return {
        success: false,
        message: "Volume yang selesai hari ini wajib diisi.",
      };
    }
    if (
      error instanceof Error &&
      error.message === "PROGRES_KUMULATIF_TIDAK_VALID"
    ) {
      return {
        success: false,
        message: "Progres kumulatif proyek wajib diisi.",
      };
    }
    if (error instanceof Error && error.message === "PROGRESS_CANNOT_DECREASE") {
      return {
        success: false,
        message: "Progres kumulatif tidak boleh lebih rendah dari progres proyek saat ini.",
      };
    }
    if (error instanceof PrivatePhotoValidationError) {
      return { success: false, message: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { success: false, message: "Project tidak ditemukan." };
    }
    console.error("Updating project progress failed:", error);
    return {
      success: false,
      message: "Progres proyek gagal diperbarui. Silakan coba kembali.",
    };
  }
}

export async function getProjectFinancialBreakdown(
  projectId: string,
): Promise<ProjectFinancialBreakdown> {
  const session = await auth();
  if (!session?.user?.id) {
    return failure("Silakan masuk untuk melihat realisasi anggaran.");
  }

  if (session.user.role !== UserRole.DIRECTOR) {
    return failure("Role Anda tidak diizinkan melihat realisasi anggaran.");
  }

  if (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 100) {
    return failure("Project yang dipilih tidak valid.");
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true, pagu: true },
    });
    if (!project) {
      return failure("Project tidak ditemukan.");
    }

    const zero = new Prisma.Decimal(0);
    const paidRealization = (
      await getPaidProjectTicketRealization([projectId])
    ).get(projectId);
    const realized = paidRealization?.total ?? zero;
    const budget = decimalFromScaledInteger(project.pagu);
    const remaining = budget.minus(realized);
    const percentage = budget.greaterThan(0)
      ? realized.dividedBy(budget).times(100).toNumber()
      : realized.greaterThan(0)
        ? 100
        : 0;

    return {
      success: true,
      data: {
        projectTitle: project.title,
        budget: budget.toString(),
        realized: realized.toString(),
        remaining: remaining.toString(),
        percentage,
        categories: [
          {
            key: "MATERIAL",
            label: "Biaya Bahan/Material",
            amount: (paidRealization?.material ?? zero).toString(),
          },
          {
            key: "LABOR",
            label: "Biaya Upah Tukang",
            amount: (paidRealization?.labor ?? zero).toString(),
          },
          {
            key: "TRANSPORT",
            label: "Biaya Transportasi/Langsir",
            amount: (paidRealization?.transport ?? zero).toString(),
          },
          {
            key: "OPERATIONAL",
            label: "Operasional lainnya",
            amount: (paidRealization?.operational ?? zero).toString(),
          },
        ],
      },
    };
  } catch (error) {
    console.error("Project financial breakdown failed:", error);
    return failure("Realisasi anggaran gagal dimuat. Silakan coba kembali.");
  }
}


export type RabItemInput = {
  id?: string;
  section: string;
  code: string;
  title: string;
  volume: number;
  unit: string;
  unitPrice: number;
  rapPrice?: number;
  startDate?: string;
  endDate?: string;
};

export async function saveProjectRab(
  projectId: string,
  input: {
    items: RabItemInput[];
    replaceExisting?: boolean;
  },
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengubah RAB." };
  }
  if (!projectId) {
    return { success: false, message: "ID Proyek tidak valid." };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, isDeleted: true, fieldPicId: true },
  });
  if (!project || project.isDeleted) {
    return { success: false, message: "Proyek tidak ditemukan." };
  }

  try {
    const totalRab = input.items.reduce(
      (sum, item) => sum + item.volume * item.unitPrice,
      0,
    );
    const totalRap = input.items.reduce(
      (sum, item) => sum + item.volume * (item.rapPrice ?? item.unitPrice * 0.8),
      0,
    );

    const startDates = input.items
      .map((it) => it.startDate)
      .filter((d) => Boolean(d))
      .sort();
    const endDates = input.items
      .map((it) => it.endDate)
      .filter((d) => Boolean(d))
      .sort();

    await prisma.$transaction(async (tx) => {
      if (input.replaceExisting) {
        await tx.projectWorkPoint.deleteMany({
          where: {
            projectId,
            progressReports: { none: {} },
          },
        });
      }

      for (const item of input.items) {
        const fullTitle = item.code ? (item.code + " " + item.title).trim() : item.title.trim();
        const itemVol = item.volume > 0 ? item.volume : 1;
        const total = (item as any).totalPrice && (item as any).totalPrice > 0
          ? (item as any).totalPrice
          : itemVol * item.unitPrice;
        const proposedTotalWage = scaledIntegerFromDecimal(total);
        const proposedVolume = scaledIntegerFromDecimal(itemVol);
        const unitPriceVal = item.unitPrice > 0 ? item.unitPrice : Math.round(total / itemVol);
        const proposedUnitPrice = scaledIntegerFromDecimal(unitPriceVal);

        if (item.id) {
          const existing = await tx.projectWorkPoint.findUnique({
            where: { id: item.id },
            select: { id: true },
          });
          if (existing) {
            await tx.projectWorkPoint.update({
              where: { id: item.id },
              data: {
                title: fullTitle,
                location: item.section || "Umum",
                proposedVolume,
                proposedUnit: item.unit || "paket",
                proposedUnitPrice,
                proposedTotalWage,
                approvedTotalWage: proposedTotalWage,
                plannedStartDate: item.startDate ? new Date(item.startDate) : null,
                targetDate: item.endDate ? new Date(item.endDate) : null,
              },
            });
            continue;
          }
        }

        await tx.projectWorkPoint.create({
          data: {
            projectId,
            title: fullTitle,
            location: item.section || "Umum",
            proposedVolume,
            proposedUnit: item.unit || "paket",
            proposedUnitPrice,
            proposedTotalWage,
            approvedTotalWage: proposedTotalWage,
            plannedStartDate: item.startDate ? new Date(item.startDate) : null,
            targetDate: item.endDate ? new Date(item.endDate) : null,
            proposedById: session.user.id,
            wageApprovedById: session.user.id,
            wageApprovedAt: new Date(),
            progress: 0,
            completedVolume: 0,
          },
        });
      }

      const firstStartDate = startDates[0];
      const lastEndDate = endDates[endDates.length - 1];

      await tx.project.update({
        where: { id: projectId },
        data: {
          pagu: scaledIntegerFromDecimal(totalRab),
          budget: scaledIntegerFromDecimal(totalRap),
          ...(firstStartDate ? { startDate: new Date(firstStartDate) } : {}),
          ...(lastEndDate ? { endDate: new Date(lastEndDate) } : {}),
        },
      });
    });

    revalidatePath("/apps/projects/" + projectId);
    revalidatePath("/apps/projects");
    return {
      success: true,
      message: "RAB proyek berhasil disimpan. Total RAB: Rp " + totalRab.toLocaleString("id-ID"),
    };
  } catch (error) {
    console.error("Save project RAB failed:", error);
    return { success: false, message: "Gagal menyimpan RAB proyek." };
  }
}

export async function recordProjectOpname(
  projectId: string,
  input: {
    reportDate: string;
    isAdditional: boolean;
    items: Array<{
      workPointId: string;
      volume: number;
    }>;
  },
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mencatat progres opname." };
  }
  if (!projectId) {
    return { success: false, message: "ID Proyek tidak valid." };
  }

  try {
    const reportDate = new Date(input.reportDate);

    await prisma.$transaction(async (tx) => {
      const workPoints = await tx.projectWorkPoint.findMany({
        where: { projectId },
        select: {
          id: true,
          title: true,
          proposedVolume: true,
          proposedUnit: true,
          completedVolume: true,
          proposedTotalWage: true,
          progress: true,
        },
      });

      const wpMap = new Map(workPoints.map((wp) => [wp.id, wp]));

      for (const opnameItem of input.items) {
        const wp = wpMap.get(opnameItem.workPointId);
        if (!wp) continue;

        const targetVol = wp.proposedVolume ? Number(wp.proposedVolume) / 100 : 1;
        const currentCompleted = wp.completedVolume ?? 0;
        const newCompleted = input.isAdditional
          ? currentCompleted + opnameItem.volume
          : opnameItem.volume;

        const progressPercent =
          targetVol > 0
            ? Math.min(100, Math.round((newCompleted / targetVol) * 1000) / 10)
            : 100;

        await tx.projectWorkPoint.update({
          where: { id: wp.id },
          data: {
            completedVolume: Math.max(0, newCompleted),
            progress: progressPercent,
          },
        });

        await tx.projectWorkPointProgress.create({
          data: {
            workPointId: wp.id,
            reportDate,
            progress: progressPercent,
            workSummary: "Opname terpasang: " + newCompleted + " " + (wp.proposedUnit || ""),
          },
        });
      }

      const updatedPoints = await tx.projectWorkPoint.findMany({
        where: { projectId },
        select: { progress: true, proposedTotalWage: true },
      });

      const totalWage = updatedPoints.reduce(
        (acc, p) => acc + Number(p.proposedTotalWage),
        0,
      );

      let overallProgress = 0;
      if (totalWage > 0) {
        overallProgress =
          updatedPoints.reduce(
            (acc, p) => acc + p.progress * (Number(p.proposedTotalWage) / totalWage),
            0,
          );
      } else if (updatedPoints.length > 0) {
        overallProgress =
          updatedPoints.reduce((acc, p) => acc + p.progress, 0) /
          updatedPoints.length;
      }

      await tx.project.update({
        where: { id: projectId },
        data: {
          progress: Math.round(overallProgress * 10) / 10,
        },
      });
    });

    revalidatePath("/apps/projects/" + projectId);
    revalidatePath("/apps/projects");
    return { success: true, message: "Progres opname berhasil disimpan." };
  } catch (error) {
    console.error("Record project opname failed:", error);
    return { success: false, message: "Gagal mencatat progres opname." };
  }
}

export async function saveProjectScheduleTask(
  projectId: string,
  input: {
    id?: string;
    title: string;
    location: string;
    plannedStartDate?: string;
    targetDate?: string;
    progress?: number;
    kendala?: boolean;
    perluDicek?: boolean;
    notes?: string;
  },
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengelola jadwal task." };
  }
  if (!projectId) {
    return { success: false, message: "ID Proyek tidak valid." };
  }

  try {
    const startDate = input.plannedStartDate ? new Date(input.plannedStartDate) : null;
    const endDate = input.targetDate ? new Date(input.targetDate) : null;
    const progressVal = typeof input.progress === "number" ? Math.max(0, Math.min(100, input.progress)) : 0;

    if (input.id) {
      await prisma.projectWorkPoint.update({
        where: { id: input.id },
        data: {
          title: input.title,
          location: input.location,
          plannedStartDate: startDate,
          targetDate: endDate,
          progress: progressVal,
        },
      });
    } else {
      await prisma.projectWorkPoint.create({
        data: {
          projectId,
          title: input.title,
          location: input.location || "A. Persiapan",
          plannedStartDate: startDate,
          targetDate: endDate,
          progress: progressVal,
          proposedVolume: BigInt(100),
          proposedUnit: "paket",
          proposedUnitPrice: BigInt(0),
          proposedTotalWage: BigInt(0),
          proposedById: session.user.id,
        },
      });
    }

    revalidatePath("/apps/projects/schedule");
    revalidatePath(`/apps/projects/${projectId}`);
    return { success: true, message: "Task jadwal berhasil disimpan." };
  } catch (error) {
    console.error("Save schedule task error:", error);
    return { success: false, message: "Gagal menyimpan task jadwal." };
  }
}

export async function deleteProjectScheduleTask(
  workPointId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menghapus task." };
  }

  try {
    const wp = await prisma.projectWorkPoint.findUnique({
      where: { id: workPointId },
      select: { id: true, projectId: true },
    });
    if (!wp) {
      return { success: false, message: "Task tidak ditemukan." };
    }

    await prisma.projectWorkPoint.delete({
      where: { id: workPointId },
    });

    revalidatePath("/apps/projects/schedule");
    revalidatePath(`/apps/projects/${wp.projectId}`);
    return { success: true, message: "Task berhasil dihapus." };
  } catch (error) {
    console.error("Delete schedule task error:", error);
    return { success: false, message: "Gagal menghapus task." };
  }
}

export async function saveProjectMilestone(
  projectId: string,
  title: string,
  dateStr: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menambah milestone." };
  }
  if (!projectId || !title.trim() || !dateStr) {
    return { success: false, message: "Data milestone tidak lengkap." };
  }

  try {
    const id = `ms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startsAt = new Date(dateStr);

    await prisma.calendarEvent.create({
      data: {
        id,
        title: title.trim(),
        description: "MILESTONE",
        type: "DEADLINE",
        startsAt,
        projectId,
        createdById: session.user.id,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/apps/projects/schedule");
    return { success: true, message: "Milestone berhasil ditambahkan." };
  } catch (error) {
    console.error("Save milestone error:", error);
    return { success: false, message: "Gagal menyimpan milestone." };
  }
}

export async function uploadProjectDocument(
  projectId: string,
  input: {
    title: string;
    category: string;
    fileUrl?: string;
    notes?: string;
  },
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengunggah dokumen." };
  }
  if (!projectId || !input.title.trim()) {
    return { success: false, message: "Data dokumen tidak lengkap." };
  }

  try {
    const drawingCode = `DOC-${Date.now().toString().slice(-6)}`;
    await prisma.drawingDocument.create({
      data: {
        projectId,
        title: input.title.trim(),
        category: input.category || "Kontrak",
        fileUrl: input.fileUrl || "/documents/sample.pdf",
        uploadedById: session.user.id,
        drawingCode,
      },
    });

    revalidatePath(`/apps/projects/${projectId}`);
    return { success: true, message: "Dokumen berhasil disimpan." };
  } catch (error) {
    console.error("Upload project document error:", error);
    return { success: false, message: "Gagal menyimpan dokumen." };
  }
}

export async function updateProjectCoreTeam(
  projectId: string,
  fieldPicId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengubah tim proyek." };
  }
  if (!projectId) {
    return { success: false, message: "ID Proyek tidak valid." };
  }

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        fieldPicId: fieldPicId || null,
      },
    });

    revalidatePath(`/apps/projects/${projectId}`);
    return { success: true, message: "Tim inti proyek berhasil diperbarui." };
  } catch (error) {
    console.error("Update core team error:", error);
    return { success: false, message: "Gagal memperbarui tim proyek." };
  }
}

export async function applyRabAsContract(
  projectId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk terlebih dahulu." };
  }
  if (!projectId) {
    return { success: false, message: "ID Proyek tidak valid." };
  }

  try {
    const points = await prisma.projectWorkPoint.findMany({
      where: { projectId },
      select: { proposedTotalWage: true },
    });
    const totalWage = points.reduce((sum, p) => sum + p.proposedTotalWage, BigInt(0));

    await prisma.project.update({
      where: { id: projectId },
      data: { pagu: totalWage },
    });

    revalidatePath(`/apps/projects/${projectId}`);
    return { success: true, message: "Total RAB berhasil dipakai sebagai nilai kontrak." };
  } catch (error) {
    console.error("Apply RAB as contract error:", error);
    return { success: false, message: "Gagal memperbarui nilai kontrak." };
  }
}

export async function applyRapAsBudget(
  projectId: string,
  rapAmount: number,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk terlebih dahulu." };
  }
  if (!projectId) {
    return { success: false, message: "ID Proyek tidak valid." };
  }

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { budget: BigInt(Math.round(rapAmount * 100)) },
    });

    revalidatePath(`/apps/projects/${projectId}`);
    return { success: true, message: "Nilai RAP berhasil dipakai sebagai RAP/Budget proyek." };
  } catch (error) {
    console.error("Apply RAP as budget error:", error);
    return { success: false, message: "Gagal menyimpan RAP sebagai budget." };
  }
}

export async function deleteProjectMilestone(
  milestoneId: string,
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk menghapus milestone." };
  }

  try {
    await prisma.calendarEvent.delete({
      where: { id: milestoneId },
    });

    revalidatePath("/apps/projects/schedule");
    return { success: true, message: "Milestone berhasil dihapus." };
  } catch (error) {
    console.error("Delete milestone error:", error);
    return { success: false, message: "Gagal menghapus milestone." };
  }
}

export async function importDrtRabProject(input: {
  fileBase64: string;
  fileName: string;
  targetProjectId?: string;
}): Promise<ProjectMutationResult & { projectId?: string; summary?: any }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengimpor RAB." };
  }

  try {
    const buffer = Buffer.from(input.fileBase64, "base64");
    const parsed = await parseDrtRabWorkbook(buffer);

    if (!parsed.success || parsed.workItems.length === 0) {
      return {
        success: false,
        message: parsed.message || "Gagal membaca item RAB dari file Excel.",
      };
    }

    let projectId = input.targetProjectId;

    if (projectId) {
      // Update existing project with parsed RAB items
      const existing = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, pagu: true, kelompokTani: true },
      });

      if (!existing) {
        return { success: false, message: "Proyek target tidak ditemukan." };
      }

      await prisma.project.update({
        where: { id: projectId },
        data: {
          pagu: scaledIntegerFromDecimal(parsed.metadata.totalBudget),
          ...(parsed.metadata.poktanName && !existing.kelompokTani
            ? { kelompokTani: parsed.metadata.poktanName }
            : {}),
          ...(parsed.metadata.landAreaHa > 0
            ? { landArea: scaledIntegerFromDecimal(parsed.metadata.landAreaHa) }
            : {}),
          ...(parsed.metadata.totalBudget > 0
            ? { pagu: scaledIntegerFromDecimal(parsed.metadata.totalBudget) }
            : {}),
        },
      });

      // Save work items
      await saveProjectRab(projectId, {
        items: parsed.workItems,
        replaceExisting: true,
      });

      revalidatePath(`/apps/projects/${projectId}`);
      revalidatePath("/apps/projects");
      return {
        success: true,
        message: `RAB berhasil diimpor: ${parsed.workItems.length} item pekerjaan diterapkan (Total: Rp ${parsed.metadata.totalBudget.toLocaleString("id-ID")}).`,
        projectId,
        summary: parsed.metadata,
      };
    } else {
      // Automatically create new Project in database
      const newProjectId = `prj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      let uniqueCode = parsed.metadata.code;

      const codeExists = await prisma.project.findUnique({
        where: { code: uniqueCode },
        select: { id: true },
      });
      if (codeExists) {
        uniqueCode = `PRJ-${parsed.metadata.year || "2026"}-${Math.floor(100 + Math.random() * 900)}`;
      }

      const created = await prisma.project.create({
        data: {
          id: newProjectId,
          code: uniqueCode,
          title: parsed.metadata.title,
          name: parsed.metadata.title,
          kelompokTani: parsed.metadata.poktanName || "Poktan Bintang Kejora",
          address: parsed.metadata.address || "Aceh Tengah",
          location: parsed.metadata.address || "Aceh Tengah",
          jenisPekerjaan: parsed.metadata.activityName || "DRT/SID Rehabilitasi Lahan Sawah",
          landArea: parsed.metadata.landAreaHa > 0 ? scaledIntegerFromDecimal(parsed.metadata.landAreaHa) : null,
          pagu: scaledIntegerFromDecimal(parsed.metadata.totalBudget),
          budget: null, // "kecuali harga RAP"
          priority: ProjectPriority.MEDIUM,
          status: ProjectStatus.RUNNING,
          progress: 0,
        },
      });

      projectId = created.id;

      // Save work items
      await saveProjectRab(projectId, {
        items: parsed.workItems,
        replaceExisting: false,
      });

      revalidatePath("/apps/projects");
      return {
        success: true,
        message: `Proyek '${parsed.metadata.title}' berhasil dibuat dari Excel RAB dengan ${parsed.workItems.length} item pekerjaan!`,
        projectId,
        summary: parsed.metadata,
      };
    }
  } catch (err: any) {
    console.error("importDrtRabProject error:", err);
    return {
      success: false,
      message: `Gagal memproses file Excel: ${err?.message || "Format tidak valid"}`,
    };
  }
}

export async function parseDrtRabFileAction(input: {
  fileBase64: string;
  fileName: string;
}) {
  try {
    const buffer = Buffer.from(input.fileBase64, "base64");
    return await parseDrtRabWorkbook(buffer);
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Gagal memproses file Excel",
      metadata: {
        code: "",
        title: "",
        poktanName: "",
        desa: "",
        kecamatan: "",
        kabupaten: "",
        provinsi: "",
        address: "",
        activityName: "",
        satuanKerja: "",
        year: "",
        landAreaHa: 0,
        totalBudget: 0,
      },
      workItems: [],
      materials: [],
      laborRates: [],
      divisions: [],
    };
  }
}

export async function updateProjectKanbanStatus(
  projectId: string,
  targetColumnKey: "tender" | "perencanaan" | "berjalan" | "hampir_selesai" | "selesai" | "ditunda",
): Promise<ProjectMutationResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, message: "Silakan masuk untuk mengubah status proyek." };
  }

  try {
    const existing = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, progress: true },
    });

    if (!existing) {
      return { success: false, message: "Proyek tidak ditemukan." };
    }

    let nextStatus: ProjectStatus = existing.status;
    let nextProgress = existing.progress;

    switch (targetColumnKey) {
      case "tender":
        nextStatus = ProjectStatus.PENDING_SETUP;
        break;
      case "perencanaan":
        nextStatus = ProjectStatus.PENDING;
        break;
      case "berjalan":
        nextStatus = ProjectStatus.RUNNING;
        if (nextProgress >= 85) nextProgress = 50;
        break;
      case "hampir_selesai":
        nextStatus = ProjectStatus.RUNNING;
        if (nextProgress < 85 || nextProgress >= 100) nextProgress = 90;
        break;
      case "selesai":
        nextStatus = ProjectStatus.DONE;
        nextProgress = 100;
        break;
      case "ditunda":
        nextStatus = ProjectStatus.TERHAMBAT;
        break;
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: nextStatus,
        progress: nextProgress,
      },
    });

    revalidatePath("/apps/projects");
    return { success: true, message: "Status proyek berhasil diperbarui." };
  } catch (err: any) {
    console.error("updateProjectKanbanStatus error:", err);
    return { success: false, message: err?.message || "Gagal memperbarui status proyek." };
  }
}
