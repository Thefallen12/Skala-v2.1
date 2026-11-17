export const EQUIPMENT_REQUEST_TYPE = "EQUIPMENT_REQUEST" as const;

export type EquipmentRequestType = typeof EQUIPMENT_REQUEST_TYPE;

export const HOUSE_RENTAL_REQUEST_TYPE = "HOUSE_RENTAL" as const;

export type HouseRentalRequestType = typeof HOUSE_RENTAL_REQUEST_TYPE;

export const VEHICLE_RENTAL_REQUEST_TYPE = "VEHICLE_RENTAL" as const;

export type VehicleRentalRequestType = typeof VEHICLE_RENTAL_REQUEST_TYPE;

export const RENTAL_TICKET_TYPES = [
  HOUSE_RENTAL_REQUEST_TYPE,
  VEHICLE_RENTAL_REQUEST_TYPE,
  EQUIPMENT_REQUEST_TYPE,
] as const;

export type RentalTicketType = (typeof RENTAL_TICKET_TYPES)[number];

export const RENTAL_TICKET_TYPE_LABELS: Record<RentalTicketType, string> = {
  HOUSE_RENTAL: "Rumah Sewa Tukang",
  VEHICLE_RENTAL: "Kendaraan Sewa",
  EQUIPMENT_REQUEST: "Permintaan Alat Berat",
};

export const RENTAL_PERIOD_TYPES = ["DAILY", "WEEKLY", "MONTHLY"] as const;

export type RentalPeriodType = (typeof RENTAL_PERIOD_TYPES)[number];

export const RENTAL_PERIOD_TYPE_LABELS: Record<RentalPeriodType, string> = {
  DAILY: "Harian",
  WEEKLY: "Mingguan / Periode",
  MONTHLY: "Bulanan",
};

export const RENTAL_USAGE_SCOPES = ["PROJECT", "OPERATIONAL"] as const;

export type RentalUsageScope = (typeof RENTAL_USAGE_SCOPES)[number];

export function isRentalTicketType(value: unknown): value is RentalTicketType {
  return (
    typeof value === "string" &&
    (RENTAL_TICKET_TYPES as readonly string[]).includes(value)
  );
}

export const EQUIPMENT_TIME_UNITS = ["JAM", "HARI", "BULAN", "RIT"] as const;

export type EquipmentTimeUnit = (typeof EQUIPMENT_TIME_UNITS)[number];

export const DEFAULT_EQUIPMENT_TIME_UNIT: EquipmentTimeUnit = "HARI";

export const EQUIPMENT_TIME_UNIT_LABELS: Record<EquipmentTimeUnit, string> = {
  JAM: "Jam",
  HARI: "Hari",
  BULAN: "Bulan",
  RIT: "Rit (Untuk Truk)",
};
