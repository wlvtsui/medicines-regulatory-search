import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { unzipSync } from "fflate";

const url = "https://download.nlm.nih.gov/rxnorm/RxNorm_full_prescribe_current.zip";

const startedAt = Date.now();
const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
if (!response.ok || !response.body) {
  throw new Error(`RxNorm current archive returned HTTP ${response.status}`);
}
const filePath = "data/rxnorm-current-probe.zip";
await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
console.log(JSON.stringify({
  url,
  status: response.status,
  contentType: response.headers.get("content-type"),
  bytes: Number(response.headers.get("content-length")),
  latencyMs: Date.now() - startedAt,
}));

const buffer = new Uint8Array(await (await import("node:fs/promises")).readFile(filePath));
const archive = unzipSync(buffer);
const names = Object.keys(archive);
console.log(JSON.stringify({ archiveFiles: names }));
for (const name of names.filter((entry) => /readme|version|release/i.test(entry))) {
  const text = new TextDecoder().decode(archive[name]);
  console.log(JSON.stringify({ file: name, excerpt: text.slice(0, 3000) }));
  }
