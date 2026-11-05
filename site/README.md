# GitHub Pages research showcase

The `site/` directory is a static visualization of **real outputs from this repository's native Flow implementation**. No runtime inference or synthetic experimental traces are presented as measured data.

The workflow [`pages.yml`](../.github/workflows/pages.yml) pins the same Flow compiler as the numerical regression suite, runs both Flow test programs, executes two complete short experiments, validates each CSV field and row count, and packages `_site/data/results.json`. The JSON includes the git commit SHA, workflow run ID, seed and experiment configuration; these appear on the published page.

**Live site:** https://godofecht.github.io/SFA-flow/ (GitHub Pages must be configured with **GitHub Actions** as its build/deploy source under **Settings → Pages**).

For a local visual preview without compiled data, serve `site/` over HTTP (for example `python3 -m http.server -d site 8000`). The site will explicitly report that no verified dataset is available; no substitute data is generated. To test the exporter: `python3 -m unittest discover -s site/tests -v`.

The graphs communicate exactly the logged training outputs, objective and correlations. The 51 × 51 heatmaps show interleaved final weights for the two-output case. All chart values are raw; there is no smoothing. CSV files downloadable from the explorer reproduce the displayed series.

**Interpretation:** successful execution and CSV validation do not prove agreement with the original C++ trajectories. The PRNG and selected numerical handling differ, as explained in the main [README](../README.md#numerical-compatibility). This showcase deliberately distinguishes those claims.
