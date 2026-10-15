export type MedicineMatchReason =
  | "brand-name"
  | "ingredient"
  | "product-name"
  | "product-title";

export function normalizeMedicineQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMedicineText(value: string): string {
  return normalizeMedicineQuery(value).toLocaleLowerCase("en");
}

export function matchesMedicineQuery(value: string, query: string): boolean {
  const normalizedValue = normalizeMedicineText(value);
  const normalizedQuery = normalizeMedicineText(query);
  return Boolean(normalizedQuery) && normalizedValue.includes(normalizedQuery);
}
