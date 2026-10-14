
"use client";

import { useMemo, useState } from "react";

const countries = [
  {
    code: "HK",
    name: "Hong Kong",
    regulator: "Department of Health — Drug Office",
    url: "https://www.drugoffice.gov.hk/eps/do/en/healthcare_providers/search_drug_database.html",
  },
  {
    code: "US",
    name: "United States",
    regulator: "US Food and Drug Administration",
    url: "https://www.accessdata.fda.gov/scripts/cder/daf/",
  },
  {
    code: "UK",
    name: "United Kingdom",
    regulator: "Medicines and Healthcare products Regulatory Agency",
    url: "https://products.mhra.gov.uk/",
  },
  {
    code: "CA",
    name: "Canada",
    regulator: "Health Canada",
    url: "https://health-products.canada.ca/dpd-bdpp/index-eng.jsp",
  },
  {
    code: "EU",
    name: "European Union (EMA)",
    regulator: "European Medicines Agency",
    url: "https://www.ema.europa.eu/en/search?search_api_views_fulltext=medicines",
  },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("ALL");
  const [searched, setSearched] = useState(false);

  const results = useMemo(() => {
    return countries.filter((item) => {
      return country === "ALL" || item.code === country;
    });
  }, [country]);

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearched(true);
  }

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">Rx</span>
          <span>Medicines Regulatory Search</span>
        </a>
        <span className="top-label">SIX JURISDICTIONS</span>
      </header>

      <section className="hero">
        <div className="eyebrow">
          MEDICINES INFORMATION · OFFICIAL SOURCES
        </div>

        <h1>
          One search.
          <br />
          Six regulatory systems.
        </h1>

        <p className="intro">
          Find the official regulatory databases for human medicines
          across Hong Kong, the United States, the United Kingdom,
          Canada and the European Union (EMA).
        </p>

        <form className="search-panel" onSubmit={handleSearch}>
          <label htmlFor="medicine-search">
            Medicine name, brand or active ingredient
          </label>

          <div className="search-row">
            <input
              id="medicine-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. metformin, Humira"
            />

            <button type="submit">Search sources</button>
          </div>

          <label htmlFor="country-filter">Jurisdiction</label>

          <select
            id="country-filter"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option value="ALL">All six jurisdictions</option>
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </form>
      </section>

      <section className="results-section">
        <div className="results-heading">
          <div>
            <h2>
              {searched ? "Official source directory" : "Search by jurisdiction"}
            </h2>
            <p>
              {searched && query.trim()
                ? `Your search: "${query.trim()}"`
                : "Choose a regulator to continue your search."}
            </p>
          </div>
          <span className="count">{results.length} SOURCES</span>
        </div>

        {searched && (
          <div className="notice">
            <strong>Important:</strong> This prototype has not queried
            the regulators or verified the approval status of your search
            term. Open a source below and search its official database.
            No medicine approval result is being asserted here.
          </div>
        )}

        <div className="country-grid">
          {results.map((item) => (
            <article className="country-card" key={item.code}>
              <div className="card-top">
                <span className="country-code">{item.code}</span>
                <span className="external-icon">↗</span>
              </div>

              <h3>{item.name}</h3>
              <p className="regulator">{item.regulator}</p>

              <div className="status">
                <span className="status-dot" />
                Official database link
              </div>

              <a
                className="source-link"
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                Open official source <span>→</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <p>
          An independent regulatory information project. Official
          regulator records remain the authoritative source.
        </p>
        <p>
          Prototype v0.1 · Regulatory status not yet verified automatically
        </p>
      </footer>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f7f8fa;
          color: #17243a;
          font-family: Arial, Helvetica, sans-serif;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px max(24px, calc((100% - 1120px) / 2));
          background: white;
          border-bottom: 1px solid #e4e8ef;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #17243a;
          text-decoration: none;
          font-size: 15px;
          font-weight: 700;
        }

        .brand-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: #176b58;
          color: white;
          font-weight: 800;
        }

        .top-label,
        .count {
          color: #65748a;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
        }

        .hero {
          padding: 64px 24px 48px;
          text-align: center;
          background: #edf4f2;
        }

        .eyebrow {
          color: #176b58;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        h1 {
          margin: 18px 0;
          font-size: clamp(36px, 6vw, 58px);
          line-height: 1.08;
          letter-spacing: -2px;
        }

        .intro {
          max-width: 640px;
          margin: 0 auto 28px;
          color: #59677a;
          font-size: 16px;
          line-height: 1.7;
        }

        .search-panel {
          max-width: 760px;
          margin: 0 auto;
          padding: 24px;
          text-align: left;
          background: white;
          border: 1px solid #e0e7e5;
          border-radius: 16px;
          box-shadow: 0 12px 35px #1a3b2b0b;
        }

        label {
          display: block;
          margin-bottom: 9px;
          color: #344258;
          font-size: 13px;
          font-weight: 700;
        }

        input,
        select {
          width: 100%;
          min-width: 0;
          padding: 14px;
          border: 1px solid #d8dfe7;
          border-radius: 9px;
          background: white;
          color: #17243a;
          font-size: 15px;
        }

        input:focus,
        select:focus {
          outline: 2px solid #78b9a5;
          outline-offset: 2px;
        }

        .search-row {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        button {
          flex-shrink: 0;
          padding: 0 20px;
          border: 0;
          border-radius: 9px;
          background: #176b58;
          color: white;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        button:hover {
          background: #105543;
        }

        .results-section {
          max-width: 1120px;
          margin: 0 auto;
          padding: 42px 24px 64px;
        }

        .results-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
        }

        h2 {
          margin: 0 0 7px;
          font-size: 23px;
          letter-spacing: -0.5px;
        }

        .results-heading p,
        .regulator {
          color: #647186;
          font-size: 13px;
          line-height: 1.6;
        }

        .count {
          white-space: nowrap;
        }

        .notice {
          margin-bottom: 20px;
          padding: 16px;
          border: 1px solid #e7d8ae;
          border-radius: 10px;
          background: #fff9e9;
          color: #6d5421;
          font-size: 13px;
          line-height: 1.7;
        }

        .country-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .country-card {
          display: flex;
          min-height: 220px;
          flex-direction: column;
          padding: 22px;
          border: 1px solid #e3e7ed;
          border-radius: 13px;
          background: white;
          transition: border-color 0.15s, transform 0.15s;
        }

        .country-card:hover {
          border-color: #a9cbbf;
          transform: translateY(-2px);
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .country-code {
          padding: 7px 9px;
          border-radius: 6px;
          background: #edf4f2;
          color: #176b58;
          font-size: 12px;
          font-weight: 800;
        }

        .external-icon {
          color: #718096;
          font-size: 19px;
        }

        h3 {
          margin: 18px 0 5px;
          font-size: 19px;
        }

        .regulator {
          margin: 0;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 18px;
          color: #536276;
          font-size: 12px;
        }

        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #7c8b9e;
        }

        .source-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: auto;
          padding-top: 20px;
          color: #176b58;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
        }

        .source-link:hover {
          text-decoration: underline;
        }

        footer {
          padding: 26px 24px;
          border-top: 1px solid #e3e7ed;
          background: white;
          color: #69768a;
          text-align: center;
          font-size: 12px;
          line-height: 1.7;
        }

        @media (max-width: 760px) {
          .country-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .hero {
            padding-top: 44px;
          }
        }

        @media (max-width: 500px) {
          .topbar {
            padding: 16px;
          }

          .top-label {
            display: none;
          }

          .search-row {
            flex-direction: column;
          }

          button {
            min-height: 46px;
          }

          .country-grid {
            grid-template-columns: 1fr;
          }

          .results-heading {
            align-items: flex-start;
          }

          .search-panel {
            padding: 18px;
          }
        }
      `}</style>
    </main>
  );
}
