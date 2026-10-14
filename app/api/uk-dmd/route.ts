type DmdResult = {
  id: number;
  type: string;
  name: string;
};

type DmdServiceResponse = {
  source?: string;
  query?: string;
  releaseDate?: string | null;
  count?: number;
  results?: DmdResult[];
  error?: string;
};

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

  const serviceUrl = process.env.DMD_SEARCH_API_URL;
  if (!serviceUrl) {
    return Response.json(
      { error: "UK dm+d search is not configured. Set DMD_SEARCH_API_URL." },
      { status: 503 }
    );
  }

  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    return Response.json(
      { error: "DMD_SEARCH_API_URL must be a valid absolute URL." },
      { status: 500 }
    );
  }

  url.searchParams.set("q", term);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data: DmdServiceResponse = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: data.error || "The UK dm+d search service returned an error." },
        { status: 502 }
      );
    }

    if (!Array.isArray(data.results)) {
      return Response.json(
        { error: "The UK dm+d search service returned an invalid response." },
        { status: 502 }
      );
    }

    return Response.json({
      source: data.source ?? "UK NHS Dictionary of Medicines and Devices (dm+d)",
      query: term,
      releaseDate: data.releaseDate ?? null,
      count: data.results.length,
      results: data.results,
      notice:
        "Results are token-prefix matches against dm+d product names, not an MHRA authorisation determination. Check the MHRA products database for regulatory status.",
    });
  } catch {
    return Response.json(
      { error: "Could not connect to the UK dm+d search service." },
      { status: 502 }
    );
  }
}