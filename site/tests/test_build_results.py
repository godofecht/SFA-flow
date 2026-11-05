"""Tests for the actual CSV-to-Pages data exporter (stdlib only)."""
import csv
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_results import assemble, read_column


def write_csv(path, header, data):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([header])
        writer.writerows([[value] for value in data])


class ResultsTests(unittest.TestCase):
    def test_rejects_nonfinite_data(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "x.csv"
            write_csv(path, "Values", [1, math.nan])
            with self.assertRaisesRegex(ValueError, "not finite"):
                read_column(path, "Values", 2)

    def test_rejects_wrong_length(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "x.csv"
            write_csv(path, "Values", [1])
            with self.assertRaisesRegex(ValueError, "expected 2"):
                read_column(path, "Values", 2)

    def test_assembles_one_and_two_output_shapes(self):
        with tempfile.TemporaryDirectory() as root:
            folder = Path(root)
            for suffix, size in (("values", 250), ("F", 270), ("Cor", 250)):
                write_csv(folder / ("5.000000 " + suffix + ".csv"), "Values", [0.1] * size)
            for name in ("output1", "output2", "signal1", "signal2", "cor1", "cor2"):
                write_csv(folder / (name + ".csv"), "Values", [0.1] * 100)
            write_csv(folder / "weight_vector.csv", "j", list(range(5202)))
            result = assemble(folder, 5, 2, 12345)
            self.assertEqual(len(result["experiments"]["one"]["series"]["objective"]), 250)
            self.assertEqual(len(result["experiments"]["two"]["weights"]), 2)
            self.assertEqual(len(result["experiments"]["two"]["weights"][0]), 2601)
            self.assertEqual(result["experiments"]["two"]["weights"][1][0], 1)


if __name__ == "__main__":
    unittest.main()
