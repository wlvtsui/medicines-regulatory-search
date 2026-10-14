type EmaSearchResult = {
  productName: string;
  activeSubstance: string;
  officialRecord: string;
  publicRecordUrl: string;
  fhirResourceId: string;
  doseFormCode: string;
  doseFormLabel: string;
  domainCode: string;
  domainLabel: string;
  identifierValue: string;
  productNameParts: string[];
  activeSubstanceParts: string[];
};

type FhirResource = Record<string, unknown>;

type FhirBundle = {
  resourceType?: string;
  type?: string;
  entry?: Array<{ resource?: FhirResource; fullUrl?: string }>;
  total?: number;
};

const RESULT_LIMIT = 10;

function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value as T];
}

function readString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function pickText(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = pickText(entry);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    const directText =
      readString(record.text) ||
      readString(record.display) ||
      readString(record.name) ||
      readString(record.value) ||
      readString(record.title);

    if (directText) {
      return directText;
    }

    const nested = Object.values(record).map((item) => pickText(item));
    return nested.find(Boolean) ?? "";
  }

  return "";
}

function extractCodingValue(value: unknown, property: "code" | "display" | "text" | "label" | "name"): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const coding = asArray<unknown>(record.coding);

  for (const entry of coding) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const entryRecord = entry as Record<string, unknown>;
    const valueText = readString(entryRecord[property]);
    if (valueText) {
      return valueText;
    }
  }

  if (property in record) {
    const direct = readString(record[property]);
    if (direct) {
      return direct;
    }
  }

  return "";
}

function extractCodingCode(value: unknown): string {
  return extractCodingValue(value, "code");
}

function extractCodingLabel(value: unknown): string {
  return (
    extractCodingValue(value, "display") ||
    extractCodingValue(value, "text") ||
    extractCodingValue(value, "label") ||
    extractCodingValue(value, "name") ||
    "Code label not returned by the EMA API"
  );
}

function extractIdentifierValue(resource: FhirResource): string {
  const identifiers = asArray<unknown>(resource.identifier);

  for (const identifier of identifiers) {
    if (!identifier || typeof identifier !== "object") {
      continue;
    }

    const record = identifier as Record<string, unknown>;
    const value = readString(record.value);
    if (value) {
      return value;
    }
  }

  return "Not listed";
}

function extractNameParts(resource: FhirResource): {
  productName: string;
  activeSubstance: string;
  productNameParts: string[];
  activeSubstanceParts: string[];
} {
  const names = asArray<unknown>(resource.name);
  const productNames: string[] = [];
  const activeSubstances: string[] = [];

  for (const nameEntry of names) {
    if (!nameEntry || typeof nameEntry !== "object") {
      continue;
    }

    const nameRecord = nameEntry as Record<string, unknown>;
    const productName = readString(nameRecord.productName);
    if (productName) {
      productNames.push(productName);
    }

    const parts = asArray<unknown>(nameRecord.part);
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const partRecord = part as Record<string, unknown>;
      const partValue = readString(partRecord.part);
      if (partValue && partValue !== productName) {
        activeSubstances.push(partValue);
      }
    }
  }

  const productName = productNames[0] || "Not listed";
  const activeSubstance = activeSubstances.length > 0
    ? Array.from(new Set(activeSubstances)).join(" / ")
    : "Not listed";

  return {
    productName,
    activeSubstance,
    productNameParts: productNames,
    activeSubstanceParts: Array.from(new Set(activeSubstances)),
  };
}

function extractProductName(resource: FhirResource): string {
  const { productName } = extractNameParts(resource);
  return productName;
}

function extractActiveSubstance(resource: FhirResource): string {
  const { activeSubstance } = extractNameParts(resource);
  return activeSubstance;
}

function isFhirBundle(value: unknown): value is FhirBundle {
  if (!value || typeof value !== "object") {
    return false;
  }

  const bundle = value as Record<string, unknown>;
  return bundle.resourceType === "Bundle" && typeof bundle.type === "string";
}

function normalizeFhirSearchResults(bundle: FhirBundle, base: string): EmaSearchResult[] {
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  const results: EmaSearchResult[] = [];

  for (const entry of entries) {
    const resource = entry?.resource;
    if (!resource || typeof resource !== "object") {
      continue;
    }

    const resourceObject = resource as FhirResource;
    const resourceType = readString(resourceObject.resourceType);
    const id = readString(resourceObject.id);
    const productName = extractProductName(resourceObject);
    const activeSubstance = extractActiveSubstance(resourceObject);
    const doseFormCode = extractCodingCode(resourceObject.combinedPharmaceuticalDoseForm);
    const doseFormLabel = extractCodingLabel(resourceObject.combinedPharmaceuticalDoseForm);
    const domainCode = extractCodingCode(resourceObject.domain);
    const domainLabel = extractCodingLabel(resourceObject.domain);
    const identifierValue = extractIdentifierValue(resourceObject);
    const nameParts = extractNameParts(resourceObject);

    const officialRecord = id
      ? new URL(`${resourceType}/${id}`, base).toString()
      : entry?.fullUrl || "";
    const publicRecordUrl = productName !== "Not listed"
      ? `https://www.ema.europa.eu/en/search?search_api_views_fulltext=${encodeURIComponent(productName)}`
      : "https://www.ema.europa.eu/en/search?search_api_views_fulltext=medicines";

    if (!officialRecord || productName === "Not listed") {
      continue;
    }

    results.push({
      productName,
      activeSubstance,
      officialRecord,
      publicRecordUrl,
      fhirResourceId: id || "Not listed",
      doseFormCode: doseFormCode || "Not listed",
      doseFormLabel: doseFormLabel === "Code label not returned by the EMA API" ? "Code label not returned by the EMA API" : doseFormLabel,
      domainCode: domainCode || "Not listed",
      domainLabel: domainLabel === "Code label not returned by the EMA API" ? "Code label not returned by the EMA API" : domainLabel,
      identifierValue,
      productNameParts: nameParts.productNameParts,
      activeSubstanceParts: nameParts.activeSubstanceParts,
    });
  }

  return results.slice(0, RESULT_LIMIT);
}

async function getAccessToken(): Promise<string> {
  const tokenUrl = process.env.EMA_TOKEN_URL;
  const clientId = process.env.EMA_CLIENT_ID;
  const clientSecret = process.env.EMA_CLIENT_SECRET;
  const scope = process.env.EMA_SCOPE;

  if (!tokenUrl || !clientId || !clientSecret || !scope) {
    throw new Error("EMA OAuth environment variables are missing.");
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error("The EMA OAuth token service rejected the client credentials.");
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("The EMA OAuth token response did not include an access token.");
  }

  return data.access_token;
}

async function searchFhirResource(
  base: string,
  token: string,
  resourceType: string,
  searchParams: Record<string, string>,
  term: string
): Promise<EmaSearchResult[]> {
  const url = new URL(`${base.replace(/\/$/, "")}/${resourceType}`);

  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("_count", "10");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/fhir+json, application/json;q=0.9",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    return [];
  }

  const payload: unknown = await response.json();

  if (!isFhirBundle(payload)) {
    return [];
  }

  return normalizeFhirSearchResults(payload, base);
}

export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("q")?.trim();

  if (!term) {
    return Response.json(
      { error: "Please provide a medicine name using ?q=" },
      { status: 400 }
    );
  }

  const normalizedTerm = normalizeQuery(term);

  if (
    normalizedTerm.length > 100 ||
    !/^[\p{L}\p{N}\s.'’&/-]+$/u.test(normalizedTerm)
  ) {
    return Response.json(
      {
        error:
          "Search terms should use letters, numbers, or basic medication names.",
      },
      { status: 400 }
    );
  }

  const base = process.env.PMS_API_BASE?.trim();
  if (!base) {
    return Response.json(
      { error: "The EMA PMS API base URL is not configured." },
      { status: 500 }
    );
  }

  try {
    const token = await getAccessToken();
    const searchVariants = [
      { resourceType: "MedicinalProductDefinition", params: { name: normalizedTerm } },
      {
        resourceType: "MedicinalProductDefinition",
        params: { name: normalizedTerm.replace(/\s+/g, " ") },
      },
    ];

    const settled = await Promise.allSettled(
      searchVariants.map(({ resourceType, params }) =>
        searchFhirResource(base, token, resourceType, params, normalizedTerm)
      )
    );

    const combined = settled.flatMap((entry) =>
      entry.status === "fulfilled" ? entry.value : []
    );

    const deduped = Array.from(
      new Map(
        combined.map((record) => [
          `${record.officialRecord}|${record.productName}`,
          record,
        ])
      ).values()
    ).slice(0, RESULT_LIMIT);

    if (deduped.length === 0) {
      return Response.json(
        {
          source: "EMA PMS FHIR R5",
          count: 0,
          results: [],
          notice:
            "No exact or partial FHIR R5 matches were returned for this search term. Verify the product name or active substance in the official EMA records.",
        },
        { status: 200 }
      );
    }

    return Response.json({
      source: "EMA PMS FHIR R5",
      count: deduped.length,
      results: deduped,
      notice:
        "These results are normalized from HL7 FHIR R5 Bundle searchset responses returned by the EMA PMS API. The search applies the product-name lookup supported by the API and then exposes the active-substance fields embedded in each returned FHIR resource for verification.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The EMA PMS API could not be queried.",
      },
      { status: 502 }
    );
  }
}
