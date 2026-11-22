# Sync Sanctuary — rhemahq.com
Static marketing site plus live in-browser demos for three source-verified handoff tools.
## Run
npm test
npx serve .
## Deploy
GitHub Pages from repo root; custom domain rhemahq.com via CNAME file and Spaceship DNS A/CNAME records.
## Status
Demos run client-side on synthetic or user-selected files; nothing is uploaded. Capabilities verified on synthetic fixtures; live customer validation in progress. Paid licenses open at launch.

## 3D layer
src/scene.js renders a Three.js (r170 via CDN importmap) centerpiece: a verified seal, orbiting source-shards, provenance threads, drifting particles and bloom; scroll drives the camera, pointer adds parallax, hover raycasts a live receipt tooltip.
Fallbacks: prefers-reduced-motion renders one static frame; small/coarse devices skip bloom and reduce shard/particle counts; if WebGL is unavailable the canvas is removed and a CSS gradient stands in; the canvas fades out below the hero so content reads on the void.
