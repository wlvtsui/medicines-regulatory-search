type JsonRecord = Record<string, unknown>;

type EpiSection = {
  title: string;
  content: string;
  sections: EpiSection[];
};

type EpiDocument = {
  id: string;
  url: string;
  type: string;
  language: string;
  date: string;
  sections: EpiSection[];
};

type EpiProduct = {
  productName: string;
  listId: string;
  identifier: string;
  marketingAuthorisationHolder: string;
  regulatoryAgency: string;
  documents: EpiDocument[];
};

type FhirListSearchResponse = {
  entry?: Array<{ resource?: JsonRecord }>;
};

type FhirBundle = {
  entry?: Array<{ resource?: JsonRecord }>;
};

const API_BASE = "https://epi.ema.europa.eu/consuming/api/fhir";
const MAX_LISTS = 5;
const MAX_DOCUMENTS_PER_LIST = 4;
const MAX_DOCUMENTS_TOTAL = 15;
const MAX_SECTIONS_PER_DOCUMENT = 160;
const MAX_SECTION_DEPTH = 12;

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getCodingDisplay(value: unknown): string {
  const record = asRecord(value);
  const codings = asArray(record?.coding);

  for (const coding of codings) {
    const display = readString(asRecord(coding)?.display);
    if (display) {
      return display;
    }
  }

  return "";
}

function getListExtensionDisplay(list: JsonRecord, extensionName: string): string {
  const subject = asRecord(list.subject);
  const extensions = asArray(subject?.extension);

  for (const extension of extensions) {
    const record = asRecord(extension);
    if (readString(record?.url).endsWith(`/${extensionName}`)) {
      return getCodingDisplay({ coding: [record?.valueCoding] });
    }
  }

  return "";
}

function getBundleIds(list: JsonRecord): string[] {
  return asArray(list.entry)
    .map((entry) => readString(asRecord(asRecord(entry)?.item)?.reference))
    .map((reference) => reference.match(/(?:^|\/)Bundle\/([A-Za-z0-9.-]+)(?:$|[?#])/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1])
    .slice(0, MAX_DOCUMENTS_PER_LIST);
}

function normalizeSections(value: unknown): EpiSection[] {
  let remaining = MAX_SECTIONS_PER_DOCUMENT;

  function visit(input: unknown, depth: number): EpiSection[] {
    if (depth > MAX_SECTION_DEPTH || remaining <= 0) {
      return [];
    }

    const output: EpiSection[] = [];
    for (const item of asArray(input)) {
      if (remaining <= 0) {
        break;
      }

      const section = asRecord(item);
      if (!section) {
        continue;
      }

      remaining -= 1;
      const text = asRecord(section.text);
      output.push({
        title: readString(section.title) || "Untitled section",
        content: readString(text?.div),
        sections: visit(section.section, depth + 1),
      });
    }

    return output;
  }

  return visit(value, 0);
}

function normalizeDocument(bundleId: string, bundle: FhirBundle): EpiDocument | undefined {
  const composition = asArray(bundle.entry)
    .map((entry) => asRecord(asRecord(entry)?.resource))
    .find((resource) => Array.isArray(resource?.section));

  if (!composition) {
    return undefined;
  }

  const type = getCodingDisplay(composition.type) || "Product information document";
  const language = type.match(/\(([^()]+)\)\s*$/)?.[1] ?? "Not specified";

  return {
    id: bundleId,
    url: `${API_BASE}/Bundle/${encodeURIComponent(bundleId)}`,
    type,
    language,
    date: readString(composition.date) || "Not listed",
    sections: normalizeSections(composition.section),
  };
}

async function fetchEpiJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/fhir+json, application/json;q=0.9" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const message = response.status === 404
      ? "No matching EMA ePI record was found."
      : `The EMA ePI service returned HTTP ${response.status}.`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  return response.json();
}

async function fetchDocument(bundleId: string): Promise<EpiDocument | undefined> {
  const url = new URL(`${API_BASE}/Bundle/${encodeURIComponent(bundleId)}`);
  const payload = await fetchEpiJson(url);
  return normalizeDocument(bundleId, payload as FhirBundle);
}

export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("q")?.replace(/\s+/g, " ").trim();

  if (!term) {
    return Response.json({ error: "Please provide a medicine name using ?q=" }, { status: 400 });
  }

  if (
    term.length > 100 ||
    !/^[\p{L}\p{N}\s.'’&,/()-]+$/u.test(term)
  ) {
    return Response.json(
      { error: "Search terms should use letters, numbers, or basic medicine-name punctuation." },
      { status: 400 }
    );
  }

  try {
    const listUrl = new URL(`${API_BASE}/List`);
    listUrl.searchParams.set("title", term);

    let listPayload: unknown;
    try {
      listPayload = await fetchEpiJson(listUrl);
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 404) {
        return Response.json({
          source: "EMA ePI Consuming API",
          count: 0,
          results: [],
          notice: "No published ePI title matched this search. The public dataset covers ePIs published during the EU pilot.",
        });
      }
      throw error;
    }

    const entries = asArray((listPayload as FhirListSearchResponse)?.entry);
    const lists = entries
      .map((entry) => asRecord(asRecord(entry)?.resource))
      .filter((resource): resource is JsonRecord => readString(resource?.resourceType) === "List")
      .slice(0, MAX_LISTS);

    const documentJobs = lists.flatMap((list) =>
      getBundleIds(list).map((bundleId) => ({ list, bundleId }))
    ).slice(0, MAX_DOCUMENTS_TOTAL);

    const settledDocuments = await Promise.allSettled(
      documentJobs.map(({ bundleId }) => fetchDocument(bundleId))
    );
    const documentsByList = new Map<string, EpiDocument[]>();

    settledDocuments.forEach((result, index) => {
      if (result.status !== "fulfilled" || !result.value) {
        return;
      }

      const { list } = documentJobs[index];
      const listId = readString(list.id);
      const documents = documentsByList.get(listId) ?? [];
      documents.push(result.value);
      documentsByList.set(listId, documents);
    });

    const results: EpiProduct[] = lists.flatMap((list) => {
      const listId = readString(list.id);
      const title = readString(list.title);
      if (!listId || !title) {
        return [];
      }

      const identifier = asArray(list.identifier)
        .map((entry) => readString(asRecord(entry)?.value))
        .find(Boolean) ?? "Not listed";

      return [{
        productName: title,
        listId,
        identifier,
        marketingAuthorisationHolder: getListExtensionDisplay(list, "marketingAuthorisationHolder") || "Not listed",
        regulatoryAgency: getListExtensionDisplay(list, "regulatoryAgency") || "Not listed",
        documents: documentsByList.get(listId) ?? [],
      }];
    });

    return Response.json({
      source: "EMA ePI Consuming API",
      count: results.length,
      results,
      notice: "These are public ePI documents returned by the EMA ePI Consuming API. Each document is an HL7 FHIR Bundle; the content is presented as text extracted from its FHIR sections.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The EMA ePI service could not be queried.";
    return Response.json({ error: message }, { status: 502 });
  }
}
