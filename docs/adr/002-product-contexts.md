# 002 — Product contexts under the Rhema HQ hub

Status — Accepted

## Decision

The hub links to three static product sites under the existing Rhema HQ origin. Each product owns its language, presentation, examples, pricing, and workflow rules.

| Context | Site | Domain ownership |
| --- | --- | --- |
| Fulfillment | `/fulfillment-ledger/` | Invoice reconciliation, fee rollups, source references |
| Learning | `/moodle-release-pack/` | Question-bank releases, category counts, question receipts |
| Publishing | `/ojs-galley-studio/` | Galley formats, proof assets, and the Galley Studio release |

Each product's `src/domain/` folder provides its offer to the generated hub and its own site. `src/features/` owns the product layouts and workbench entry points. Fulfillment and Learning read external file formats through adapters in `src/infrastructure/`. Shared browser controls take a workbench configuration and stay independent of either model. The separate Galley Studio product owns document conversion and OJS registration.

## Consequences

The GitHub Pages publication model in ADR 001 remains build-free at deploy time. The local build emits static pages and two independent browser bundles. Hosted demos and offline tools use the same bundle for each product. The product architecture uses relative links, so the existing host can serve the three routes with its current custom domain. Prices and checkout URLs are edited once per product in its offer file.
