# 001 — Static site on GitHub Pages with custom domain
Decision: build-free static HTML/CSS/JS (src/ module) served by GitHub Pages; custom domain rhemahq.com via CNAME file and Spaceship DNS A/CNAME records.
Why: no build step and no hosting auth beyond the gh CLI; demos run client-side so there is no backend and no secrets.
Consequences: pure handoff logic is unit-tested with node --test; browser wiring is guarded so the module imports cleanly in Node.
