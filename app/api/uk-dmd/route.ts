import { normalizeMedicineQuery, type MedicineMatchReason } from "@/lib/medicine-search";

type DmdResult = {
  id: string;
  type: string;
  name: string;
  matchedBy: MedicineMatchReason[];
};

type DmdApiResponse = {
  table?: string;
  query?: string;
  results?: unknown;
  pagination?: { total?: number };
  error?: string;
  message?: string;
};

const DMDAPI_SEARCH_URL = "https://www.dmdapi.co.uk/api/v1/amp/search";

function readString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
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

  const apiKey = process.env.DMDAPI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "UK actual-product search is not configured. Set DMDAPI_API_KEY." },
      { status: 503 }
    );
  }

  const url = new URL(DMDAPI_SEARCH_URL);
  url.searchParams.set("q", normalizeMedicineQuery(term));

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(20000),
    });
    const data: DmdApiResponse = await response.json();

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return Response.json(
          { error: "The dmdapi service rejected the configured API key." },
          { status: 503 }
        );
      }
      if (response.status === 429) {
        return Response.json(
          { error: "The dmdapi request limit has been reached. Please retry later." },
          { status: 429 }
        );
      }
      return Response.json(
        { error: data.message || data.error || "The dmdapi search service returned an error." },
        { status: 502 }
      );
    }

    if (!Array.isArray(data.results)) {
      return Response.json(
        { error: "The dmdapi search service returned an invalid response." },
        { status: 502 }
      );
    }

    const results: DmdResult[] = data.results.flatMap((value) => {
      if (!value || typeof value !== "object") {
        return [];
      }

      const record = value as Record<string, unknown>;
      const name = readString(record.name ?? record.description);
      const id = readString(record.apid ?? record.id ?? record.ampid);
      if (!name || !id) {
        return [];
      }

      return [{ id, type: "AMP", name, matchedBy: ["product-name"] }];
    });

    return Response.json({
      source: "NHS dm+d Actual Medicinal Products (AMP) via dmdapi.co.uk",
      query: term,
      releaseDate: null,
      count: results.length,
      totalCount: data.pagination?.total ?? results.length,
      results,
      notice:
        "Results are NHS dm+d Actual Medicinal Products (AMPs) returned by dmdapi.co.uk. A dm+d match does not establish MHRA authorisation; verify regulatory status in the official MHRA products database.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json(
        { error: "The dmdapi search timed out. Please try again." },
        { status: 504 }
      );
    }
    return Response.json(
      { error: "Could not connect to the dmdapi search service." },
      { status: 502 }
    );
  }
}