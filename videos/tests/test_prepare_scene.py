"""Integration checks against GDAL, using tiny synthetic rasters."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare-scene.py"
spec = importlib.util.spec_from_file_location("prepare_scene", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(shutil.which("gdal_create"), "GDAL CLI is required")
class PrepareSceneTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.output = self.root / "bundle" / "scene.tif"
        self.gdal = module.Gdal()
        for index, name in enumerate(module.BAND_ORDER):
            self.make_band(name, index + 0.125)

    def make_band(self, name, value, width=3):
        subprocess.run([
            shutil.which("gdal_create"), "-q", "-of", "GTiff", "-outsize", str(width), "4",
            "-ot", "Float64", "-burn", str(value), "-a_srs", "EPSG:4326",
            "-a_ullr", "-116", "62", "-115", "61", str(self.source / f"{name}.tif"),
        ], env=self.gdal.env, check=True, capture_output=True)

    def test_preserves_pixels_grid_names_and_records_duplicate(self):
        shutil.copyfile(self.source / "B8.tif", self.source / "B8A.tif")
        result = module.prepare(self.source, self.output)
        self.assertEqual(result["width"], 3)
        self.assertEqual(result["data_type"], "Float64")
        self.assertEqual([b["name"] for b in result["bands"]], list(module.BAND_ORDER))
        self.assertEqual(result["identical_pixel_bands"], [["B8", "B8A"]])
        self.assertEqual(result["sha256"], module.digest(self.output))
        self.assertEqual(json.loads(self.output.with_suffix(".json").read_text()), result)
        with self.assertRaisesRegex(ValueError, "already exists"):
            module.prepare(self.source, self.output)

    def test_rejects_misaligned_band_without_publishing(self):
        self.make_band("B3", 1, width=5)
        with self.assertRaisesRegex(ValueError, "different grid"):
            module.prepare(self.source, self.output)
        self.assertFalse(self.output.exists())

    def test_rejects_missing_band(self):
        (self.source / "B9.tif").unlink()
        with self.assertRaisesRegex(ValueError, "Missing source bands: B9.tif"):
            module.prepare(self.source, self.output)

    def test_rejects_output_inside_sources(self):
        with self.assertRaisesRegex(ValueError, "outside the source"):
            module.prepare(self.source, self.source / "combined.tif")


if __name__ == "__main__":
    unittest.main()
