import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

type PublicCodeClient = Pick<
  Prisma.TransactionClient,
  | "purchaseOrder"
  | "deliveryOrder"
  | "invoice"
  | "orderConfirmation"
  | "blueprint"
  | "subkonContract"
  | "bASTDocument"
>;

export function generateRandomCode(): string {
  return randomBytes(16).toString("hex");
}

export function isValidPublicCode(value: string): boolean {
  return /^(?:[a-f0-9]{10}|[a-f0-9]{32})$/.test(value);
}

export async function generateAvailablePublicCode(
  client: PublicCodeClient,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicCode = generateRandomCode();
    const [
      purchaseOrder,
      deliveryOrder,
      invoice,
      orderConfirmation,
      blueprint,
      subkonContract,
      bastDocument,
    ] = await Promise.all([
      client.purchaseOrder.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
      client.deliveryOrder.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
      client.invoice.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
      client.orderConfirmation.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
      client.blueprint.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
      client.subkonContract.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
      client.bASTDocument.findUnique({
        where: { publicCode },
        select: { id: true },
      }),
    ]);
    if (
      !purchaseOrder &&
      !deliveryOrder &&
      !invoice &&
      !orderConfirmation &&
      !blueprint &&
      !subkonContract &&
      !bastDocument
    ) {
      return publicCode;
    }
  }
  throw new Error("Kode URL unik tidak dapat dibuat setelah beberapa percobaan.");
}
