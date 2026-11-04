import { Prisma } from "@/generated/prisma/client";

const STORAGE_SCALE = 1_000;

export type DecimalInput = Prisma.Decimal | string | number | bigint;

export function decimalFromScaledInteger(value: bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString()).div(STORAGE_SCALE);
}

export function decimalStringFromScaledInteger(value: bigint): string {
  return decimalFromScaledInteger(value).toString();
}

export function scaledIntegerFromDecimal(value: DecimalInput): bigint {
  const decimal = new Prisma.Decimal(
    typeof value === "bigint" ? value.toString() : value,
  );
  return BigInt(
    decimal
      .mul(STORAGE_SCALE)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(0),
  );
}

export function decimalNumberFromScaledInteger(value: bigint): number {
  return decimalFromScaledInteger(value).toNumber();
}
