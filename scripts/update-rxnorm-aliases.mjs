import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

const CURRENT_ARCHIVE_URL = "https://download.nlm.nih.gov/rxnorm/RxNorm_full_prescribe_current.zip";
const RELEASES_URL = "https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html";
const RXNAV_VERSION_URL = "https://rxnav.nlm.nih.gov/REST/version";
const TERMS_URL = "https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html";
const OUTPUT_PATH = path.join(process.cwd(), "data", "rxnorm-ingredient-aliases.json");
const ALLOWED_SOURCES = new Set(["RXNORM", "MTHSPL"]);
const INGREDIENT_TERM_TYPES = new Set(["IN", "PIN"]);
const ALIAS_TERM_TYPES = new Set(["IN", "PIN", "SY", "PSN"]);

function parseArchiveDate(value) {
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(2, 4));
  const year = Number(value.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid RxNorm release date in archive name: ${value}`);
  }

  return date.toISOString().slice(0, 10);
}

function parseRxNavVersionDate(value) {
  const match = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) {
    throw new Error(`Unexpected RxNav version date: ${value}`);
  }

  const monthNumbers = new Map([
    ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"],
    ["may", "05"], ["jun", "06"], ["jul", "07"], ["aug", "08"],
    ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
  ]);
  const month = monthNumbers.get(match[2].toLowerCase());
  if (!month) {
    throw new Error(`Unexpected RxNav version month: ${match[2]}`);
  }

  return `${match[3]}-${month}-${match[1]}`;
}

function normalizeTerm(value) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

async function getCurrentReleaseArchive() {
  console.log(`Downloading the current RxNorm subset from ${CURRENT_ARCHIVE_URL}`);
  const archiveResponse = await fetch(CURRENT_ARCHIVE_URL, {
    signal: AbortSignal.timeout(600000),
  });
  if (!archiveResponse.ok) {
    throw new Error(`NLM RxNorm archive returned HTTP ${archiveResponse.status}.`);
  }

  const archive = unzipSync(new Uint8Array(await archiveResponse.arrayBuffer()));
  const readmePath = Object.keys(archive).find((name) =>
    /(?:^|\/)Readme_Full_Prescribe_(\d{8})\.txt$/i.test(name)
  );
  if (!readmePath) {
    throw new Error("RxNorm archive did not contain its dated Current Prescribable Content README.");
  }

  const dateMatch = readmePath.match(/Readme_Full_Prescribe_(\d{8})\.txt$/i);
  const readme = new TextDecoder("utf-8").decode(archive[readmePath]);
  if (!dateMatch || !/Current Prescribable Content/i.test(readme)) {
    throw new Error("RxNorm archive README did not identify a Current Prescribable Content release.");
  }

  const releaseDate = parseArchiveDate(dateMatch[1]);
  const versionResponse = await fetch(RXNAV_VERSION_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!versionResponse.ok) {
    throw new Error(`RxNav version endpoint returned HTTP ${versionResponse.status}; refusing to update without a staleness check.`);
  }

  const versionXml = await versionResponse.text();
  const versionData = new XMLParser().parse(versionXml);
  const rxNavVersion = versionData?.rxnormdata?.version;
  if (typeof rxNavVersion !== "string") {
    throw new Error("RxNav version endpoint returned an unexpected response.");
  }

  const rxNavReleaseDate = parseRxNavVersionDate(rxNavVersion);
  if (releaseDate < rxNavReleaseDate) {
    throw new Error(
      `The current archive (${releaseDate}) is older than RxNav's dataset (${rxNavReleaseDate}); refusing to publish a stale index.`
    );
  }

  return { archive, releaseDate, rxNavReleaseDate };
}

function buildIngredientGroups(archive) {
  const consoPath = Object.keys(archive).find((name) =>
    /(?:^|\/)RXNCONSO\.RRF$/i.test(name)
  );
  if (!consoPath) {
    throw new Error("RXNCONSO.RRF was not present in the RxNorm archive.");
  }

  const content = new TextDecoder("utf-8").decode(archive[consoPath]);
  const concepts = new Map();

  for (const line of content.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const fields = line.split("|");
    if (fields.length < 18) {
      continue;
    }

    const rxCui = fields[0];
    const language = fields[1];
    const preferred = fields[6] === "Y";
    const source = fields[11];
    const termType = fields[12];
    const term = fields[14].trim();
    const suppress = fields[16];

    if (
      !rxCui ||
      language !== "ENG" ||
      suppress !== "N" ||
      !ALLOWED_SOURCES.has(source) ||
      !ALIAS_TERM_TYPES.has(termType) ||
      !term
    ) {
      continue;
    }

    let concept = concepts.get(rxCui);
    if (!concept) {
      concept = { ingredientType: undefined, preferredTerm: undefined, terms: new Map() };
      concepts.set(rxCui, concept);
    }

    if (source === "RXNORM" && INGREDIENT_TERM_TYPES.has(termType)) {
      if (!concept.ingredientType || (termType === "IN" && concept.ingredientType === "PIN")) {
        concept.ingredientType = termType;
      }
      if (preferred && (!concept.preferredTerm || termType === "IN")) {
        concept.preferredTerm = term;
      }
    }

    const normalized = normalizeTerm(term);
    const existing = concept.terms.get(normalized);
    if (!existing || (preferred && !existing.preferred)) {
      concept.terms.set(normalized, { name: term, preferred });
    }
  }

  const groups = [];
  for (const [rxCui, concept] of concepts) {
    if (!concept.ingredientType || concept.terms.size < 2) {
      continue;
    }

    const terms = Array.from(concept.terms.values())
      .sort((left, right) => {
        if (left.preferred !== right.preferred) {
          return left.preferred ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "en");
      })
      .map((entry) => entry.name);

    groups.push({
      conceptId: `RXCUI:${rxCui}`,
      ingredientType: concept.ingredientType,
      preferredTerm: concept.preferredTerm ?? terms[0],
      terms,
    });
  }

  groups.sort((left, right) => left.preferredTerm.localeCompare(right.preferredTerm, "en"));
  return groups;
}

const release = await getCurrentReleaseArchive();
console.log(`Selected RxNorm release ${release.releaseDate}`);
const groups = buildIngredientGroups(release.archive);
if (groups.length === 0) {
  throw new Error("No multi-term active ingredient concepts were found; leaving the existing index unchanged.");
}

const output = {
  source: "NLM RxNorm Current Prescribable Content",
  sourceUrl: RELEASES_URL,
  licenseNote: `Current Prescribable Content download; see ${TERMS_URL}`,
  releaseDate: release.releaseDate,
  rxNavReleaseDate: release.rxNavReleaseDate,
  downloadUrl: CURRENT_ARCHIVE_URL,
  generatedAt: new Date().toISOString(),
  conceptCount: groups.length,
  groups,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
const temporaryPath = `${OUTPUT_PATH}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await rename(temporaryPath, OUTPUT_PATH);
console.log(`Wrote ${groups.length} ingredient concepts from RxNorm ${release.releaseDate} to ${OUTPUT_PATH}`);
