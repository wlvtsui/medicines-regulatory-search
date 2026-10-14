This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

For more information on Next.js, see the [Next.js documentation](https://nextjs.org/docs).

## UK dm+d search

UK search uses a small Clojure service around [wardle/dmd](https://github.com/wardle/dmd). The service exposes token-prefix matching on dm+d product names. This is not an MHRA API and does not establish a product's marketing authorisation; use the official [MHRA products database](https://products.mhra.gov.uk/) to verify regulatory status.

The Next.js app calls the service from its server-side `/api/uk-dmd` route. For local development, set `DMD_SEARCH_API_URL=http://127.0.0.1:8081/search` in `.env`. The browser never receives the dm+d service URL or TRUD key.

### Prepare dm+d data

The service needs a dm+d SQLite database. The NHS BSA publishes dm+d under the Open Government Licence, but downloading distributions through TRUD requires an account and API key. Keep that key on the machine that prepares the database; do not add it to this repository.

Use the `wardle/dmd` instructions to download and install a release. For example, its CLI supports `latest` with an API key file, cache directory, and output database path. Check that repository's current instructions for the exact command and release requirements.

### Run with Docker

Docker supplies Java and the Clojure runtime. Put `TRUD_API_KEY` in the ignored root `.env` file. Compose passes it to the importer as a mounted secret; it is not copied into either image. `.dockerignore` also excludes `.env` from build contexts.

Build the importer and search-service images, import the initial database, then start the search service:

```powershell
docker compose --profile import build
docker compose run --rm dmd-import
docker compose up -d dmd-search
```

The importer downloads the pinned `dmd` JAR from GitHub releases and verifies its SHA-256 during image build. It uses TRUD to build a versioned database under the named `dmd-data` volume, then atomically updates the `current-db-path` pointer only after a successful import. The search service mounts that volume read-only. Its published API is bound to `127.0.0.1:8081` on the host.

For UK search from the locally running Next.js app, ensure `.env` also contains `DMD_SEARCH_API_URL=http://127.0.0.1:8081/search`, then start or restart `npm run dev` so Next.js loads the value. The `.env.example` file shows both variable names; replace the TRUD placeholder locally and never commit the real key.

To refresh dm+d later, run `docker compose run --rm dmd-import` again. If it succeeds, restart the search service so it opens the new database: `docker compose restart dmd-search`. The old versioned database remains in the volume for rollback; remove old files only when the new release is confirmed.

Docker Compose maps the host `TRUD_API_KEY` variable to a secret. Keep the key out of shell history and logs. The importer requires an active TRUD account and network access to TRUD and GitHub.

The service provides `GET /search?q=<term>`. It returns up to 10 token-prefix matches on product names, the dm+d product identifier/type, and the loaded release date. Ingredient names are not independently indexed by this endpoint.

Without Docker or a configured service URL, the app reports UK dm+d as unavailable while other jurisdictions continue to work.

The `wardle/dmd` software is EPL-2.0 licensed. dm+d data is subject to the Open Government Licence v3.0; retain required attribution when redistributing data or derived outputs.

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
