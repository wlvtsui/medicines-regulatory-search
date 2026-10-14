
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const term = searchParams.get("q")?.trim();

  if (!term) {
    return Response.json(
      { error: "Please provide a medicine name using ?q=" },
      { status: 400 }
    );
  }

  if (term.length > 100 || !/^[a-zA-Z0-9\s.'-]+$/.test(term)) {
    return Response.json(
      { error: "Use a medicine name with letters or numbers only." },
      { status: 400 }
    );
  }

  const search = [
    `openfda.generic_name:"${term}"`,
    `openfda.brand_name:"${term}"`,
  ].join(" OR ");

  const url = new URL("https://api.fda.gov/drug/label.json");
  url.searchParams.set("search", search);
  url.searchParams.set("limit", "10");

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
    });

    if (response.status === 404) {
      return Response.json({
        source: "US FDA openFDA drug labels",
        query: term,
        count: 0,
        results: [],
        message: "No matching label records were returned.",
      });
    }

    if (!response.ok) {
      return Response.json(
        { error: "The FDA data service is temporarily unavailable." },
        { status: 502 }
      );
    }

    const data = await response.json();

    const results = (data.results ?? []).map(
      (record: {
        openfda?: {
          brand_name?: string[];
          generic_name?: string[];
          manufacturer_name?: string[];
          dosage_form?: string[];
          route?: string[];
          application_number?: string[];
          product_ndc?: string[];
          spl_id?: string[];
          spl_set_id?: string[];
        };
        set_id?: string;
        effective_time?: string;
      }) => ({
        brandName: record.openfda?.brand_name?.[0] ?? "Not listed",
        genericName:
          record.openfda?.generic_name?.[0] ?? "Not listed",
        manufacturer:
          record.openfda?.manufacturer_name?.[0] ?? "Not listed",
        dosageForm:
          record.openfda?.dosage_form?.[0] ?? "Not listed",
        route: record.openfda?.route?.[0] ?? "Not listed",
        applicationNumber:
          record.openfda?.application_number?.[0] ?? null,
        productNdc: record.openfda?.product_ndc?.[0] ?? null,
        labelId: record.openfda?.spl_id?.[0] ?? null,
        labelSetId:
          record.openfda?.spl_set_id?.[0] ?? record.set_id ?? null,
        labelEffectiveDate: record.effective_time ?? null,
      })
    );

    return Response.json({
      source: "US FDA openFDA drug labels",
      query: term,
      count: results.length,
      results,
      notice:
        "These are label records, not confirmation of current FDA approval.",
    });
  } catch {
    return Response.json(
      { error: "Could not connect to the FDA data service." },
      { status: 502 }
    );
  }
}
