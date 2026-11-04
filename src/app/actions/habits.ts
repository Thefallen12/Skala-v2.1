"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { HabitFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getWeekDateKeys,
  isValidDateKey,
  shiftDateKey,
} from "@/lib/habit-date";
import { auth } from "../../../auth";

export type HabitActionResult = {
  success: boolean;
  message: string;
};

async function getHabitOwner() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isActive: true },
  });
  return user?.isActive ? user : null;
}

function isHabitFrequency(value: string): value is HabitFrequency {
  return Object.values(HabitFrequency).some((frequency) => frequency === value);
}

export async function getHabitCompletions(dateKey: string): Promise<{
  success: boolean;
  completions: { habitId: string; date: string }[];
  message?: string;
}> {
  const owner = await getHabitOwner();
  if (!owner) {
    return {
      success: false,
      completions: [],
      message: "Sesi pengguna tidak valid.",
    };
  }
  if (typeof dateKey !== "string" || !isValidDateKey(dateKey)) {
    return {
      success: false,
      completions: [],
      message: "Tanggal yang dipilih tidak valid.",
    };
  }

  try {
    const weekDates = getWeekDateKeys(dateKey);
    const completions = await prisma.habitCompletion.findMany({
      where: {
        habit: { userId: owner.id },
        date: {
          gte: new Date(`${shiftDateKey(weekDates[0], -30)}T00:00:00.000Z`),
          lte: new Date(`${weekDates[6]}T00:00:00.000Z`),
        },
      },
      select: { habitId: true, date: true },
    });
    return {
      success: true,
      completions: completions.map((completion) => ({
        habitId: completion.habitId,
        date: completion.date.toISOString().slice(0, 10),
      })),
    };
  } catch (error) {
    console.error("Habit completion query failed:", error);
    return {
      success: false,
      completions: [],
      message: "Data progres kebiasaan gagal dimuat.",
    };
  }
}

export async function createHabit(input: {
  title: string;
  description: string;
  frequency: string;
}): Promise<HabitActionResult> {
  const owner = await getHabitOwner();
  if (!owner) {
    return { success: false, message: "Sesi pengguna tidak valid." };
  }
  if (
    !input ||
    typeof input.title !== "string" ||
    typeof input.description !== "string" ||
    typeof input.frequency !== "string"
  ) {
    return { success: false, message: "Data kebiasaan tidak valid." };
  }

  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 2 || title.length > 120 || description.length > 500) {
    return {
      success: false,
      message: "Judul harus 2–120 karakter dan catatan maksimal 500 karakter.",
    };
  }
  if (!isHabitFrequency(input.frequency)) {
    return { success: false, message: "Jadwal kebiasaan tidak valid." };
  }

  try {
    await prisma.habit.create({
      data: {
        id: randomUUID(),
        userId: owner.id,
        title,
        description: description || null,
        frequency: input.frequency,
      },
    });
  } catch (error) {
    console.error("Habit creation failed:", error);
    return { success: false, message: "Kebiasaan gagal ditambahkan." };
  }

  revalidatePath("/apps/habits");
  return { success: true, message: "Kebiasaan berhasil ditambahkan." };
}

export async function toggleHabitCompletion(
  habitId: string,
  dateKey: string,
): Promise<{ success: boolean; completed?: boolean; message: string }> {
  const owner = await getHabitOwner();
  if (!owner) {
    return { success: false, message: "Sesi pengguna tidak valid." };
  }
  if (
    typeof habitId !== "string" ||
    !habitId ||
    typeof dateKey !== "string" ||
    !isValidDateKey(dateKey)
  ) {
    return { success: false, message: "Data penyelesaian kebiasaan tidak valid." };
  }

  try {
    const habit = await prisma.habit.findFirst({
      where: { id: habitId, userId: owner.id },
      select: { id: true },
    });
    if (!habit) {
      return { success: false, message: "Kebiasaan tidak ditemukan." };
    }

    const date = new Date(`${dateKey}T00:00:00.000Z`);
    const existing = await prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
      select: { id: true },
    });
    if (existing) {
      await prisma.habitCompletion.delete({ where: { id: existing.id } });
      revalidatePath("/apps/habits");
      return {
        success: true,
        completed: false,
        message: "Tanda selesai dibatalkan.",
      };
    }

    await prisma.habitCompletion.create({
      data: { id: randomUUID(), habitId, date },
    });
    revalidatePath("/apps/habits");
    return {
      success: true,
      completed: true,
      message: "Kebiasaan ditandai selesai.",
    };
  } catch (error) {
    console.error("Habit completion update failed:", error);
    return { success: false, message: "Status kebiasaan gagal diperbarui." };
  }
}

export async function deleteHabit(habitId: string): Promise<HabitActionResult> {
  const owner = await getHabitOwner();
  if (!owner) {
    return { success: false, message: "Sesi pengguna tidak valid." };
  }
  if (typeof habitId !== "string" || !habitId) {
    return { success: false, message: "Kebiasaan tidak valid." };
  }

  try {
    const result = await prisma.habit.deleteMany({
      where: { id: habitId, userId: owner.id },
    });
    if (result.count === 0) {
      return { success: false, message: "Kebiasaan tidak ditemukan." };
    }
  } catch (error) {
    console.error("Habit deletion failed:", error);
    return { success: false, message: "Kebiasaan gagal dihapus." };
  }

  revalidatePath("/apps/habits");
  return { success: true, message: "Kebiasaan berhasil dihapus." };
}
