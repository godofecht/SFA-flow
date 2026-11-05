// Cross-backend numerical parity for the *same native Flow implementation*.
// The Pages workflow runs src/main.flow first and writes its actual CSV files.
// This test compiles src/browser.flow to WASM, then checks its live state at
// every timestep against the independent native executable's CSV trajectory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const createFlowModule = require(path.resolve("build/sfa-live-wasm/sfa_engine.js"));

function loadCsv(relative, header) {
  const file = fs.readFileSync(path.resolve(relative), "utf8").trim().split(/\r?\n/);
  assert.equal(file.shift(), header, "CSV header: " + relative);
  return file.map((text, i) => {
    const value = Number(text.trim());
    assert.ok(text.trim() && Number.isFinite(value), relative + " finite row " + i);
    return value;
  });
}

function equalNumber(actual, expected, context, tolerance = 1e-8) {
  assert.ok(Number.isFinite(actual), context + ": WASM value is not finite");
  assert.ok(Number.isFinite(expected), context + ": native value is not finite");
  const error = Math.abs(actual - expected);
  const limit = tolerance * (1 + Math.abs(actual) + Math.abs(expected));
  assert.ok(error <= limit,
    context + ": WASM=" + actual + " native=" + expected +
    ", absolute error=" + error + " permitted=" + limit);
}

(async () => {
  const module = await createFlowModule({
    locateFile: name => path.resolve("build/sfa-live-wasm", name)
  });
  const exported = ["create", "destroy", "step", "reset_history", "y0", "y1",
    "objective", "input_a", "input_b", "weight", "input_count", "output_count"];
  for (const name of exported) {
    assert.equal(typeof module["_sfa_web_" + name], "function",
      "missing native Flow export " + name);
  }

  const rate1 = 5;
  const warm1 = 4 * rate1;
  const outputs1 = loadCsv("data/5.000000 values.csv", "Values");
  const objective1 = loadCsv("data/5.000000 F.csv", "Values");
  assert.equal(outputs1.length, 50 * rate1);
  assert.equal(objective1.length, 54 * rate1);
  const first = module._sfa_web_create(rate1, 1, 12345);
  assert.ok(first > 0, "one-invariance model allocated");
  assert.equal(module._sfa_web_input_count(first), 101);
  assert.equal(module._sfa_web_input_a(first, 0), 51);
  const w = module._sfa_web_weight(first, 50);
  for (let t = 0; t < warm1 + outputs1.length; ++t) {
    module._sfa_web_step(first, t, t >= warm1 ? 1 : 0);
    const y0 = module._sfa_web_y0(first);
    if (t === 0) equalNumber(y0, w, "1D initial one-hot forward");
    equalNumber(module._sfa_web_objective(first), objective1[t], "1D F step " + t);
    if (t >= warm1) {
      equalNumber(y0, outputs1[t - warm1], "1D output step " + t);
    }
  }
  module._sfa_web_destroy(first);

  const rate2 = 2;
  const warm2 = 4 * rate2;
  const y0Native = loadCsv("data/output1.csv", "Values");
  const y1Native = loadCsv("data/output2.csv", "Values");
  const signal1 = loadCsv("data/signal1.csv", "Values");
  const signal2 = loadCsv("data/signal2.csv", "Values");
  const weights = loadCsv("data/weight_vector.csv", "j");
  assert.equal(y0Native.length, 50 * rate2);
  assert.equal(y1Native.length, y0Native.length);
  assert.equal(signal1.length, y0Native.length);
  assert.equal(signal2.length, y0Native.length);
  assert.equal(weights.length, 5202);

  const second = module._sfa_web_create(rate2, 2, 12345);
  assert.ok(second > 0, "two-invariance model allocated");
  assert.equal(module._sfa_web_input_count(second), 2601);
  assert.equal(module._sfa_web_input_count(second) * module._sfa_web_output_count(second), weights.length);
  assert.equal(module._sfa_web_input_a(second, 0), 26);
  assert.equal(module._sfa_web_input_b(second, 0), 26);
  for (let t = 0; t < warm2 + y0Native.length; ++t) {
    if (t === warm2) module._sfa_web_reset_history(second);
    module._sfa_web_step(second, t, t >= warm2 ? 1 : 0);
    if (t >= warm2) {
      const i = t - warm2;
      equalNumber(module._sfa_web_y0(second), y0Native[i], "2D y0 step " + t);
      equalNumber(module._sfa_web_y1(second), y1Native[i], "2D y1 step " + t);
      assert.equal(module._sfa_web_input_a(second, t), signal1[i], "2D signal 1 step " + t);
      assert.equal(module._sfa_web_input_b(second, t), signal2[i], "2D signal 2 step " + t);
    }
  }
  for (let i = 0; i < weights.length; ++i) {
    equalNumber(module._sfa_web_weight(second, i), weights[i], "2D final weight " + i);
  }
  module._sfa_web_destroy(second);
  console.log("Native Flow and Flow→WebAssembly match both complete SFA trajectories and 5,202 final weights");
})().catch(error => {console.error(error);process.exitCode = 1;});
