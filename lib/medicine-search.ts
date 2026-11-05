const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";
const RXNAV_DOC_URL = "https://rxnav.nlm.nih.gov/REST";
const MAX_VARIANTS = 10;
const RXNAV_TIMEOUT_MS = 15000;

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

export async function getMedicineQueryVariants(
  query: string
): Promise<MedicineQueryVariant[]> {
  const term = normalizeMedicineQuery(query);
  const normalizedTerm = normalizeMedicineText(term);
  if (!normalizedTerm) {
    return [];
  }

  const variants: MedicineQueryVariant[] = [{ term }];

  try {
    const candidates = await fetchRxNavApproximateTerm(term);
    const seen = new Set([normalizedTerm]);

    for (const candidate of candidates) {
      if (variants.length >= MAX_VARIANTS) {
        break;
      }

      const name = candidate.name?.trim();
      if (!name) {
        continue;
      }

      const normalizedName = normalizeMedicineText(name);
      if (!normalizedName || seen.has(normalizedName)) {
        continue;
      }
      seen.add(normalizedName);

      variants.push({
        term: name,
        alias: {
          matchedTerm: name,
          aliasOf: term,
          source: `NLM RxNav${candidate.source ? ` (${candidate.source})` : ""}`,
          conceptId: candidate.rxcui ? `RXCUI:${candidate.rxcui}` : "",
          sourceUrl: RXNAV_DOC_URL,
        },
      });
    }
  } catch {
    // RxNav unavailable — fall back to the raw query term only.
  }

  return variants;
}

type RxNavCandidate = {
  rxcui?: string;
  rxaui?: string;
  score?: string;
  rank?: string;
  name?: string;
  source?: string;
};

async function fetchRxNavApproximateTerm(
  term: string
): Promise<RxNavCandidate[]> {
  const url = new URL(`${RXNAV_BASE}/approximateTerm.json`);
  url.searchParams.set("term", term);
  url.searchParams.set("maxEntries", String(MAX_VARIANTS));

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(RXNAV_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`RxNav approximateTerm returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const candidates = json?.approximateGroup?.candidate ?? [];

  return Array.isArray(candidates) ? candidates : [];
}

export function matchesMedicineQuery(value: string, query: string): boolean {
  const normalizedValue = normalizeMedicineText(value);
  const normalizedQuery = normalizeMedicineText(query);
  return Boolean(normalizedQuery) && normalizedValue.includes(normalizedQuery);
}
