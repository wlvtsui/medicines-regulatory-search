import { XMLParser } from "fast-xml-parser";

type XmlRecord = Record<string, unknown>;

type HongKongRecord = {
  productName: string;
  certificateHolder: string;
  permitNumber: string;
  activeIngredients: string[];
  officialRecord: string;
};

const FEED_URL = "https://www.drugoffice.gov.hk/eps/psi/DrugList.xml";
const OFFICIAL_SEARCH_URL =
  "https://www.drugoffice.gov.hk/eps/do/en/consumer/search_drug_database2.html";
const RESULT_LIMIT = 10;

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
});

function asRecord(value: unknown): XmlRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  const record = asRecord(value);
  return typeof record?.["#text"] === "string"
    ? record["#text"].trim()
    : "";
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("q")?.trim();

  if (!term) {
    return Response.json(
      { error: "Please provide a medicine name using ?q=" },
      { status: 400 }
    );
  }

  if (term.length > 100 || /[\u0000-\u001f\u007f]/.test(term)) {
    return Response.json(
      { error: "Search terms must be 100 characters or fewer." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(FEED_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return Response.json(
        { error: "The Hong Kong pharmaceutical product feed is unavailable." },
        { status: 502 }
      );
    }

    const feed = asRecord(parser.parse(await response.text()));
    const feedRoot = asRecord(feed?.drugs);

    if (!feedRoot) {
      throw new Error("Unexpected Hong Kong product feed format.");
    }

    const lastUpdated = asText(feedRoot.lastUpdate) || "Not provided";
    const query = normalizeSearchText(term);
    const allProducts = asArray(feedRoot.drug)
      .map(asRecord)
      .filter((product): product is XmlRecord => Boolean(product));

    const matches = allProducts.flatMap((product): HongKongRecord[] => {
      const productName = asText(product.productName);
      const certificateHolder = asText(product.regCertHolderName);
      const permitNumber = asText(product.permitNo);
      const ingredientContainer = asRecord(product.activeIngs);
      const activeIngredients = asArray(ingredientContainer?.activeIng)
        .map(asText)
        .filter(Boolean);

      const matchesQuery =
        normalizeSearchText(productName).includes(query) ||
        activeIngredients.some((ingredient) =>
          normalizeSearchText(ingredient).includes(query)
        );

      return matchesQuery
        ? [
            {
              productName: productName || "Not listed",
              certificateHolder: certificateHolder || "Not listed",
              permitNumber: permitNumber || "Not listed",
              activeIngredients,
              officialRecord: OFFICIAL_SEARCH_URL,
            },
          ]
        : [];
    });

    const results = matches.slice(0, RESULT_LIMIT);

    return Response.json({
      source: "Hong Kong Department of Health List of Registered Pharmaceutical Products",
      query: term,
      lastUpdated,
      count: results.length,
      totalCount: matches.length,
      results,
      notice:
        "These results are entries in Hong Kong's registered pharmaceutical products list. The open-data feed does not include product-specific labels, dosage forms, or routes. Verify details in the official Drug Office database.",
    });
  } catch {
    return Response.json(
      { error: "Could not retrieve or parse the Hong Kong product feed." },
      { status: 502 }
    );
  }
}