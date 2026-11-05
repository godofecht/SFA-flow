// Tests the actual Emscripten module built from src/browser.flow and src/core.flow.
const assert = require("node:assert/strict");
const path = require("node:path");
const createFlowModule = require(path.resolve("build/sfa-live-wasm/sfa_engine.js"));

(async () => {
  const module = await createFlowModule({
    locateFile: name => path.resolve("build/sfa-live-wasm", name)
  });
  const exported = ["create","destroy","step","reset_history","y0","y1","objective","input_a","input_b","weight","input_count","output_count"];
  for (const name of exported) assert.equal(typeof module["_sfa_web_" + name], "function", "missing native Flow export " + name);

  const first = module._sfa_web_create(5, 1, 12345);
  assert.ok(first > 0, "one-invariance model allocated");
  assert.equal(module._sfa_web_input_count(first), 101);
  assert.equal(module._sfa_web_input_a(first, 0), 51);
  const w = module._sfa_web_weight(first, 50);
  module._sfa_web_step(first, 0, 0);
  assert.ok(Math.abs(module._sfa_web_y0(first) - w) < 1e-10, "one-hot forward value follows exact Flow weights");
  for (let t = 1; t < 54*5; ++t) {
    module._sfa_web_step(first, t, t >= 4*5 ? 1 : 0);
    assert.ok(Number.isFinite(module._sfa_web_y0(first)));
    assert.ok(Number.isFinite(module._sfa_web_objective(first)));
  }
  module._sfa_web_destroy(first);

  const second = module._sfa_web_create(2, 2, 12345);
  assert.ok(second > 0, "two-invariance model allocated");
  assert.equal(module._sfa_web_input_count(second), 2601);
  assert.equal(module._sfa_web_input_a(second, 0), 26);
  assert.equal(module._sfa_web_input_b(second, 0), 26);
  for (let t = 0; t < 54*2; ++t) {
    if (t === 8) module._sfa_web_reset_history(second);
    module._sfa_web_step(second, t, t >= 8 ? 1 : 0);
    assert.ok(Number.isFinite(module._sfa_web_y0(second)));
    assert.ok(Number.isFinite(module._sfa_web_y1(second)));
    assert.ok(Number.isFinite(module._sfa_web_objective(second)));
  }
  assert.ok(Number.isFinite(module._sfa_web_weight(second, 5201)));
  module._sfa_web_destroy(second);
  console.log("Browser-native Flow WebAssembly trained both SFA models successfully");
})().catch(error => {console.error(error);process.exitCode = 1;});
