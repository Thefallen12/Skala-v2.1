"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  CalendarEventFormat,
  CalendarEventType,
  WorkTaskStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { isValidDateKey } from "@/lib/habit-date";
import { isHabitTaskColor } from "@/lib/habit-task-colors";
import { auth } from "../../../auth";
import { acquireMongoTransactionLock } from "@/lib/mongo-transaction-lock";

export type WorkspaceActionResult = {
  success: boolean;
  message: string;
};

async function getActiveUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findFirst({
    where: { id: session.user.id, isActive: true },
    select: { id: true },
  });
}

function parseDateTime(value: string): Date | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value);
}

function revalidateHabitWorkspace() {
  revalidatePath("/apps/habits");
}

export async function createWorkspaceTask(input: {
  title: string;
  description: string;
  projectId: string;
  assigneeId: string;
  memberIds: string[];
  startsAt: string;
  endsAt: string;
  color: string;
}): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (
    !input ||
    typeof input.title !== "string" ||
    typeof input.description !== "string" ||
    typeof input.projectId !== "string" ||
    typeof input.assigneeId !== "string" ||
    !Array.isArray(input.memberIds) ||
    input.memberIds.some((id) => typeof id !== "string") ||
    typeof input.startsAt !== "string" ||
    typeof input.endsAt !== "string" ||
    !isHabitTaskColor(input.color)
  ) {
    return { success: false, message: "Data tugas tidak valid." };
  }
  const requestedMemberIds = [...new Set(input.memberIds)];
  const memberIds = [...new Set([...requestedMemberIds, input.assigneeId].filter(Boolean))];
  if (memberIds.length > 20) {
    return {
      success: false,
      message: "Satu tugas maksimal dapat memiliki 20 anggota.",
    };
  }

  const title = input.title.trim();
  const description = input.description.trim();
  const startsAt = parseDateTime(input.startsAt);
  const endsAt = parseDateTime(input.endsAt);
  if (
    title.length < 2 ||
    title.length > 160 ||
    description.length > 1000 ||
    !input.projectId ||
    !startsAt ||
    !endsAt ||
    endsAt <= startsAt
  ) {
    return {
      success: false,
      message: "Periksa judul, proyek, dan rentang jadwal tugas.",
    };
  }

  try {
    const [project, assignee, members] = await Promise.all([
      prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true },
      }),
      input.assigneeId
        ? prisma.user.findFirst({
            where: { id: input.assigneeId, isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
      memberIds.length
          ? prisma.user.findMany({
              where: { id: { in: memberIds }, isActive: true },
              select: { id: true },
            })
          : Promise.resolve([]),
    ]);
    if (
      !project ||
      (input.assigneeId && !assignee) ||
      members.length !== memberIds.length
    ) {
      return {
        success: false,
        message: "Proyek atau anggota yang dipilih tidak tersedia.",
      };
    }
    await prisma.workTask.create({
      data: {
        id: randomUUID(),
        title,
        description: description || null,
        projectId: project.id,
        creatorId: user.id,
        assigneeId: assignee?.id ?? null,
        members: {
          create: memberIds.map((userId) => ({
            user: { connect: { id: userId } },
          })),
        },
        startsAt,
        endsAt,
        color: input.color,
      },
    });
  } catch (error) {
    console.error("Workspace task creation failed:", error);
    return { success: false, message: "Tugas gagal disimpan." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Tugas berhasil ditambahkan." };
}

export async function updateWorkspaceTaskColor(
  taskId: string,
  color: string,
): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (typeof taskId !== "string" || !taskId || !isHabitTaskColor(color)) {
    return { success: false, message: "Warna bar tugas tidak valid." };
  }

  try {
    const result = await prisma.workTask.updateMany({
      where: {
        id: taskId,
        OR: [
          { creatorId: user.id },
          { assigneeId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      data: { color },
    });
    if (!result.count) {
      return {
        success: false,
        message: "Tugas tidak ditemukan atau Anda tidak berhak mengubah warnanya.",
      };
    }
  } catch (error) {
    console.error("Workspace task color update failed:", error);
    return { success: false, message: "Warna bar tugas gagal diperbarui." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Warna bar tugas diperbarui." };
}

export async function updateWorkspaceTaskStatus(
  taskId: string,
  status: string,
): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (
    typeof taskId !== "string" ||
    !taskId ||
    !Object.values(WorkTaskStatus).some((validStatus) => validStatus === status)
  ) {
    return { success: false, message: "Status tugas tidak valid." };
  }
  const taskStatus = Object.values(WorkTaskStatus).find(
    (validStatus) => validStatus === status,
  );
  if (!taskStatus) {
    return { success: false, message: "Status tugas tidak valid." };
  }

  try {
    const result = await prisma.workTask.updateMany({
      where: {
        id: taskId,
        OR: [
          { creatorId: user.id },
          { assigneeId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      data: { status: taskStatus },
    });
    if (result.count === 0) {
      return {
        success: false,
        message: "Tugas tidak ditemukan atau Anda tidak berhak mengubahnya.",
      };
    }
  } catch (error) {
    console.error("Workspace task status update failed:", error);
    return { success: false, message: "Status tugas gagal diperbarui." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Status tugas diperbarui." };
}

export async function updateWorkspaceTaskSchedule(input: {
  taskId: string;
  startsAt: string;
  endsAt: string;
}): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (
    !input ||
    typeof input.taskId !== "string" ||
    !input.taskId ||
    typeof input.startsAt !== "string" ||
    typeof input.endsAt !== "string"
  ) {
    return { success: false, message: "Jadwal tugas tidak valid." };
  }
  const startsAt = parseDateTime(input.startsAt);
  const endsAt = parseDateTime(input.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return { success: false, message: "Tanggal dan waktu tugas tidak valid." };
  }

  try {
    const result = await prisma.workTask.updateMany({
      where: {
        id: input.taskId,
        OR: [
          { creatorId: user.id },
          { assigneeId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      data: { startsAt, endsAt },
    });
    if (!result.count) {
      return {
        success: false,
        message: "Tugas tidak ditemukan atau Anda tidak berhak mengubah jadwalnya.",
      };
    }
  } catch (error) {
    console.error("Workspace task schedule update failed:", error);
    return { success: false, message: "Jadwal tugas gagal diperbarui." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Jadwal tugas berhasil diperbarui." };
}

export async function deleteWorkspaceTask(
  taskId: string,
): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (typeof taskId !== "string" || !taskId) {
    return { success: false, message: "Tugas tidak valid." };
  }

  try {
    const result = await prisma.workTask.deleteMany({
      where: {
        id: taskId,
        OR: [
          { creatorId: user.id },
          { assigneeId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
    });
    if (!result.count) {
      return {
        success: false,
        message: "Tugas tidak ditemukan atau Anda tidak berhak menghapusnya.",
      };
    }
  } catch (error) {
    console.error("Workspace task deletion failed:", error);
    return { success: false, message: "Tugas gagal dihapus." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Tugas berhasil dihapus." };
}

export async function createWorkspaceEvent(input: {
  title: string;
  description: string;
  type: string;
  format: string;
  allDay: boolean;
  projectId: string;
  meetingUrl: string;
  location: string;
  reminderMinutes: number | null;
  participantIds: string[];
  startsAt: string;
  endsAt: string;
}): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (
    !input ||
    typeof input.title !== "string" ||
    typeof input.description !== "string" ||
    typeof input.type !== "string" ||
    typeof input.format !== "string" ||
    typeof input.allDay !== "boolean" ||
    typeof input.projectId !== "string" ||
    typeof input.meetingUrl !== "string" ||
    typeof input.location !== "string" ||
    (input.reminderMinutes !== null && typeof input.reminderMinutes !== "number") ||
    !Array.isArray(input.participantIds) ||
    input.participantIds.some((id) => typeof id !== "string") ||
    typeof input.startsAt !== "string" ||
    typeof input.endsAt !== "string"
  ) {
    return { success: false, message: "Data agenda tidak valid." };
  }

  const title = input.title.trim();
  const description = input.description.trim();
  const meetingUrl = input.meetingUrl.trim();
  const location = input.location.trim();
  const startsAt = parseDateTime(input.startsAt);
  const endsAt = input.endsAt ? parseDateTime(input.endsAt) : null;
  const participantIds = [...new Set(input.participantIds)];
  if (participantIds.length > 50) {
    return { success: false, message: "Rapat maksimal dapat memiliki 50 peserta." };
  }
  const eventType = Object.values(CalendarEventType).find(
    (validType) => validType === input.type,
  );
  const eventFormat = Object.values(CalendarEventFormat).find(
    (validFormat) => validFormat === input.format,
  );
  let normalizedMeetingUrl: string | null = null;
  if (meetingUrl) {
    try {
      const parsedMeetingUrl = new URL(meetingUrl);
      if (!["https:", "http:"].includes(parsedMeetingUrl.protocol)) {
        throw new Error("Unsupported meeting URL protocol");
      }
      normalizedMeetingUrl = parsedMeetingUrl.toString();
    } catch {
      return {
        success: false,
        message: "Tautan rapat harus berupa URL HTTP atau HTTPS yang valid.",
      };
    }
  }
  if (
    title.length < 2 ||
    title.length > 160 ||
    description.length > 1000 ||
    meetingUrl.length > 500 ||
    location.length > 300 ||
    (input.reminderMinutes !== null &&
      ![5, 10, 15, 30, 60].includes(input.reminderMinutes)) ||
    !startsAt ||
    (input.endsAt && !endsAt) ||
    (endsAt && endsAt <= startsAt) ||
    !eventType ||
    !eventFormat
  ) {
    return { success: false, message: "Periksa judul, kategori, dan waktu agenda." };
  }

  try {
    if (input.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true },
      });
      if (!project) {
        return { success: false, message: "Proyek yang dipilih tidak ditemukan." };
      }
    }
    const participants = participantIds.length
      ? await prisma.user.findMany({
          where: { id: { in: participantIds }, isActive: true },
          select: { id: true },
        })
      : [];
    if (participants.length !== participantIds.length) {
      return {
        success: false,
        message: "Satu atau lebih peserta tidak tersedia.",
      };
    }
    await prisma.calendarEvent.create({
      data: {
        id: randomUUID(),
        title,
        description: description || null,
        type: eventType,
        projectId: input.projectId || null,
        meetingUrl: normalizedMeetingUrl,
        location: location || null,
        format: eventFormat,
        allDay: input.allDay,
        reminderMinutes: input.reminderMinutes,
        participants: {
          create: participantIds.map((userId) => ({
            user: { connect: { id: userId } },
          })),
        },
        startsAt,
        endsAt,
        createdById: user.id,
        updatedAt: new Date(),
        ...(input.reminderMinutes !== null
          ? {
              reminders: {
                create: { userId: user.id },
              },
            }
          : {}),
      },
    });
  } catch (error) {
    console.error("Workspace event creation failed:", error);
    return { success: false, message: "Agenda gagal disimpan." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Agenda berhasil ditambahkan." };
}

export async function toggleWorkspaceEventReminder(
  eventId: string,
  enabled: boolean,
): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (typeof eventId !== "string" || !eventId || typeof enabled !== "boolean") {
    return { success: false, message: "Pengingat tidak valid." };
  }

  try {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      select: { id: true, startsAt: true, participants: { select: { userId: true } } },
    });
    if (!event) {
      return { success: false, message: "Rapat tidak ditemukan." };
    }
    if (enabled && event.startsAt <= new Date()) {
      return { success: false, message: "Pengingat hanya dapat dipasang untuk rapat mendatang." };
    }
    if (
      !event.participants.some((participant) => participant.userId === user.id) &&
      !(await prisma.calendarEvent.findFirst({
        where: { id: eventId, createdById: user.id },
        select: { id: true },
      }))
    ) {
      return {
        success: false,
        message: "Hanya penyelenggara atau peserta rapat yang dapat mengatur pengingat.",
      };
    }
    if (enabled) {
      await prisma.calendarEventReminder.upsert({
        where: { eventId_userId: { eventId, userId: user.id } },
        create: { eventId, userId: user.id },
        update: {},
      });
    } else {
      await prisma.calendarEventReminder.deleteMany({
        where: { eventId, userId: user.id },
      });
    }
  } catch (error) {
    console.error("Workspace event reminder update failed:", error);
    return { success: false, message: "Pengingat gagal diperbarui." };
  }

  revalidateHabitWorkspace();
  return {
    success: true,
    message: enabled ? "Pengingat rapat disimpan." : "Pengingat rapat dimatikan.",
  };
}

export async function deleteWorkspaceEvent(
  eventId: string,
): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (typeof eventId !== "string" || !eventId) {
    return { success: false, message: "Agenda tidak valid." };
  }

  try {
    const result = await prisma.calendarEvent.deleteMany({
      where: { id: eventId, createdById: user.id },
    });
    if (!result.count) {
      return {
        success: false,
        message: "Agenda tidak ditemukan atau hanya pembuat yang dapat menghapusnya.",
      };
    }
  } catch (error) {
    console.error("Workspace event deletion failed:", error);
    return { success: false, message: "Agenda gagal dihapus." };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Agenda berhasil dihapus." };
}

export async function createTimesheetEntry(input: {
  projectId: string;
  date: string;
  durationMinutes: number;
  note: string;
}): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (
    !input ||
    typeof input.projectId !== "string" ||
    typeof input.date !== "string" ||
    !input.projectId ||
    !isValidDateKey(input.date) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 1 ||
    input.durationMinutes > 1440 ||
    typeof input.note !== "string" ||
    input.note.trim().length > 500
  ) {
    return { success: false, message: "Periksa tanggal, proyek, durasi, dan catatan." };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) {
      return { success: false, message: "Proyek yang dipilih tidak ditemukan." };
    }
    const workDate = new Date(`${input.date}T00:00:00.000Z`);
    await prisma.$transaction(async (transaction) => {
      await acquireMongoTransactionLock(
        transaction,
        `timesheet-${user.id}-${input.date}`,
      );
      const dailyTotal = await transaction.timesheetEntry.aggregate({
        where: { userId: user.id, workDate },
        _sum: { durationMinutes: true },
      });
      if ((dailyTotal._sum.durationMinutes ?? 0) + input.durationMinutes > 1440) {
        throw new Error("Total jam kerja pada satu tanggal tidak boleh melebihi 24 jam.");
      }
      await transaction.timesheetEntry.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          projectId: project.id,
          workDate,
          durationMinutes: input.durationMinutes,
          note: input.note.trim() || null,
        },
      });
    });
  } catch (error) {
    console.error("Timesheet entry creation failed:", error);
    return {
      success: false,
      message:
        error instanceof Error &&
        error.message === "Total jam kerja pada satu tanggal tidak boleh melebihi 24 jam."
          ? error.message
          : "Jam kerja gagal disimpan.",
    };
  }

  revalidateHabitWorkspace();
  return { success: true, message: "Jam kerja berhasil dicatat." };
}

export async function deleteTimesheetEntry(
  entryId: string,
): Promise<WorkspaceActionResult> {
  const user = await getActiveUser();
  if (!user) return { success: false, message: "Sesi pengguna tidak valid." };
  if (typeof entryId !== "string" || !entryId) {
    return { success: false, message: "Catatan jam kerja tidak valid." };
  }

  try {
    const result = await prisma.timesheetEntry.deleteMany({
      where: { id: entryId, userId: user.id },
    });
    if (!result.count) {
      return {
        success: false,
        message: "Catatan tidak ditemukan atau bukan milik Anda.",
      };
    }
  } catch (error) {
    console.error("Timesheet entry deletion failed:", error);
    return { success: false, message: "Catatan jam kerja gagal dihapus." };
  }

  revalidatePath("/apps/habits");
  return { success: true, message: "Catatan jam kerja dihapus." };
}
