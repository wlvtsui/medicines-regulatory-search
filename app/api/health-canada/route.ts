type DpdProduct = {
  drug_code?: number;
  drug_identification_number?: string;
  brand_name?: string;
  class_name?: string;
  descriptor?: string;
  company_name?: string;
  last_update_date?: string;
};

type DpdIngredient = {
  drug_code?: number;
  ingredient_name?: string;
  strength?: string;
  strength_unit?: string;
};

type DpdStatus = {
  status?: string;
  history_date?: string;
  original_market_date?: string;
};

type DpdForm = {
  pharmaceutical_form_name?: string;
};

type DpdRoute = {
  route_of_administration_name?: string;
};

type HealthCanadaResult = {
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
};

const DPD_API = "https://health-products.canada.ca/api/drug/";
const RESULT_LIMIT = 10;

function asRecords<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }

  if (data && typeof data === "object" && !("error" in data)) {
    return [data as T];
  }

  return [];
}

async function fetchDpdRecords<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<T[]> {
  const url = new URL(endpoint, DPD_API);
  url.search = new URLSearchParams({
    ...params,
    lang: "en",
    type: "json",
  }).toString();

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error("Health Canada DPD request failed.");
  }

  return asRecords<T>(await response.json());
}

function nonEmpty(values: (string | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

export async function GET(request: Request) {
  const term = new URL(request.url).searchParams.get("q")?.trim();

  if (!term) {
    return Response.json(
      { error: "Please provide a medicine name using ?q=" },
      { status: 400 }
    );
  }

  if (
    term.length > 100 ||
    !/^[\p{L}\p{N}\s.'’&/-]+$/u.test(term)
  ) {
    return Response.json(
      { error: "Use a medicine name with letters, numbers, or basic punctuation." },
      { status: 400 }
    );
  }

  const [productSearch, ingredientSearch] = await Promise.allSettled([
    fetchDpdRecords<DpdProduct>("drugproduct/", { brandname: term }),
    fetchDpdRecords<DpdIngredient>("activeingredient/", {
      ingredientname: term,
    }),
  ]);

  const productRecords =
    productSearch.status === "fulfilled" ? productSearch.value : [];
  const ingredientRecords =
    ingredientSearch.status === "fulfilled" ? ingredientSearch.value : [];

  if (
    productSearch.status === "rejected" &&
    ingredientSearch.status === "rejected"
  ) {
    return Response.json(
      { error: "The Health Canada DPD service is temporarily unavailable." },
      { status: 502 }
    );
  }

  const productsByCode = new Map<number, DpdProduct>();
  const ingredientsByCode = new Map<number, DpdIngredient[]>();

  for (const product of productRecords) {
    if (typeof product.drug_code === "number") {
      productsByCode.set(product.drug_code, product);
    }
  }

  for (const ingredient of ingredientRecords) {
    if (typeof ingredient.drug_code !== "number") {
      continue;
    }

    const current = ingredientsByCode.get(ingredient.drug_code) ?? [];
    current.push(ingredient);
    ingredientsByCode.set(ingredient.drug_code, current);
  }

  const orderedDrugCodes = Array.from(
    new Set([
      ...productRecords.map((product) => product.drug_code),
      ...ingredientRecords.map((ingredient) => ingredient.drug_code),
    ])
  ).filter((drugCode): drugCode is number => typeof drugCode === "number");

  const selectedDrugCodes = orderedDrugCodes.slice(0, RESULT_LIMIT);
  let detailFailures = 0;

  const results = await Promise.all(
    selectedDrugCodes.map(async (drugCode): Promise<HealthCanadaResult> => {
      const product = productsByCode.get(drugCode);
      const knownIngredients = ingredientsByCode.get(drugCode) ?? [];
      const [productDetails, ingredientDetails, statuses, forms, routes] =
        await Promise.allSettled([
          product
            ? Promise.resolve([product])
            : fetchDpdRecords<DpdProduct>("drugproduct/", {
                id: String(drugCode),
              }),
          knownIngredients.length > 0
            ? Promise.resolve(knownIngredients)
            : fetchDpdRecords<DpdIngredient>("activeingredient/", {
                id: String(drugCode),
              }),
          fetchDpdRecords<DpdStatus>("status/", {
            id: String(drugCode),
          }),
          fetchDpdRecords<DpdForm>("form/", { id: String(drugCode) }),
          fetchDpdRecords<DpdRoute>("route/", { id: String(drugCode) }),
        ]);

      const resolvedProduct =
        productDetails.status === "fulfilled"
          ? productDetails.value[0]
          : product;
      const resolvedIngredients =
        ingredientDetails.status === "fulfilled"
          ? ingredientDetails.value
          : knownIngredients;
      const status = statuses.status === "fulfilled" ? statuses.value[0] : undefined;
      const resolvedForms = forms.status === "fulfilled" ? forms.value : [];
      const resolvedRoutes = routes.status === "fulfilled" ? routes.value : [];

      if (
        productDetails.status === "rejected" ||
        ingredientDetails.status === "rejected" ||
        statuses.status === "rejected" ||
        forms.status === "rejected" ||
        routes.status === "rejected"
      ) {
        detailFailures += 1;
      }

      return {
        drugCode,
        din: resolvedProduct?.drug_identification_number ?? "Not listed",
        brandName: resolvedProduct?.brand_name ?? "Not listed",
        manufacturer: resolvedProduct?.company_name ?? "Not listed",
        className: resolvedProduct?.class_name ?? "Not listed",
        descriptor: resolvedProduct?.descriptor ?? "",
        ingredients: resolvedIngredients.map((ingredient) => ({
          name: ingredient.ingredient_name ?? "Not listed",
          strength: [ingredient.strength, ingredient.strength_unit]
            .filter(Boolean)
            .join(" ") || "Not listed",
        })),
        dosageForms: nonEmpty(
          resolvedForms.map((form) => form.pharmaceutical_form_name)
        ),
        routes: nonEmpty(
          resolvedRoutes.map((route) => route.route_of_administration_name)
        ),
        status: status?.status ?? "Not listed",
        statusDate: status?.history_date ?? "Not listed",
        originalMarketDate: status?.original_market_date ?? "Not listed",
        lastUpdated: resolvedProduct?.last_update_date ?? "Not listed",
        officialRecord: `https://health-products.canada.ca/dpd-bdpp/info?lang=eng&code=${drugCode}`,
      };
    })
  );

  const notices = [
    "These are Health Canada Drug Product Database records. Reported product status is shown as supplied by the DPD and should be checked against the official record.",
  ];

  if (productSearch.status === "rejected" || ingredientSearch.status === "rejected") {
    notices.push("One of the DPD search methods was unavailable; results may be incomplete.");
  }

  if (detailFailures > 0) {
    notices.push("Some product details could not be retrieved.");
  }

  return Response.json({
    source: "Health Canada Drug Product Database",
    query: term,
    count: results.length,
    results,
    notice: notices.join(" "),
  });
}