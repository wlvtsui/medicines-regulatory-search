export type MedicineMatchReason =
  | "brand-name"
  | "ingredient"
  | "product-name"
  | "product-title";

export type MedicineAliasProvenance = {
  matchedTerm: string;
  aliasOf: string;
  source: string;
  conceptId: string;
  sourceUrl: string;
};

export type MedicineQueryVariant = {
  term: string;
  alias?: MedicineAliasProvenance;
};

const INGREDIENT_ALIAS_GROUPS = [
  {
    conceptId: "RXCUI:161",
    names: ["acetaminophen", "paracetamol"],
    source: "NLM RxNorm",
    sourceUrl: "https://www.nlm.nih.gov/research/umls/rxnorm/overview.html",
  },
] as const;

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

export function getMedicineQueryVariants(query: string): MedicineQueryVariant[] {
  const term = normalizeMedicineQuery(query);
  const normalizedTerm = normalizeMedicineText(term);
  if (!normalizedTerm) {
    return [];
  }

  const variants: MedicineQueryVariant[] = [{ term }];

  for (const group of INGREDIENT_ALIAS_GROUPS) {
    const names = group.names.map(normalizeMedicineText);
    if (!names.includes(normalizedTerm)) {
      continue;
    }

    for (const alias of group.names) {
      const normalizedAlias = normalizeMedicineText(alias);
      if (normalizedAlias === normalizedTerm) {
        continue;
      }

      variants.push({
        term: alias,
        alias: {
          matchedTerm: alias,
          aliasOf: term,
          source: group.source,
          conceptId: group.conceptId,
          sourceUrl: group.sourceUrl,
        },
      });
    }
  }

  return variants;
}

export function matchesMedicineQuery(value: string, query: string): boolean {
  const normalizedValue = normalizeMedicineText(value);
  const normalizedQuery = normalizeMedicineText(query);
  return Boolean(normalizedQuery) && normalizedValue.includes(normalizedQuery);
}
