
type Ingredient = {
  name?: string;
  strength?: string;
};

type Product = {
  brand_name?: string;
  active_ingredients?: Ingredient[];
  dosage_form?: string;
  route?: string;
  marketing_status?: string;
};

type Submission = {
  submission_type?: string;
  submission_status?: string;
  submission_status_date?: string;
  submission_number?: string;
};

type FDAApplication = {
  application_number?: string;
  sponsor_name?: string;
  products?: Product[];
  submissions?: Submission[];
};

const DRUGS_AT_FDA_HOME =
  "https://www.accessdata.fda.gov/scripts/cder/daf/";

function drugsAtFdaOverviewUrl(
  applicationNumber: string | undefined
): string {
  const normalized = (applicationNumber ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const match = normalized.match(/^(?:NDA|ANDA|BLA)(\d+)$/);

  if (!match) {
    return DRUGS_AT_FDA_HOME;
  }

  const applNo = match[1].padStart(6, "0");

  return `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${encodeURIComponent(applNo)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const applicationNumber =
    searchParams.get("applicationNumber")?.trim().toUpperCase();

  const term = searchParams.get("q")?.trim();

  let search: string;
  let query: string;
  let searchMode: "application number" | "medicine name";

  if (applicationNumber) {
    const normalizedNumber = applicationNumber.replace(/\s+/g, "");

    if (!/^(NDA|ANDA|BLA)\d+$/.test(normalizedNumber)) {
      return Response.json(
        {
          error:
            "Enter a valid FDA application number, such as ANDA207229.",
        },
        { status: 400 }
      );
    }

    query = normalizedNumber;
    searchMode = "application number";
    search = `application_number:"${normalizedNumber}"`;
  } else {
    if (!term) {
      return Response.json(
        {
          error:
            "Enter a medicine name using ?q= or an FDA application number using ?applicationNumber=",
        },
        { status: 400 }
      );
    }

    if (
      term.length > 100 ||
      !/^[a-zA-Z0-9\s.'-]+$/.test(term)
    ) {
      return Response.json(
        {
          error:
            "Please use letters, numbers, spaces, or basic punctuation.",
        },
        { status: 400 }
      );
    }

    query = term;
    searchMode = "medicine name";

    search = [
      `products.brand_name:"${term}"`,
      `products.active_ingredients.name:"${term}"`,
    ].join(" OR ");
  }

  const url = new URL(
    "https://api.fda.gov/drug/drugsfda.json"
  );

  url.searchParams.set("search", search);
  url.searchParams.set("limit", "10");

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (response.status === 404) {
      return Response.json({
        source: "US FDA Drugs@FDA",
        query,
        searchMode,
        count: 0,
        results: [],
        message:
          "No matching application records were returned. This does not establish that a medicine is unapproved.",
      });
    }

    if (!response.ok) {
      return Response.json(
        {
          error:
            "The FDA approval-record service returned an error.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    const results = (
      (data.results as FDAApplication[] | undefined) ?? []
    ).map((record) => ({
      applicationNumber:
        record.application_number ?? "Not listed",

      sponsor:
        record.sponsor_name ?? "Not listed",

      products: (record.products ?? []).map((product) => ({
        brandName: product.brand_name ?? "Not listed",

        ingredients: (product.active_ingredients ?? []).map(
          (ingredient) => ({
            name: ingredient.name ?? "Not listed",
            strength: ingredient.strength ?? "Not listed",
          })
        ),

        dosageForm: product.dosage_form ?? "Not listed",
        route: product.route ?? "Not listed",

        marketingStatus:
          product.marketing_status ?? "Not listed",
      })),

      submissions: (record.submissions ?? []).map(
        (submission) => ({
          type: submission.submission_type ?? "Not listed",
          status: submission.submission_status ?? "Not listed",
          statusDate:
            submission.submission_status_date ?? "Not listed",
          number:
            submission.submission_number ?? "Not listed",
        })
      ),

      officialRecord: drugsAtFdaOverviewUrl(
        record.application_number
      ),
    }));

    return Response.json({
      source: "US FDA Drugs@FDA",
      query,
      searchMode,
      count: results.length,
      results,
      notice:
        "These are FDA application records. Verify the application, specific product, and submission history in the official FDA database before assigning a current approval status.",
    });
  } catch {
    return Response.json(
      {
        error:
          "Could not connect to the FDA data service.",
      },
      { status: 502 }
    );
  }
}
