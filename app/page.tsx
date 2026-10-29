
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { MedicineMatchReason } from "@/lib/medicine-search";

type ThemeMode = "light" | "dark" | "system";
type SearchState =
  | "idle"
  | "searching"
  | "found"
  | "empty"
  | "error"
  | "not-searched";
type SearchSource =
  | "hongKong"
  | "fdaLabel"
  | "fdaApplication"
  | "healthCanada"
  | "ukDmd"
  | "emaPms"
  | "emaEpi";

const THEME_STORAGE_KEY = "medicine-regulatory-search-theme";

const searchStateLabels: Record<SearchState, string> = {
  idle: "Awaiting search",
  searching: "Searching",
  found: "Results found",
  empty: "No matches",
  error: "Unavailable",
  "not-searched": "Not searched",
};

const themeListeners = new Set<() => void>();

function subscribeToTheme(onChange: () => void) {
  themeListeners.add(onChange);
  return () => themeListeners.delete(onChange);
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : "system";
}

function getServerTheme(): ThemeMode {
  return "system";
}

function saveTheme(mode: ThemeMode) {
  window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  document.documentElement.dataset.theme = mode;
  themeListeners.forEach((onChange) => onChange());
}

const sources = [
  {
    country: "Hong Kong",
    name: "Drug Office",
    url: "https://www.drugoffice.gov.hk/eps/do/en/consumer/search_drug_database2.html",
  },
  {
    country: "United States",
    name: "FDA Drugs@FDA",
    url: "https://www.accessdata.fda.gov/scripts/cder/daf/",
  },
  {
    country: "United Kingdom",
    name: "MHRA Products",
    url: "https://products.mhra.gov.uk/",
  },
  {
    country: "Canada",
    name: "Drug Product Database",
    url: "https://health-products.canada.ca/dpd-bdpp/index-eng.jsp",
  },
  {
    country: "European Union (EMA)",
    name: "EMA medicines portal",
    url: "https://www.ema.europa.eu/en/search?search_api_views_fulltext=medicines",
  },
];

type MedicineRecord = {
  brandName: string;
  genericName: string;
  manufacturer: string;
  dosageForm: string;
  route: string;
  applicationNumber: string | null;
  productNdc: string | null;
  labelId: string | null;
  labelSetId: string | null;
  labelEffectiveDate: string | null;
  matchedBy: MedicineMatchReason[];
};

type HealthCanadaRecord = {
  drugCode: number;
  din: string;
  brandName: string;
  manufacturer: string;
  className: string;
  descriptor: string;
  ingredients: {
    name: string;
    strength: string;
  }[];
  dosageForms: string[];
  routes: string[];
  status: string;
  statusDate: string;
  originalMarketDate: string;
  lastUpdated: string;
  officialRecord: string;
  matchedBy: MedicineMatchReason[];
};

type HongKongRecord = {
  productName: string;
  certificateHolder: string;
  permitNumber: string;
  activeIngredients: string[];
  officialRecord: string;
  matchedBy: MedicineMatchReason[];
};

type UkDmdRecord = {
  id: string;
  type: string;
  name: string;
  matchedBy: MedicineMatchReason[];
};

type ApprovalProduct = {
  brandName: string;
  ingredients: {
    name: string;
    strength: string;
  }[];
  dosageForm: string;
  route: string;
  marketingStatus: string;
  matchedBy: MedicineMatchReason[];
};

type ApprovalSubmission = {
  type: string;
  status: string;
  statusDate: string;
  number: string;
};

type ApprovalRecord = {
  applicationNumber: string;
  sponsor: string;
  products: ApprovalProduct[];
  submissions: ApprovalSubmission[];
  officialRecord: string;
};

type ApprovalResponse = {
  source?: string;
  count?: number;
  results?: ApprovalRecord[];
  notice?: string;
  message?: string;
  error?: string;
};

function normalizeApplicationNumber(
  value: string | null | undefined
): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isMatchableApplicationNumber(
  value: string | null | undefined
): boolean {
  return /^(NDA|ANDA|BLA)\d+$/.test(
    normalizeApplicationNumber(value)
  );
}

function dailyMedLabelUrl(setId: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`;
}

function dailyMedSearchUrl(term: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(term)}`;
}

function hasExactApplicationMatch(
  labelNumber: string | null | undefined,
  applications: ApprovalRecord[]
): boolean {
  if (!isMatchableApplicationNumber(labelNumber)) {
    return false;
  }

  const normalizedLabelNumber =
    normalizeApplicationNumber(labelNumber);

  return applications.some(
    (application) =>
      normalizeApplicationNumber(
        application.applicationNumber
      ) === normalizedLabelNumber
  );
}

type SearchResponse = {
  source?: string;
  count?: number;
  results?: MedicineRecord[];
  notice?: string;
  error?: string;
  message?: string;
};

type HealthCanadaResponse = {
  count?: number;
  results?: HealthCanadaRecord[];
  notice?: string;
  error?: string;
};

type HongKongResponse = {
  count?: number;
  totalCount?: number;
  lastUpdated?: string;
  results?: HongKongRecord[];
  notice?: string;
  error?: string;
};

type UkDmdResponse = {
  count?: number;
  releaseDate?: string | null;
  results?: UkDmdRecord[];
  notice?: string;
  error?: string;
};

type EmaRecord = {
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
  matchedBy: MedicineMatchReason[];
};

type EmaResponse = {
  count?: number;
  results?: EmaRecord[];
  notice?: string;
  error?: string;
};

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
  matchedBy: MedicineMatchReason[];
};

type EpiResponse = {
  count?: number;
  results?: EpiProduct[];
  notice?: string;
  error?: string;
};

const matchReasonLabels: Record<MedicineMatchReason, string> = {
  "brand-name": "Brand name",
  ingredient: "Active ingredient",
  "product-name": "Product name",
  "product-title": "Product title",
};

function MatchProvenance({ reasons }: { reasons?: MedicineMatchReason[] }) {
  if (!reasons?.length) {
    return null;
  }

  return (
    <p className="match-provenance">
      <strong>Matched fields:</strong>{" "}
      {reasons.map((reason) => matchReasonLabels[reason]).join(", ")}
    </p>
  );
}

function xhtmlToText(markup: string): string {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const blockTags = new Set([
    "ADDRESS", "ARTICLE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT",
    "H1", "H2", "H3", "H4", "H5", "H6", "LI", "OL", "P", "PRE", "TABLE",
    "TD", "TH", "TR", "UL",
  ]);

  function readNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node as Element;
    if (element.tagName === "SCRIPT" || element.tagName === "STYLE") {
      return "";
    }

    const text = Array.from(element.childNodes, readNode).join("");
    return blockTags.has(element.tagName) ? `${text}\n` : text;
  }

  return readNode(parsed.body)
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function EpiSectionList({ sections }: { sections: EpiSection[] }) {
  if (sections.length === 0) {
    return null;
  }

  return (
    <ul className="epi-section-list">
      {sections.map((section, index) => (
        <li key={`${section.title}-${index}`}>
          <details>
            <summary>{section.title}</summary>
            {section.content && (
              <p className="epi-section-content">{xhtmlToText(section.content)}</p>
            )}
            <EpiSectionList sections={section.sections} />
          </details>
        </li>
      ))}
    </ul>
  );
}

// Client-side mirror of the server-side EU domain filter used by the EMA PMS
// API route. Keeps the UI consistent even if the server response changes.
const EMA_EU_DOMAIN_CODES = new Set([
  "EU",
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

function isEmaEuDomain(domainCode: string, domainLabel: string): boolean {
  const code = (domainCode || "").trim();
  const label = (domainLabel || "").trim().toLowerCase();

  if (!code || code === "Not listed") {
    return false;
  }

  if (EMA_EU_DOMAIN_CODES.has(code)) {
    return true;
  }

  return label.includes("european union");
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("All");
  const themeMode = useSyncExternalStore(
    subscribeToTheme,
    getStoredTheme,
    getServerTheme
  );

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);
  const [sourceStates, setSourceStates] = useState<
    Record<SearchSource, SearchState>
  >({
    hongKong: "idle",
    fdaLabel: "idle",
    fdaApplication: "idle",
    healthCanada: "idle",
    ukDmd: "idle",
    emaPms: "idle",
    emaEpi: "idle",
  });
  const [results, setResults] = useState<MedicineRecord[]>([]);
  const [healthCanadaResults, setHealthCanadaResults] =
    useState<HealthCanadaRecord[]>([]);
  const [healthCanadaStatus, setHealthCanadaStatus] = useState("");
  const [healthCanadaNotice, setHealthCanadaNotice] = useState("");
  const [hongKongResults, setHongKongResults] =
    useState<HongKongRecord[]>([]);
  const [hongKongStatus, setHongKongStatus] = useState("");
  const [hongKongNotice, setHongKongNotice] = useState("");
  const [hongKongLastUpdated, setHongKongLastUpdated] = useState("");
  const [ukDmdResults, setUkDmdResults] = useState<UkDmdRecord[]>([]);
  const [ukDmdStatus, setUkDmdStatus] = useState("");
  const [ukDmdNotice, setUkDmdNotice] = useState("");
  const [ukDmdReleaseDate, setUkDmdReleaseDate] = useState("");
  const [emaResults, setEmaResults] = useState<EmaRecord[]>([]);
  const [emaStatus, setEmaStatus] = useState("");
  const [emaNotice, setEmaNotice] = useState("");
  const [emaEuOnly, setEmaEuOnly] = useState(true);
  const [epiResults, setEpiResults] = useState<EpiProduct[]>([]);
  const [epiStatus, setEpiStatus] = useState("");
  const [epiNotice, setEpiNotice] = useState("");
  const [approvalResults, setApprovalResults] =
    useState<ApprovalRecord[]>([]);
  const [directLookupFailures, setDirectLookupFailures] =
    useState<string[]>([]);
  const [approvalNotice, setApprovalNotice] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("");
  const [searchedTerm, setSearchedTerm] = useState("");
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState("");

  async function searchMedicines(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const term = query.trim();
    if (!term) {
      setResults([]);
      setNotice("");
      setApprovalResults([]);
      setDirectLookupFailures([]);
      setApprovalNotice("");
      setApprovalStatus("");
      setHealthCanadaResults([]);
      setHealthCanadaStatus("");
      setHealthCanadaNotice("");
      setHongKongResults([]);
      setHongKongStatus("");
      setHongKongNotice("");
      setHongKongLastUpdated("");
      setUkDmdResults([]);
      setUkDmdStatus("");
      setUkDmdNotice("");
      setUkDmdReleaseDate("");
      setEmaResults([]);
      setEmaStatus("");
      setEmaNotice("");
      setEpiResults([]);
      setEpiStatus("");
      setEpiNotice("");
      setSourceStates({
        hongKong: "idle",
        fdaLabel: "idle",
        fdaApplication: "idle",
        healthCanada: "idle",
        ukDmd: "idle",
        emaPms: "idle",
        emaEpi: "idle",
      });
      setSearchedTerm("");
      setStatus("Enter a medicine name first.");
      return;
    }

    const searchFDA = country === "All" || country === "United States";
    const searchHealthCanada = country === "All" || country === "Canada";
    const searchHongKong = country === "All" || country === "Hong Kong";
    const searchUkDmd = country === "All" || country === "United Kingdom";
    const searchEma =
      country === "All" || country === "European Union (EMA)";
    const hasLiveSearch =
      searchFDA || searchHealthCanada || searchHongKong || searchUkDmd || searchEma;

    setSourceStates({
      hongKong: searchHongKong ? "searching" : "not-searched",
      fdaLabel: searchFDA ? "searching" : "not-searched",
      fdaApplication: searchFDA ? "searching" : "not-searched",
      healthCanada: searchHealthCanada ? "searching" : "not-searched",
      ukDmd: searchUkDmd ? "searching" : "not-searched",
      emaPms: searchEma ? "searching" : "not-searched",
      emaEpi: searchEma ? "searching" : "not-searched",
    });

    setStatus(
      searchFDA
        ? "Searching FDA label records..."
        : hasLiveSearch
          ? ""
          : "Live medicine searching is not yet connected for this country."
    );
    setResults([]);
    setNotice("");
    setApprovalResults([]);
    setDirectLookupFailures([]);
    setApprovalNotice("");
    setApprovalStatus("");
    setHealthCanadaResults([]);
    setHealthCanadaNotice("");
    setHealthCanadaStatus(
      searchHealthCanada ? "Searching Health Canada DPD records..." : ""
    );
    setHongKongResults([]);
    setHongKongNotice("");
    setHongKongLastUpdated("");
    setHongKongStatus(
      searchHongKong ? "Searching Hong Kong registered product records..." : ""
    );
    setUkDmdResults([]);
    setUkDmdNotice("");
    setUkDmdReleaseDate("");
    setUkDmdStatus(searchUkDmd ? "Searching UK dm+d actual products..." : "");
    setEmaResults([]);
    setEmaNotice("");
    setEmaStatus(searchEma ? "Searching EMA PMS product records..." : "");
    setEpiResults([]);
    setEpiNotice("");
    setEpiStatus(searchEma ? "Searching public EMA ePI documents..." : "");
    setSearchedTerm(term);

    const searchTasks: Promise<void>[] = [];

    if (searchFDA) {
      searchTasks.push((async () => {
        try {
      const [labelResponse, approvalResponse] = await Promise.all([
        fetch(`/api/fda?q=${encodeURIComponent(term)}`),
        fetch(`/api/fda-approval?q=${encodeURIComponent(term)}`),
      ]);

      const labelData: SearchResponse = await labelResponse.json();
      const approvalData: ApprovalResponse =
        await approvalResponse.json();

      if (!labelResponse.ok) {
        throw new Error(labelData.error || "The label search failed.");
      }

      if (!approvalResponse.ok) {
        throw new Error(
        approvalData.error || "The approval-record search failed."
        );
      }


const labelRecords = labelData.results ?? [];
const initialApprovalRecords = approvalData.results ?? [];

// Collect each distinct, usable application number from the labels.
const applicationNumbers = Array.from(
  new Set(
    labelRecords
      .map((record) =>
        normalizeApplicationNumber(record.applicationNumber)
      )
      .filter(isMatchableApplicationNumber)
  )
);

// Look up each number directly, even if the broad name search missed it.
const directLookupResponses = await Promise.all(
  applicationNumbers.map(async (applicationNumber) => {
    try {
      const response = await fetch(
        `/api/fda-approval?applicationNumber=${encodeURIComponent(
          applicationNumber
        )}`
      );

      if (!response.ok) {
        return {
          applicationNumber,
          results: [] as ApprovalRecord[],
          failed: true,
        };
      }

      const data: ApprovalResponse = await response.json();

      return {
        applicationNumber,
        results: data.results ?? [],
        failed: Boolean(data.error),
      };
    } catch {
      return {
        applicationNumber,
        results: [] as ApprovalRecord[],
        failed: true,
      };
    }
  })
);

const failedNumbers = directLookupResponses
  .filter((lookup) => lookup.failed)
  .map((lookup) => lookup.applicationNumber);

// Combine broad-search results and direct-lookup results.
const allApprovalRecords = [
  ...initialApprovalRecords,
  ...directLookupResponses.flatMap((lookup) => lookup.results),
];

// Deduplicate by normalized application number.
const uniqueApprovalRecords = Array.from(
  new Map(
    allApprovalRecords.map((record) => [
      normalizeApplicationNumber(record.applicationNumber),
      record,
    ])
  ).values()
);

setResults(labelRecords);
setNotice(labelData.notice ?? "");

setApprovalResults(uniqueApprovalRecords);
setDirectLookupFailures(failedNumbers);
setApprovalNotice(approvalData.notice ?? "");
setApprovalStatus(
  `Unique application records returned: ${uniqueApprovalRecords.length}. ` +
    `Direct application-number lookups attempted: ${applicationNumbers.length}.`
);

      setSourceStates((current) => ({
        ...current,
        fdaLabel: labelRecords.length > 0 ? "found" : "empty",
        fdaApplication:
          uniqueApprovalRecords.length > 0 ? "found" : "empty",
      }));

setStatus(
  `Label records returned: ${
    labelData.count ?? labelRecords.length
  }.`
);

        } catch (error) {
          setSourceStates((current) => ({
            ...current,
            fdaLabel: "error",
            fdaApplication: "error",
          }));
          setStatus(
            error instanceof Error
              ? error.message
              : "The FDA search failed. Please try again."
          );
        }
      })());
    }

    if (searchHealthCanada) {
      searchTasks.push((async () => {
        try {
          const response = await fetch(
            `/api/health-canada?q=${encodeURIComponent(term)}`
          );
          const data: HealthCanadaResponse = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || "The Health Canada search failed."
            );
          }

          const records = data.results ?? [];
          setHealthCanadaResults(records);
          setHealthCanadaNotice(data.notice ?? "");
          setHealthCanadaStatus(
            `Health Canada product records returned: ${
              data.count ?? records.length
            }.`
          );
          setSourceStates((current) => ({
            ...current,
            healthCanada: records.length > 0 ? "found" : "empty",
          }));
        } catch (error) {
          setSourceStates((current) => ({ ...current, healthCanada: "error" }));
          setHealthCanadaStatus(
            error instanceof Error
              ? error.message
              : "The Health Canada search failed. Please try again."
          );
        }
      })());
    }

    if (searchHongKong) {
      searchTasks.push((async () => {
        try {
          const response = await fetch(
            `/api/hong-kong?q=${encodeURIComponent(term)}`
          );
          const data: HongKongResponse = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "The Hong Kong search failed.");
          }

          const records = data.results ?? [];
          setHongKongResults(records);
          setHongKongNotice(data.notice ?? "");
          setHongKongLastUpdated(data.lastUpdated ?? "");
          setHongKongStatus(
            `Hong Kong product matches: ${
              data.totalCount ?? records.length
            }. Showing ${data.count ?? records.length}.`
          );
          setSourceStates((current) => ({
            ...current,
            hongKong: records.length > 0 ? "found" : "empty",
          }));
        } catch (error) {
          setSourceStates((current) => ({ ...current, hongKong: "error" }));
          setHongKongStatus(
            error instanceof Error
              ? error.message
              : "The Hong Kong search failed. Please try again."
          );
        }
      })());
    }

    if (searchUkDmd) {
      searchTasks.push((async () => {
        try {
          const response = await fetch(
            `/api/uk-dmd?q=${encodeURIComponent(term)}`
          );
          const data: UkDmdResponse = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "The UK dm+d search failed.");
          }

          const records = data.results ?? [];
          setUkDmdResults(records);
          setUkDmdNotice(data.notice ?? "");
          setUkDmdReleaseDate(data.releaseDate ?? "");
          setUkDmdStatus(`UK dm+d actual-product matches: ${data.count ?? records.length}.`);
          setSourceStates((current) => ({
            ...current,
            ukDmd: records.length > 0 ? "found" : "empty",
          }));
        } catch (error) {
          setUkDmdStatus(
            error instanceof Error
              ? error.message
              : "The UK dm+d search failed. Please try again."
          );
          setSourceStates((current) => ({ ...current, ukDmd: "error" }));
        }
      })());
    }

    if (searchEma) {
      searchTasks.push((async () => {
        try {
          const response = await fetch(
            `/api/ema?q=${encodeURIComponent(term)}&euOnly=${emaEuOnly}`
          );
          const data: EmaResponse = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "The EMA PMS search failed.");
          }

          const records = data.results ?? [];
          setEmaResults(records);
          setEmaNotice(data.notice ?? "");
          setEmaStatus(`EMA PMS matches: ${data.count ?? records.length}.`);
          setSourceStates((current) => ({
            ...current,
            emaPms: records.length > 0 ? "found" : "empty",
          }));
        } catch (error) {
          setEmaStatus(
            error instanceof Error
              ? error.message
              : "The EMA PMS search failed. Please try again."
          );
          setSourceStates((current) => ({ ...current, emaPms: "error" }));
        }
      })());
    }

    if (searchEma) {
      searchTasks.push((async () => {
        try {
          const response = await fetch(`/api/ema-epi?q=${encodeURIComponent(term)}`);
          const data: EpiResponse = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "The public EMA ePI search failed.");
          }

          const records = data.results ?? [];
          const documentCount = records.reduce(
            (count, product) => count + product.documents.length,
            0
          );
          setEpiResults(records);
          setEpiNotice(data.notice ?? "");
          setEpiStatus(
            `EMA ePI product records: ${data.count ?? records.length}. Documents: ${documentCount}.`
          );
          setSourceStates((current) => ({
            ...current,
            emaEpi: records.length > 0 ? "found" : "empty",
          }));
        } catch (error) {
          setEpiStatus(
            error instanceof Error
              ? error.message
              : "The public EMA ePI search failed. Please try again."
          );
          setSourceStates((current) => ({ ...current, emaEpi: "error" }));
        }
      })());
    }

    await Promise.all(searchTasks);
  }

  const dashboardItems: { key: SearchSource; label: string; count: number }[] = [
    { key: "hongKong", label: "Hong Kong", count: hongKongResults.length },
    { key: "fdaLabel", label: "FDA Label", count: results.length },
    {
      key: "fdaApplication",
      label: "FDA Application",
      count: approvalResults.length,
    },
    {
      key: "healthCanada",
      label: "Health Canada",
      count: healthCanadaResults.length,
    },
    { key: "ukDmd", label: "UK dm+d", count: ukDmdResults.length },
    { key: "emaPms", label: "EMA PMS", count: emaResults.length },
    { key: "emaEpi", label: "EMA ePI", count: epiResults.length },
  ];

  return (
    <main className="page">
      <header className="hero">
        <div className="hero-topline">
          <p className="eyebrow">MEDICINES REGULATORY REFERENCE</p>
          <fieldset className="theme-control">
            <legend className="sr-only">Color theme</legend>
            {(["light", "dark", "system"] as const).map((mode) => (
              <label
                className={`theme-option${themeMode === mode ? " selected" : ""}`}
                key={mode}
              >
                <input
                  className="theme-radio"
                  type="radio"
                  name="theme-mode"
                  value={mode}
                  checked={themeMode === mode}
                  onChange={() => saveTheme(mode)}
                />
                <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <h1>Medicine Regulatory Search</h1>
        <p className="intro">
          Search medicine records across five active jurisdictions,
          including EMA PMS data and public EMA ePI documents.
        </p>
      </header>

      <section className="search-panel">
        <h2>Search medicines</h2>
        <form onSubmit={searchMedicines} className="search-form">
          <label htmlFor="medicine">Medicine or ingredient name</label>
          <div className="search-row">
            <input
              id="medicine"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. acetaminophen"
              maxLength={100}
            />
            <button type="submit">Search</button>
          </div>

          <label htmlFor="country">Regulatory jurisdiction</label>
          <select
            id="country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option>All</option>
            {sources.map((source) => (
              <option key={source.country}>{source.country}</option>
            ))}
          </select>
        </form>

        <p className="help">
          Live medicine records are connected to the US FDA, Health
          Canada Drug Product Database, Hong Kong registered
          pharmaceutical products list, the UK dm+d service, and two
          distinct EMA sources: PMS product data and public ePI documents.
          Other jurisdictions link to their official sources below.
        </p>
      </section>

      {searchedTerm && (
        <section
          className="dashboard-panel"
          aria-label="Search result summary"
          aria-live="polite"
        >
          <div className="dashboard-heading">
            <h2>Search overview</h2>
            <p>Query: {searchedTerm}</p>
          </div>
          <div className="dashboard-grid">
            {dashboardItems.map((item) => {
              const state = sourceStates[item.key];
              const detail =
                state === "found"
                  ? `${item.count} ${item.count === 1 ? "result" : "results"}`
                  : searchStateLabels[state];

              return (
                <div className="dashboard-item" key={item.key}>
                  <span className="dashboard-source">{item.label}</span>
                  <span className={`dashboard-state ${state}`}>{detail}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(hongKongStatus || hongKongResults.length > 0) && (
        <section className="results-section" aria-live="polite">
          <h2>Hong Kong registered pharmaceutical products</h2>
          <p className="status">{hongKongStatus}</p>
          {hongKongLastUpdated && (
            <p className="help">Feed last updated: {hongKongLastUpdated}</p>
          )}

          {hongKongNotice && <p className="notice">{hongKongNotice}</p>}

          {hongKongResults.map((record, index) => (
            <article
              className="result-card"
              key={`${record.permitNumber}-${index}`}
            >
              <div className="result-heading">
                <h3>{record.productName}</h3>
                <span className="tag">Registered product listing</span>
              </div>
              <MatchProvenance reasons={record.matchedBy} />
              <p>
                <strong>Hong Kong registration number:</strong>{" "}
                {record.permitNumber}
              </p>
              <p>
                <strong>Registration certificate holder:</strong>{" "}
                {record.certificateHolder}
              </p>
              <p>
                <strong>Active ingredients:</strong>{" "}
                {record.activeIngredients.join(", ") || "Not listed"}
              </p>
              <p>
                <a href={record.officialRecord} target="_blank" rel="noreferrer">
                  Search the official Hong Kong Drug Office database
                </a>
              </p>
            </article>
          ))}

          {hongKongResults.length === 0 &&
            !hongKongStatus.startsWith("Searching") && (
              <p>No matching Hong Kong product records were returned.</p>
            )}
        </section>
      )}

      {status && (
        <section className="results-section" aria-live="polite">
          <h2>FDA label records</h2>
          <p className="status">{status}</p>

          {notice && <p className="notice">{notice}</p>}

          {results.map((record, index) => (
            <article
              className="result-card"
              key={`${record.labelId ?? "label"}-${index}`}
            >

<div className="result-heading">
  <h3>{record.brandName}</h3>
  <span className="tag">FDA label record</span>
</div>
<MatchProvenance reasons={record.matchedBy} />

{isMatchableApplicationNumber(record.applicationNumber) ? (
  hasExactApplicationMatch(
    record.applicationNumber,
    approvalResults
  ) ? (
    <p>
      <strong>Cross-dataset match:</strong>{" "}
      Exact application number confirmed in the returned
      Drugs@FDA records, including direct application-number lookups.
    </p>
  ) : directLookupFailures.includes(
      normalizeApplicationNumber(record.applicationNumber)
    ) ? (
    <p>
      <strong>Cross-dataset match:</strong>{" "}
      Direct application-number lookup could not be completed.
      The match remains unverified; this does not establish
      that the medicine is unapproved.
    </p>
  ) : (
    <p>
      <strong>Cross-dataset match:</strong>{" "}
      No exact match was found in the returned application records,
      including direct application-number lookups. This is
      inconclusive and does not establish that the medicine
      is unapproved.
    </p>
  )
) : (
  <p>
    <strong>Cross-dataset match:</strong>{" "}
    Not established — a usable application number is unavailable
    in this label record.
  </p>
)}

              <p>
                <strong>Generic name:</strong> {record.genericName}
              </p>
              <p>
                <strong>Manufacturer:</strong> {record.manufacturer}
              </p>
              <p>
                <strong>Dosage form:</strong> {record.dosageForm}
              </p>
              <p>
                <strong>Route:</strong> {record.route}
              </p>
              <p>
                <strong>Label effective date:</strong>{" "}
                {record.labelEffectiveDate || "Not listed"}
              </p>
              {record.applicationNumber && (
                <p>
                  <strong>Application number:</strong>{" "}
                  {record.applicationNumber}
                </p>
              )}
              {record.productNdc && (
                <p>
                  <strong>Product NDC:</strong> {record.productNdc}
                </p>
              )}
              {record.labelId && (
                <p>
                  <strong>Label ID:</strong> {record.labelId}
                </p>
              )}
              <p>
                {record.labelSetId ? (
                  <a
                    href={dailyMedLabelUrl(record.labelSetId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open this DailyMed label
                  </a>
                ) : (
                  <a
                    href={dailyMedSearchUrl(
                      searchedTerm || record.brandName
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Search official DailyMed labels
                  </a>
                )}
              </p>
            </article>
          ))}

          {results.length > 0 && (
            <p className="notice">
              These results are label records, not confirmation
              of current FDA approval. Verify regulatory status
              using the relevant official approval database.
            </p>
          )}

          {searchedTerm && (
            <p className="help">
              Search term: {searchedTerm}
            </p>
          )}
        </section>
      )}

{(approvalStatus || approvalResults.length > 0) && (
  <section className="results-section" aria-live="polite">
    <h2>FDA application records</h2>
    <p className="status">{approvalStatus}</p>

    {approvalNotice && (
      <p className="notice">{approvalNotice}</p>
    )}

    {approvalResults.map((record, index) => (
      <article
        className="result-card"
        key={`${record.applicationNumber}-${index}`}
      >
        <div className="result-heading">
          <h3>{record.applicationNumber}</h3>
          <span className="tag">Application record</span>
        </div>

        <p>
          <strong>Sponsor:</strong> {record.sponsor}
        </p>

        <h4 className="application-subheading">Products in this application</h4>

        {record.products.map((product, productIndex) => (
          <div key={`${product.brandName}-${productIndex}`}>
            <p>
              <strong>Brand:</strong> {product.brandName}
            </p>
            <MatchProvenance reasons={product.matchedBy} />
            <p>
              <strong>Ingredients:</strong>{" "}
              {product.ingredients
                .map((ingredient) =>
                  `${ingredient.name} (${ingredient.strength})`
                )
                .join(", ") || "Not listed"}
            </p>
            <p>
              <strong>Dosage form:</strong> {product.dosageForm}
            </p>
            <p>
              <strong>Route:</strong> {product.route}
            </p>
            <p>
              <strong>Reported marketing status:</strong>{" "}
              {product.marketingStatus}
            </p>
          </div>
        ))}

        <h4 className="application-subheading">Submission history</h4>

        {record.submissions.slice(0, 3).map((submission, i) => (
          <p key={`${submission.number}-${i}`}>
            <strong>{submission.type}</strong>
            {" — "}
            {submission.status}
            {" ("}
            {submission.statusDate}
            {")"}
          </p>
        ))}

        <p>
          <a
            href={record.officialRecord}
            target="_blank"
            rel="noreferrer"
          >
            Verify in official FDA database ↗
          </a>
        </p>
      </article>
    ))}

    {approvalResults.length === 0 && (
      <p>
        No matching application records were returned. This
        does not establish that the medicine is unapproved.
      </p>
    )}

    <p className="notice">
      Application records are supporting regulatory evidence,
      not an automatic confirmation of current approval.
      Verify the specific product and its regulatory history
      in the official FDA database.
    </p>

    <p className="notice">
      Status assessment: Not yet determined at the product level.
      A matching application number is a record-linking result,
      not a complete assessment of current authorisation,
      marketing status, or product-specific approval history.
    </p>

  </section>
)}

      {(healthCanadaStatus || healthCanadaResults.length > 0) && (
        <section className="results-section" aria-live="polite">
          <h2>Health Canada Drug Product Database</h2>
          <p className="status">{healthCanadaStatus}</p>

          {healthCanadaNotice && (
            <p className="notice">{healthCanadaNotice}</p>
          )}

          {healthCanadaResults.map((record) => (
            <article className="result-card" key={record.drugCode}>
              <div className="result-heading">
                <h3>{record.brandName}</h3>
                <span className="tag">Health Canada DPD</span>
              </div>
              <MatchProvenance reasons={record.matchedBy} />

              <p><strong>DIN:</strong> {record.din}</p>
              <p><strong>Manufacturer:</strong> {record.manufacturer}</p>
              <p><strong>Product class:</strong> {record.className}</p>
              {record.descriptor && (
                <p><strong>Descriptor:</strong> {record.descriptor}</p>
              )}
              <p>
                <strong>Ingredients:</strong>{" "}
                {record.ingredients
                  .map((ingredient) => `${ingredient.name} (${ingredient.strength})`)
                  .join(", ") || "Not listed"}
              </p>
              <p>
                <strong>Dosage form:</strong>{" "}
                {record.dosageForms.join(", ") || "Not listed"}
              </p>
              <p>
                <strong>Route:</strong>{" "}
                {record.routes.join(", ") || "Not listed"}
              </p>
              <p><strong>Reported DPD status:</strong> {record.status}</p>
              <p><strong>Status history date:</strong> {record.statusDate}</p>
              <p>
                <strong>Original market date:</strong>{" "}
                {record.originalMarketDate}
              </p>
              <p><strong>Record last updated:</strong> {record.lastUpdated}</p>
              <p>
                <a href={record.officialRecord} target="_blank" rel="noreferrer">
                  Open official Health Canada product record
                </a>
              </p>
            </article>
          ))}

          {healthCanadaResults.length === 0 &&
            !healthCanadaStatus.startsWith("Searching") && (
              <p>No matching Health Canada product records were returned.</p>
            )}
        </section>
      )}

      {(ukDmdStatus || ukDmdResults.length > 0) && (
        <section className="results-section" aria-live="polite">
          <h2>UK dm+d actual products</h2>
          <p className="status">{ukDmdStatus}</p>
          {ukDmdReleaseDate && (
            <p className="help">dm+d data release: {ukDmdReleaseDate}</p>
          )}

          {ukDmdNotice && <p className="notice">{ukDmdNotice}</p>}

          {ukDmdResults.map((record) => (
            <article className="result-card" key={`${record.type}-${record.id}`}>
              <div className="result-heading">
                <h3>{record.name}</h3>
                <span className="tag">{record.type} | Actual product</span>
              </div>
              <MatchProvenance reasons={record.matchedBy} />
              <p><strong>dm+d APID:</strong> {record.id}</p>
              <p>
                <a
                  href="https://products.mhra.gov.uk/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Verify in the official MHRA products database
                </a>
              </p>
            </article>
          ))}

          {ukDmdResults.length === 0 && sourceStates.ukDmd === "empty" && (
              <p>No matching UK dm+d product names were returned.</p>
            )}
        </section>
      )}

      {(emaStatus || emaResults.length > 0) && (
        <section className="results-section" aria-live="polite">
          <h2>EMA PMS medicinal product search</h2>
          <p className="status">{emaStatus}</p>

          {emaNotice && <p className="notice">{emaNotice}</p>}

          <div className="ema-scope">
            <label htmlFor="ema-scope">EMA PMS scope:</label>
            <select
              id="ema-scope"
              value={emaEuOnly ? "eu" : "all"}
              onChange={(event) => setEmaEuOnly(event.target.value === "eu")}
            >
              <option value="eu">EU/EEA products only</option>
              <option value="all">All products (including non-EU)</option>
            </select>
          </div>

          {emaResults
            .filter((record) =>
              emaEuOnly
                ? isEmaEuDomain(record.domainCode, record.domainLabel)
                : true
            )
            .map((record, index) => (
              <article
                className="result-card"
                key={`${record.productName}-${index}`}
              >
                <div className="result-heading">
                  <h3>{record.productName}</h3>
                  <span className="tag">EMA PMS</span>
                </div>
              <MatchProvenance reasons={record.matchedBy} />
              <p>
                <strong>FHIR product name:</strong> {record.productName}
              </p>
              <p>
                <strong>FHIR active substance:</strong> {record.activeSubstance}
              </p>
              {record.activeSubstanceParts.length > 0 && (
                <p>
                  <strong>FHIR active substance parts:</strong> {record.activeSubstanceParts.join(" / ")}
                </p>
              )}
              <p>
                <strong>FHIR resource ID:</strong> {record.fhirResourceId}
              </p>
              <p>
                <strong>FHIR dose form:</strong> {record.doseFormLabel === "Code label not returned by the EMA API"
                  ? record.doseFormCode
                  : `${record.doseFormCode} (${record.doseFormLabel})`}
              </p>
              <p>
                <strong>FHIR domain:</strong> {record.domainLabel === "Code label not returned by the EMA API"
                  ? record.domainCode
                  : `${record.domainCode} (${record.domainLabel})`}
              </p>
              <p>
                <strong>FHIR identifier value:</strong> {record.identifierValue}
              </p>
              <p>
                <a href={record.publicRecordUrl || record.officialRecord} target="_blank" rel="noreferrer">
                  Search the EMA public medicines portal
                </a>
              </p>
            </article>
          ))}

          {emaResults
            .filter((record) =>
              emaEuOnly
                ? isEmaEuDomain(record.domainCode, record.domainLabel)
                : true
            ).length === 0 && sourceStates.emaPms === "empty" && (
            <p>No matching EMA PMS product records were returned.</p>
          )}
        </section>
      )}

      {(epiStatus || epiResults.length > 0) && (
        <section className="results-section" aria-live="polite">
          <h2>EMA ePI product information documents</h2>
          <p className="status">{epiStatus}</p>
          {epiNotice && <p className="notice">{epiNotice}</p>}

          {epiResults.map((product) => (
            <article className="result-card" key={product.listId}>
              <div className="result-heading">
                <h3>{product.productName}</h3>
                <span className="tag">Public EMA ePI</span>
              </div>
              <MatchProvenance reasons={product.matchedBy} />
              <p><strong>PI List ID:</strong> {product.listId}</p>
              <p><strong>ePI identifier:</strong> {product.identifier}</p>
              <p><strong>Marketing authorisation holder:</strong> {product.marketingAuthorisationHolder}</p>
              <p><strong>Regulatory agency:</strong> {product.regulatoryAgency}</p>

              {product.documents.length > 0 ? (
                <div className="epi-documents">
                  <h4 className="application-subheading">Published documents</h4>
                  {product.documents.map((document) => (
                    <details className="epi-document" key={document.id}>
                      <summary>
                        {document.type} | {document.language} | {document.date}
                      </summary>
                      <p>
                        <a href={document.url} target="_blank" rel="noreferrer">
                          Open original FHIR Bundle
                        </a>
                      </p>
                      {document.sections.length > 0 ? (
                        <EpiSectionList sections={document.sections} />
                      ) : (
                        <p>Document sections were not included in this Bundle.</p>
                      )}
                    </details>
                  ))}
                </div>
              ) : (
                <p>No document Bundles were returned for this PI List.</p>
              )}
            </article>
          ))}

          {epiResults.length === 0 && sourceStates.emaEpi === "empty" && (
            <p>No published EMA ePI titles matched this search. The public API covers ePIs published during the EU pilot.</p>
          )}
        </section>
      )}

      <section className="sources-section">
        <h2>Official regulatory sources</h2>
        <p className="help">
          Use these official portals to independently verify
          registration and authorisation status.
        </p>

        <div className="source-grid">
          {sources.map((source) => (
            <article className="source-card" key={source.country}>
              <p className="country">{source.country}</p>
              <h3>{source.name}</h3>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                Open official source ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      <footer>
        Prototype for research purposes. Always verify medicine
        status with the relevant regulator. No result or missing
        record should be interpreted as definitive proof of
        approval or non-approval.
      </footer>

      <style jsx>{`
        .page {
          max-width: 1000px;
          margin: 0 auto;
          padding: 40px 22px;
          color: var(--text-primary);
          font-family: var(--font-geist-sans), Arial, sans-serif;
        }
        .hero {
          background: var(--hero-background);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 32px;
          margin-bottom: 24px;
        }
        .hero-topline {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }
        .eyebrow, .country {
          color: var(--accent);
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0;
        }
        .eyebrow {
          margin: 8px 0;
        }
        .theme-control {
          display: inline-flex;
          flex: 0 0 auto;
          gap: 2px;
          margin: 0 0 0 auto;
          padding: 4px;
          border: 1px solid var(--border-strong);
          border-radius: 8px;
          background: var(--surface);
        }
        .theme-option {
          position: relative;
          display: inline-flex;
          align-items: center;
          min-height: 36px;
          padding: 0 10px;
          border-radius: 5px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 13px;
          font-weight: 650;
        }
        .theme-option.selected {
          background: var(--accent);
          color: var(--accent-contrast);
        }
        .theme-option:focus-within {
          outline: 3px solid var(--focus-ring);
          outline-offset: 2px;
          z-index: 1;
        }
        .theme-radio {
          position: absolute;
          width: 1px;
          height: 1px;
          margin: 0;
          opacity: 0;
        }
        .theme-radio:focus-visible {
          outline: none;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        h1 {
          font-size: 44px;
          margin: 10px 0;
        }
        h2 {
          margin-top: 0;
          color: var(--text-primary);
        }
        .intro {
          line-height: 1.6;
          max-width: 650px;
          color: var(--text-secondary);
        }
        .search-panel, .result-card, .source-card, .dashboard-panel {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 22px;
          margin-bottom: 16px;
          background: var(--surface);
          color: var(--text-primary);
        }
        .dashboard-panel {
          padding: 18px 22px;
        }
        .dashboard-heading {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 16px;
          margin-bottom: 12px;
        }
        .dashboard-heading h2,
        .dashboard-heading p {
          margin: 0;
        }
        .dashboard-heading h2 {
          font-size: 18px;
        }
        .dashboard-heading p {
          color: var(--text-secondary);
          font-size: 14px;
          overflow-wrap: anywhere;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }
        .dashboard-item {
          display: grid;
          gap: 5px;
          min-width: 0;
          padding: 8px 14px;
          border-left: 1px solid var(--border);
        }
        .dashboard-item:first-child {
          padding-left: 0;
          border-left: 0;
        }
        .dashboard-source {
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 650;
        }
        .dashboard-state {
          font-size: 14px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        .dashboard-state.found {
          color: var(--state-found);
        }
        .dashboard-state.empty {
          color: var(--state-empty);
        }
        .dashboard-state.error {
          color: var(--state-error);
        }
        .dashboard-state.searching {
          color: var(--state-pending);
        }
        .dashboard-state.idle,
        .dashboard-state.not-searched {
          color: var(--text-secondary);
        }
        .search-form {
          display: grid;
          gap: 10px;
        }
        label {
          font-size: 14px;
          font-weight: bold;
          color: var(--text-primary);
        }
        .search-row {
          display: flex;
          gap: 10px;
        }
        input, select {
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border-strong);
          border-radius: 6px;
          font-size: 16px;
          background: var(--surface);
          color: var(--text-primary);
        }
        .search-row input {
          flex: 1;
          min-width: 0;
        }
        button {
          padding: 12px 20px;
          border: 1px solid var(--accent);
          border-radius: 6px;
          background: var(--accent);
          color: var(--accent-contrast);
          font-weight: bold;
          cursor: pointer;
        }
        button:hover {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
        }
        .help {
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }
        .status {
          font-weight: bold;
        }
        .notice {
          background: var(--notice-background);
          border-left: 4px solid var(--notice-border);
          padding: 12px;
          line-height: 1.6;
          font-size: 14px;
          color: var(--notice-text);
        }
        .result-heading {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }
        .result-heading h3 {
          margin: 0;
          color: var(--text-primary);
          overflow-wrap: anywhere;
        }
        .tag {
          border-radius: 4px;
          padding: 5px 9px;
          background: var(--tag-background);
          color: var(--tag-text);
          font-size: 12px;
          font-weight: 650;
        }
        .application-subheading {
          margin: 22px 0 12px;
          padding: 10px 12px;
          border-left: 4px solid var(--accent);
          border-bottom: 1px solid var(--border);
          background: var(--surface-subtle);
          color: var(--text-primary);
          font-size: 17px;
          line-height: 1.35;
        }
        .result-card p {
          overflow-wrap: anywhere;
          line-height: 1.5;
          color: var(--text-primary);
        }
        .result-card .match-provenance {
          margin-top: 8px;
          color: var(--text-secondary);
          font-size: 13px;
        }
        .source-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 14px;
        }
        .source-card {
          margin: 0;
        }
        .source-card h3 {
          font-size: 17px;
          line-height: 1.4;
          color: var(--text-primary);
        }
        a {
          color: var(--link);
          overflow-wrap: anywhere;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }
        a:hover {
          text-decoration-thickness: 2px;
        }
        footer {
          margin-top: 30px;
          padding-top: 18px;
          border-top: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.6;
        }
        @media (max-width: 520px) {
          .page {
            padding: 20px 14px;
          }
          .hero {
            padding: 22px;
          }
          h1 {
            font-size: 32px;
          }
          .hero-topline {
            flex-wrap: wrap;
          }
          .theme-control {
            max-width: 100%;
          }
          .theme-option {
            padding: 0 8px;
            font-size: 12px;
          }
          .dashboard-panel {
            padding: 16px;
          }
          .dashboard-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .dashboard-item {
            padding: 10px 8px;
            border-left: 0;
            border-top: 1px solid var(--border);
          }
          .dashboard-item:first-child {
            padding-left: 8px;
            border-top: 0;
          }
          .dashboard-item:nth-child(2) {
            border-top: 0;
          }
          .dashboard-item:nth-child(odd) {
            border-right: 1px solid var(--border);
          }
          .dashboard-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 6px;
          }
          .search-row {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
