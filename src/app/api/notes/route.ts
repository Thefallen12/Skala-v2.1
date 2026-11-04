import { z } from "zod";
import { auth } from "../../../../auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const noteColorSchema = z.enum([
  "primary",
  "error",
  "warning",
  "success",
  "secondary",
]);

const noteContentSchema = z.object({
  title: z.string().trim().min(1).max(1000),
  color: noteColorSchema,
});

async function getOwnerId() {
  const session = await auth();
  return session?.user?.id ?? null;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { msg: "Silakan masuk terlebih dahulu." },
    { status: 401 },
  );
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function toNoteResponse(note: {
  id: string;
  title: string;
  color: string;
  createdAt: Date;
}) {
  return {
    id: note.id,
    title: note.title,
    color: note.color,
    datef: note.createdAt.toISOString(),
    deleted: false,
  };
}

export async function GET() {
  const userId = await getOwnerId();
  if (!userId) return unauthorizedResponse();

  try {
    const notes = await prisma.userNote.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, color: true, createdAt: true },
    });

    return NextResponse.json({
      status: 200,
      msg: "Success",
      data: notes.map(toNoteResponse),
    });
  } catch (error) {
    console.error("Load notes request failed:", error);
    return NextResponse.json(
      { msg: "Catatan gagal dimuat." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = await getOwnerId();
  if (!userId) return unauthorizedResponse();

  try {
    const parsed = noteContentSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { msg: "Data catatan tidak valid." },
        { status: 400 },
      );
    }

    const note = await prisma.userNote.create({
      data: { ...parsed.data, userId },
      select: { id: true, title: true, color: true, createdAt: true },
    });
    return NextResponse.json(
      { status: 201, msg: "Success", data: toNoteResponse(note) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create note request failed:", error);
    return NextResponse.json(
      { msg: "Catatan gagal dibuat." },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const userId = await getOwnerId();
  if (!userId) return unauthorizedResponse();

  try {
    const body = await readJson(request);
    const parsed = z
      .object({
        id: z.string().min(1),
        ...noteContentSchema.shape,
      })
      .safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { msg: "Data catatan tidak valid." },
        { status: 400 },
      );
    }

    const { id, ...data } = parsed.data;
    const updated = await prisma.userNote.updateMany({
      where: { id, userId },
      data,
    });
    if (updated.count !== 1) {
      return NextResponse.json(
        { msg: "Catatan tidak ditemukan." },
        { status: 404 },
      );
    }

    const note = await prisma.userNote.findUnique({
      where: { id },
      select: { id: true, title: true, color: true, createdAt: true },
    });
    if (!note) {
      return NextResponse.json(
        { msg: "Catatan tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: 200,
      msg: "Success",
      data: toNoteResponse(note),
    });
  } catch (error) {
    console.error("Update note request failed:", error);
    return NextResponse.json(
      { msg: "Catatan gagal diperbarui." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await getOwnerId();
  if (!userId) return unauthorizedResponse();

  try {
    const parsed = z
      .object({ id: z.string().min(1) })
      .safeParse(await readJson(request));
    if (!parsed.success) {
      return NextResponse.json(
        { msg: "ID catatan tidak valid." },
        { status: 400 },
      );
    }

    const deleted = await prisma.userNote.deleteMany({
      where: { id: parsed.data.id, userId },
    });
    if (deleted.count !== 1) {
      return NextResponse.json(
        { msg: "Catatan tidak ditemukan." },
        { status: 404 },
      );
    }

    return NextResponse.json({ status: 200, msg: "Success" });
  } catch (error) {
    console.error("Delete note request failed:", error);
    return NextResponse.json(
      { msg: "Catatan gagal dihapus." },
      { status: 500 },
    );
  }
}
