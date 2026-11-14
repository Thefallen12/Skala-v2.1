export const EQUIPMENT_REQUEST_TYPE = "EQUIPMENT_REQUEST" as const;

export type EquipmentRequestType = typeof EQUIPMENT_REQUEST_TYPE;

export const EQUIPMENT_TIME_UNITS = ["JAM", "HARI", "BULAN", "RIT"] as const;

export type EquipmentTimeUnit = (typeof EQUIPMENT_TIME_UNITS)[number];

export const DEFAULT_EQUIPMENT_TIME_UNIT: EquipmentTimeUnit = "HARI";

export const EQUIPMENT_TIME_UNIT_LABELS: Record<EquipmentTimeUnit, string> = {
  JAM: "Jam",
  HARI: "Hari",
  BULAN: "Bulan",
  RIT: "Rit (Untuk Truk)",
};
