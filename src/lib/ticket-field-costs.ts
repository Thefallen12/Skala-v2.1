export const FIELD_COST_LABELS = {
  HAULING: "Biaya Langsir",
  LABOR: "Biaya Upah Tukang",
} as const;

export function getFieldCostLabel(category?: string | null) {
  switch (category) {
    case "HAULING":
      return FIELD_COST_LABELS.HAULING;
    case "LABOR":
      return FIELD_COST_LABELS.LABOR;
    default:
      return null;
  }
}
