"""Rebuild the selected time-series cutouts from the large_images dataset root.

Preserves each scene's samples and grid using prepare-scene.py, and adds the
source-name date and display name. Cropping uses a common pixel window; no
resampling, alignment correction or data type conversion is done.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("prepare_scene", ROOT / "scripts" / "prepare-scene.py")
scene_builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scene_builder)


def prepare_series(source_root: Path, output_dir: Path, *, replace: bool = False):
    selection = json.loads((ROOT / "assets" / "time-series" / "selection.json").read_text())
    # Check the complete selection before publishing any bundle.
    gdal = scene_builder.Gdal()
    reference_grid = None
    for item in selection["scenes"]:
        source = source_root / item["source"]
        if not source.is_dir():
            raise ValueError(f"Missing selected scene: {source}")
        current_grid = scene_builder.grid(gdal.info(source / f"{selection['bands'][0]}.tif"))
        if reference_grid is not None and current_grid != reference_grid:
            raise ValueError("Selected dates must share a source grid for the common pixel window.")
        reference_grid = current_grid
        if not replace and any((output_dir / item["output"]).with_suffix(suffix).exists()
                               for suffix in (".tif", ".json")):
            raise ValueError("Output already exists. Use --replace to rebuild the bundles.")
    for item in selection["scenes"]:
        output = output_dir / item["output"]
        manifest = scene_builder.prepare(source_root / item["source"], output, replace=replace,
                                         window=selection["window"], band_order=selection["bands"])
        manifest.update(displayName=item["displayName"], acquisition_date=item["acquisition_date"],
                        date_source=selection["date_source"], source_relative_path=item["source"])
        output.with_suffix(".json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"Verified {len(manifest['bands'])} bands: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", type=Path, help="large_images directory containing the selected dates.")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets" / "time-series")
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()
    try:
        prepare_series(args.source_root, args.output_dir, replace=args.replace)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Time-series preparation failed: {error}\n")
