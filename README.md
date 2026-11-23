# Sync Sanctuary

Static product network for Rhema HQ. The hub connects Fulfillment Ledger, Moodle Release Pack, and OJS Galley Studio. Each product has its own site, workflow, and release assets.

## Run locally

- `npm install` installs the local build dependency.
- `npm test` runs the Node tests.
- `npm run build` checks JavaScript, generates the hub and product pages, and rebuilds the browser workbenches and their offline ZIPs.
- `npm run dev` serves the site locally.

GitHub Pages serves the repository root without a build step. Check in the regenerated pages and packages along with source changes. The custom domain is configured in `CNAME`.

## Source files

- Edit the hub in `src/features/hub/site.html` and `assets/home.css`. The edit sources for the product pages live under `src/features/fulfillment/`, `src/features/learning/`, and `src/features/publishing/`.
- `src/domain/` holds each product's offer, the reconciliation and release rules, and the Galley Studio format definitions. Each offer feeds both the hub and its product page. File readers are in `src/infrastructure/`.
- `scripts/build_site_pages.py` generates the legal, procurement, service, checkout and guide pages plus search metadata. Edit the generator for page copy and `assets/page.css` for their layout.
- `assets/archive-cover.webp` and the three archive still lifes provide the original artwork. `src/home-motion.js` connects native scroll to the cover, pinned gallery, chapter entrances, and download artwork. Narrow viewports show the gallery in document order, and reduced-motion visitors see the static artwork.
- `src/artifact.js` runs the three-step sample trace and handles drag, keyboard, and playback controls. `src/scene.js` renders the document sheets in 3D. Touch and WebGL-free browsers use the CSS illustration. Reduced-motion visitors can step through the same trace manually.
- `src/trace.js` draws the invoice connections in sync with scroll and keeps the chapter buttons available.
- `src/workbench.js` shares file selection, preview tables, and download controls. Ledger and Moodle each supply their own workbench and processing rules. The build produces one classic-script bundle per product so each ZIP opens from disk. Ledger includes SheetJS 0.20.3. Font licenses are in `assets/fonts/`.
- `src/track.js` buffers homepage events in memory and forwards them once a Plausible or GA4 sink is available. The site currently ships without a configured sink. Checkout attribution uses the existing Polar UTM parameters.

The checkout return page shows the reference provided in the URL. The Polar receipt remains the record of payment and license delivery. Customer validation on representative files is tracked in the portfolio launch records.

## Galley Studio release

Run `python -X utf8 scripts/package_galley_release.py ../deliverables/ojs-galley-studio` from this checkout of the site to package the five public Studio files. The production note under `src/features/publishing/sample/` includes the input DOCX and metadata, the actual PDF, HTML and JATS outputs, and the checksum manifest written by Studio. The proof page also uses a WebP rendered from the first PDF page.
