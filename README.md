# Slow Feature Analysis — Flow

Native [Flow](https://github.com/flooooooooooow/flow) rewrite of the [original Stone–Bray SFA implementation](https://github.com/godofecht/Slow-Feature-Analysis). The learning algorithms, signal generators, statistics, and network logic are implemented in Flow, using only C-ABI platform allocation, math and file I/O primitives.

**Status:** implementation committed on a feature branch; compiler execution and scientific equivalence are not yet independently validated.

## Run

Install the [Flow compiler](https://github.com/flooooooooooow/flow/blob/main/docs/getting-started.md), then execute these from this repository root:

~~~sh
flow run tests/smoke.flow
flow run tests/network_stats.flow
flow run src/main.flow
~~~

The default experiment runs the original one-invariance rates 50, 100, 200, 450, 900, 1800 and 3600.

~~~sh
SFA_RATE=50 SFA_SEED=12345 flow run src/main.flow
SFA_MODE=2 SFA_RATE=450 SFA_SEED=12345 flow run src/main.flow
~~~

The first selects one rate of the 101-input, single-output SFA; the second selects the 2601-input, two-output case. Both use 4 times the rate as burn-in, followed by 50 times the rate as adaptive learning. Results go into the data directory.

## Modules

| Original | Flow replacement |
| --- | --- |
| src/sfa.cpp and include/sfa.h | src/core.flow |
| src/Network.cpp and include/Network.h | src/network.flow |
| include/stats.h | src/stats.flow |
| src/main.cpp plus CSV export | src/main.flow |
| tests/tests.cpp | tests/smoke.flow and tests/network_stats.flow |
| CMake | flow.toml and .github/workflows/flow.yml |

The core implements Stone–Bray adaptive updates, running long/short means and variances, single and paired phase-modulated one-hot signals, online Pearson correlation, and the two-output weighted anti-Hebbian decorrelation rule. The separate generic linear Network implementation reproduces the original topology, forward propagation, weight normalization, delta assignment and weight updates.

The single-output CSV names match the original rate-specific output convention. The two-output runner writes output1, output2, signal1, signal2, cor1, cor2, and weight_vector CSV files.

## Numerical compatibility

The Flow code preserves the original time constants and learning rate, previous-output variance-update order, input-major weight layout, historical mean-centering divisor of 101 even when 2601 inputs are used, and the anti-Hebbian factor of 10.

The seeded Park–Miller PRNG replaces the original C-library rand, providing deterministic initialization but **not** identical initial random weights. Online Pearson accumulation replaces repeated full-history scans; a bounded window replaces repeated two-output history slicing. Both preserve the intended mathematics up to floating-point rounding.

The original code can generate undefined results from startup division by zero. This version writes zero for an unavailable initial log variance ratio and skips the corresponding zero-denominator gradient. The original two-output correlation vectors were never filled; this version populates them with signal/output correlations.

The C++ Network backpropagation method has no implementation. The C++ OpenMP offload pragmas are execution hints, not additional SFA algorithms. Flow's port does not yet claim GPU offload or equivalent GPU performance.

## Verification

GitHub Actions is configured to compile and execute both Flow regression programs and two short complete experiments, checking their CSV row counts. Passing these tests does not establish scientific trajectory parity: such a claim additionally requires matched initial weights, numerical tolerances, controlled compiler/rounding behavior and longer reference runs.

The original copyright and MIT terms are retained in LICENSE.
