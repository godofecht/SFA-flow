(() => {
  "use strict";
  const ROOT = "https://github.com/godofecht/SFA-flow";
  const palette = ["#83e5ce", "#f5c27c", "#8596ff", "#ed8297"];
  const choices = {
    one: [
      {id: "output", title: "The learned slow feature", caption: "Output of the 101-input adaptive network during its training phase.", tag: "LEARNED PROJECTION", lines: [{key: "output", name: "Network output", color: palette[0]}]},
      {id: "objective", title: "Log variance ratio", caption: "The Flow implementation's log(long variance / short variance), aligned to adaptive training steps.", tag: "SFA OBJECTIVE", lines: [{key: "objective", name: "Log variance ratio", color: palette[1]}]},
      {id: "correlation", title: "Online signal correlation", caption: "Accumulated Pearson correlation between the generated input position and the learned feature.", tag: "PEARSON CORRELATION", lines: [{key: "correlation", name: "Pearson r", color: palette[2]}]}
    ],
    two: [
      {id: "outputs", title: "Two adaptive features", caption: "The two learned output channels over the adaptive training interval.", tag: "LEARNED PROJECTIONS", lines: [{key: "output1", name: "Output 1", color: palette[0]}, {key: "output2", name: "Output 2", color: palette[1]}]},
      {id: "signals", title: "Two phase-modulated inputs", caption: "The two underlying one-hot positions before feature extraction, shown as integer positions.", tag: "INPUT SIGNALS", lines: [{key: "signal1", name: "Signal 1", color: palette[2]}, {key: "signal2", name: "Signal 2", color: palette[3]}]},
      {id: "correlations", title: "Signal-to-feature correlations", caption: "Online Pearson correlations for signal 1 / output 1 and signal 2 / output 2.", tag: "PEARSON CORRELATIONS", lines: [{key: "correlation1", name: "Signal 1 vs output 1", color: palette[0]}, {key: "correlation2", name: "Signal 2 vs output 2", color: palette[1]}]}
    ]
  };
  const chart = document.getElementById("chart");
  const weightCanvas = document.getElementById("weights");
  const metricControl = document.getElementById("metric");
  const empty = document.getElementById("empty-state");
  const exportButton = document.getElementById("csv");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  let manifest = null;
  let currentMode = "one";
  let currentMetric = "output";
  let currentWeightChannel = 0;

  function el(id) { return document.getElementById(id); }
  function setText(id, text) { el(id).textContent = String(text); }
  function formatNumber(value, digits = 3) {
    return Number.isFinite(value) ? value.toLocaleString("en-GB", {maximumFractionDigits: digits}) : "—";
  }
  function experiment() { return manifest && manifest.experiments ? manifest.experiments[currentMode] : null; }
  function definition() { return choices[currentMode].find(item => item.id === currentMetric) || choices[currentMode][0]; }
  function selectedLines() {
    const e = experiment();
    if (!e) return [];
    return definition().lines.map(line => Object.assign({}, line, {values: e.series[line.key]})).filter(line => Array.isArray(line.values));
  }
  function rebuildOptions() {
    metricControl.replaceChildren();
    for (const option of choices[currentMode]) {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.title;
      metricControl.appendChild(node);
    }
    if (!choices[currentMode].some(opt => opt.id === currentMetric)) currentMetric = choices[currentMode][0].id;
    metricControl.value = currentMetric;
  }
  function chartDescription(lines) {
    return lines.map(line => line.name + ", " + line.values.length + " measured values").join("; ");
  }
  function draw() {
    const rect = chart.getBoundingClientRect();
    const width = Math.max(250, rect.width || 800);
    const height = Math.max(220, rect.height || 385);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    chart.width = Math.round(width * dpr);
    chart.height = Math.round(height * dpr);
    const ctx = chart.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const lines = selectedLines();
    if (!lines.length) return;
    const left = 58, right = 16, top = 16, bottom = 40;
    const w = width - left - right, h = height - top - bottom;
    if (w <= 0 || h <= 0) return;
    const data = lines.flatMap(line => line.values);
    let min = Math.min(...data), max = Math.max(...data);
    if (min === max) { min -= 1; max += 1; }
    const padding = (max - min) * 0.10;
    min -= padding; max += padding;
    const x = (i, n) => left + w * i / Math.max(1, n - 1);
    const y = value => top + h * (max - value) / (max - min);
    ctx.font = "11px ui-monospace, Consolas, monospace";
    ctx.textBaseline = "middle";
    for (let k = 0; k <= 4; k++) {
      const py = top + k * h / 4;
      ctx.strokeStyle = "#304350";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left, py); ctx.lineTo(left + w, py); ctx.stroke();
      ctx.fillStyle = "#879fa9";
      ctx.textAlign = "right";
      ctx.fillText(formatNumber(max - k * (max - min) / 4, 2), left - 11, py);
    }
    const length = Math.max(...lines.map(line => line.values.length));
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let k = 0; k <= 4; k++) {
      const px = left + k * w / 4;
      ctx.fillText(String(Math.round(k * (length - 1) / 4)), px, height - 11);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(left, top, w, h); ctx.clip();
    for (const line of lines) {
      ctx.beginPath();
      line.values.forEach((value, i) => {
        if (i === 0) ctx.moveTo(x(i, line.values.length), y(value));
        else ctx.lineTo(x(i, line.values.length), y(value));
      });
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.restore();
    chart.setAttribute("aria-label", chartDescription(lines));
  }
  function renderWeights() {
    const e = experiment();
    const pane = el("weights-pane");
    pane.hidden = !(currentMode === "two" && e && e.weights);
    if (pane.hidden) return;
    const weights = e.weights[currentWeightChannel];
    if (!Array.isArray(weights) || weights.length !== 2601) { pane.hidden = true; return; }
    const ctx = weightCanvas.getContext("2d");
    const cell = weightCanvas.width / 51;
    const maxAbs = Math.max(1e-12, ...weights.map(Math.abs));
    for (let i = 0; i < weights.length; i++) {
      const intensity = Math.min(1, Math.abs(weights[i]) / maxAbs);
      const neutral = [26, 52, 66];
      const accent = weights[i] >= 0 ? [131, 229, 206] : [237, 130, 151];
      const channels = neutral.map((n, c) => Math.round(n + (accent[c] - n) * intensity));
      ctx.fillStyle = "rgb(" + channels.join(",") + ")";
      ctx.fillRect((i % 51) * cell, Math.floor(i / 51) * cell, Math.ceil(cell), Math.ceil(cell));
    }
    setText("weight-readout", "Peak absolute weight: " + formatNumber(maxAbs, 5) + " · final model weights");
  }
  function render() {
    for (const button of modeButtons) {
      const active = button.dataset.mode === currentMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    rebuildOptions();
    const config = definition();
    setText("chart-tag", config.tag);
    setText("chart-title", config.title);
    setText("chart-caption", config.caption);
    const legend = el("legend");
    legend.replaceChildren();
    const lines = selectedLines();
    for (const line of lines) {
      const label = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.style.backgroundColor = line.color;
      label.appendChild(swatch);
      label.appendChild(document.createTextNode(line.name));
      legend.appendChild(label);
    }
    const e = experiment();
    setText("input-count", e ? formatNumber(e.inputs, 0) : "—");
    setText("sample-count", e ? formatNumber(e.samples, 0) : "—");
    setText("rate-value", e ? formatNumber(e.rate, 0) : "—");
    if (e) {
      const first = e.series[currentMode === "one" ? "correlation" : "correlation1"];
      const second = currentMode === "two" ? e.series.correlation2 : null;
      setText("final-corr", first && first.length ? formatNumber(first[first.length - 1], 3) + (second && second.length ? " / " + formatNumber(second[second.length - 1], 3) : "") : "—");
    } else setText("final-corr", "—");
    exportButton.disabled = !lines.length;
    empty.style.display = lines.length ? "none" : "grid";
    draw();
    renderWeights();
  }
  function exportCSV() {
    const lines = selectedLines();
    if (!lines.length) return;
    const values = [ ["step"].concat(lines.map(line => line.name)).join(",") ];
    const n = Math.max(...lines.map(line => line.values.length));
    for (let i = 0; i < n; i++) values.push([i].concat(lines.map(line => line.values[i] === undefined ? "" : String(line.values[i]))).join(","));
    const blob = new Blob([values.join("\n") + "\n"], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sfa-flow-" + currentMode + "-" + currentMetric + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  function handleWeightHover(event) {
    const e = experiment();
    if (!e || !e.weights || currentMode !== "two") return;
    const rect = weightCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const col = Math.floor((event.clientX - rect.left) / rect.width * 51);
    const row = Math.floor((event.clientY - rect.top) / rect.height * 51);
    if (col < 0 || col >= 51 || row < 0 || row >= 51) return;
    const value = e.weights[currentWeightChannel][row * 51 + col];
    setText("weight-readout", "Input position (" + (col + 1) + ", " + (row + 1) + ") · weight " + formatNumber(value, 7));
  }
  function setLoadState(message) {
    empty.textContent = message;
    setText("provenance-text", message);
    setText("run-badge", "Dataset not published");
  }
  modeButtons.forEach(button => button.addEventListener("click", () => {
    currentMode = button.dataset.mode;
    currentMetric = choices[currentMode][0].id;
    render();
  }));
  metricControl.addEventListener("change", () => { currentMetric = metricControl.value; render(); });
  el("weight-channel").addEventListener("change", event => { currentWeightChannel = Number(event.target.value); renderWeights(); });
  weightCanvas.addEventListener("mousemove", handleWeightHover);
  exportButton.addEventListener("click", exportCSV);
  window.addEventListener("resize", draw);
  rebuildOptions();
  draw();
  fetch("./data/results.json", {cache: "no-store"})
    .then(response => { if (!response.ok) throw new Error("HTTP " + response.status); return response.json(); })
    .then(payload => {
      if (!payload || !payload.source || !payload.experiments || !payload.experiments.one || !payload.experiments.two) throw new Error("Invalid experiment manifest");
      manifest = payload;
      setText("run-badge", "CI traces available");
      el("run-badge").classList.add("live");
      const shortSHA = (payload.source.commit || "unknown").slice(0, 8);
      const run = String(payload.source.run_id || "");
      const href = /^\d+$/.test(run) ? ROOT + "/actions/runs/" + run : ROOT + "/actions";
      el("provenance-link").href = href;
      setText("provenance-text", "Native Flow · seed " + payload.source.seed + " · commit " + shortSHA + " · " + payload.source.generated_at);
      render();
    })
    .catch(() => {
      setLoadState("No experiment dataset is deployed yet. The GitHub Pages workflow must complete successfully to generate real traces.");
      render();
    });
})();
