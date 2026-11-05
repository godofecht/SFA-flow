#!/usr/bin/env python3
"""Validate native Flow SFA experiment CSV and prepare a GitHub Pages dataset."""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path


def read_column(path: Path, expected_header: str, expected_count: int) -> list[float]:
    """Read a one-column Flow export, rejecting incomplete or non-finite runs."""
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    if not rows or rows[0] != [expected_header]:
        raise ValueError(f"{path}: unexpected or missing CSV header")
    if len(rows) - 1 != expected_count:
        raise ValueError(f"{path}: expected {expected_count} samples, got {len(rows) - 1}")
    values: list[float] = []
    for index, row in enumerate(rows[1:], start=2):
        if len(row) != 1:
            raise ValueError(f"{path}:{index}: expected one numeric column")
        try:
            value = float(row[0])
        except ValueError as exc:
            raise ValueError(f"{path}:{index}: not numeric") from exc
        if not math.isfinite(value):
            raise ValueError(f"{path}:{index}: result is not finite")
        values.append(value)
    return values


def assemble(data_dir: Path, one_rate: int, two_rate: int, seed: int) -> dict:
    if one_rate <= 0 or two_rate <= 0:
        raise ValueError("Experiment rates must be positive")
    one_burn = 4 * one_rate
    one_samples = 50 * one_rate
    two_samples = 50 * two_rate
    prefix = str(float(one_rate).__format__(".6f")) + " "
    output = read_column(data_dir / (prefix + "values.csv"), "Values", one_samples)
    f = read_column(data_dir / (prefix + "F.csv"), "Values", one_burn + one_samples)
    cor = read_column(data_dir / (prefix + "Cor.csv"), "Values", one_samples)
    out1 = read_column(data_dir / "output1.csv", "Values", two_samples)
    out2 = read_column(data_dir / "output2.csv", "Values", two_samples)
    sig1 = read_column(data_dir / "signal1.csv", "Values", two_samples)
    sig2 = read_column(data_dir / "signal2.csv", "Values", two_samples)
    cor1 = read_column(data_dir / "cor1.csv", "Values", two_samples)
    cor2 = read_column(data_dir / "cor2.csv", "Values", two_samples)
    weights = read_column(data_dir / "weight_vector.csv", "j", 2601 * 2)
    for name, arr in (("correlation", cor), ("correlation1", cor1), ("correlation2", cor2)):
        if any(abs(v) > 1.00000001 for v in arr):
            raise ValueError(f"{name} exceeds the Pearson correlation range")
    return {
        "schema_version": 1,
        "source": {
            "commit": os.getenv("GITHUB_SHA", ""),
            "run_id": os.getenv("GITHUB_RUN_ID", ""),
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "seed": seed,
            "verification": "Flow CI execution; C++ scientific trajectory parity not established",
        },
        "experiments": {
            "one": {
                "rate": one_rate, "inputs": 101, "outputs": 1,
                "burn_in": one_burn, "samples": one_samples,
                "series": {"output": output, "objective": f[one_burn:], "correlation": cor},
            },
            "two": {
                "rate": two_rate, "inputs": 2601, "outputs": 2,
                "burn_in": 4 * two_rate, "samples": two_samples,
                "series": {
                    "output1": out1, "output2": out2,
                    "signal1": sig1, "signal2": sig2,
                    "correlation1": cor1, "correlation2": cor2,
                },
                "weights": [weights[0::2], weights[1::2]],
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--one-rate", type=int, default=5)
    parser.add_argument("--two-rate", type=int, default=2)
    parser.add_argument("--seed", type=int, default=12345)
    args = parser.parse_args()
    result = assemble(args.data_dir, args.one_rate, args.two_rate, args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print("Published validated Flow traces to " + str(args.output))


if __name__ == "__main__":
    main()
