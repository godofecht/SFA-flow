# GitHub Pages research showcase

The `site/` directory is a static visualization of **real outputs from this repository's native Flow implementation**. No runtime inference or synthetic experimental traces are presented as measured data.

The workflow [`pages.yml`](../.github/workflows/pages.yml) pins the same Flow compiler as the numerical regression suite, runs both Flow test programs, executes two complete short experiments, validates each CSV field and row count, and packages `_site/data/results.json`. The JSON includes the git commit SHA, workflow run ID, seed and experiment configuration; these appear on the published page.

**Live site:** https://godofecht.github.io/SFA-flow/ (GitHub Pages must be configured with **GitHub Actions** as its build/deploy source under **Settings → Pages**).

For a local visual preview without compiled data, serve `site/` over HTTP (for example `python3 -m http.server -d site 8000`). The site will explicitly report that no verified dataset is available; no substitute data is generated. To test the exporter: `python3 -m unittest discover -s site/tests -v`.

The graphs communicate exactly the logged training outputs, objective and correlations. The 51 × 51 heatmaps show interleaved final weights for the two-output case. All chart values are raw; there is no smoothing. CSV files downloadable from the explorer reproduce the displayed series.

**Interpretation:** successful execution and CSV validation do not prove agreement with the original C++ trajectories. The PRNG and selected numerical handling differ, as explained in the main [README](../README.md#numerical-compatibility). This showcase deliberately distinguishes those claims.

## Interactive native Flow execution

The live panel executes the **same `src/core.flow` solver** as the command-line experiments, not a JavaScript reimplementation or prerecorded animation. `src/browser.flow` exposes a step-by-step Flow ABI; the Pages workflow compiles it with Flow's C backend and Emscripten into `sfa_engine.wasm`. JavaScript calls the exported Flow functions, samples real outputs, computes display-only online Pearson statistics, and renders the current learned weights and active input position.

Runs are reproducible by recording the input mode, `ρ` and deterministic seed. The live UI limits `ρ` to 2–200 to keep browser execution responsive; the CLI retains the full range documented above. The burn-in lasts 4ρ steps and the adaptive phase lasts 50ρ steps. A two-invariance run resets the decorrelation window after burn-in, matching `src/main.flow`. A slider controls how many **actual Flow solver steps** run per animation frame. Pausing stops advancement; stepping executes exactly one call into native Flow WebAssembly. Every training step is executed, while the graph deliberately plots a bounded sampling of those steps for performance.

Automated verification calls both modes directly inside Node's WebAssembly runtime after building the same engine published by GitHub Pages (`site/tests/live_wasm.cjs`), and separately compiles/tests the same ABI natively (`tests/browser.flow`). The historical CI dataset remains a distinct reproducibility tab. This still does not establish independently verified C++ trajectory parity.
