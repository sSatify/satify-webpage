"""Stack an aligned scene without resampling; requires GDAL command-line tools.

Uses only Python's standard library. Every output band's decoded pixels are
compared with its source before publishing the TIFF and provenance manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

BAND_ORDER = ("B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B8A", "B9", "B11", "B12")
ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class Gdal:
    def __init__(self):
        self.env = os.environ.copy()
        self.programs = {}
        for name in ("gdalinfo", "gdalbuildvrt", "gdal_translate"):
            executable = shutil.which(name)
            if not executable:
                raise ValueError(f"{name} is missing. Install GDAL and add its bin directory to PATH.")
            self.programs[name] = executable
        # OSGeo's Windows distribution keeps PROJ data beside its executables.
        bundled_proj = Path(self.programs["gdalinfo"]).parent / "projlib"
        if not self.env.get("PROJ_DATA") and not self.env.get("PROJ_LIB") and (bundled_proj / "proj.db").is_file():
            self.env["PROJ_DATA"] = str(bundled_proj)

    def run(self, program: str, *args: object) -> str:
        result = subprocess.run(
            [self.programs[program], *map(str, args)], env=self.env,
            capture_output=True, text=True, check=False,
        )
        if result.returncode:
            raise ValueError(f"{program} failed: {result.stderr.strip()}")
        if result.stderr.strip():
            # Do not accept quietly skipped inputs or a broken CRS database.
            raise ValueError(f"{program} reported a warning: {result.stderr.strip()}")
        return result.stdout

    def info(self, path: Path) -> dict:
        return json.loads(self.run("gdalinfo", "-json", path))

    def pixels(self, path: Path, band: int, destination: Path) -> str:
        self.run("gdal_translate", "-q", "-of", "ENVI", "-b", band, path, destination)
        return digest(destination)


def grid(info: dict) -> tuple:
    return (info["size"], info.get("geoTransform"), info.get("coordinateSystem", {}).get("wkt"))


def prepare(source: Path, output: Path, *, replace: bool = False) -> dict:
    source, output = source.resolve(), output.resolve()
    manifest_path = output.with_suffix(".json")
    if output.suffix.lower() not in (".tif", ".tiff"):
        raise ValueError("Output must be a .tif or .tiff file.")
    if output.parent == source or source in output.parents:
        raise ValueError("Keep the output outside the source scene directory.")
    if not replace and (output.exists() or manifest_path.exists()):
        raise ValueError("Output already exists. Use --replace to rebuild the bundle.")
    paths = [source / f"{name}.tif" for name in BAND_ORDER]
    missing = [path.name for path in paths if not path.is_file()]
    if missing:
        raise ValueError(f"Missing source bands: {', '.join(missing)}")
    extra = sorted(path.name for path in source.iterdir() if path.suffix.lower() in (".tif", ".tiff") and path not in paths)
    if extra:
        raise ValueError(f"Unexpected TIFFs; review the explicit band order first: {', '.join(extra)}")

    gdal = Gdal()
    infos = [gdal.info(path) for path in paths]
    reference = infos[0]
    if not reference.get("geoTransform") or not reference.get("coordinateSystem", {}).get("wkt"):
        raise ValueError("The source scene needs an embedded CRS and geotransform.")
    for path, info in zip(paths, infos):
        if len(info["bands"]) != 1:
            raise ValueError(f"{path.name} must contain exactly one band.")
        if grid(info) != grid(reference):
            raise ValueError(f"{path.name} has a different grid or CRS; resampling is deliberately not automatic.")
        if info["bands"][0]["type"] != reference["bands"][0]["type"]:
            raise ValueError(f"{path.name} has a different data type.")
        if str(info["bands"][0].get("noDataValue")) != str(reference["bands"][0].get("noDataValue")):
            raise ValueError(f"{path.name} has different nodata; one GeoTIFF cannot preserve that contract.")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="scene-", dir=output.parent) as temporary:
        temp = Path(temporary)
        vrt = temp / "stack.vrt"
        gdal.run("gdalbuildvrt", "-q", "-separate", vrt, *paths)
        tree = ET.parse(vrt)
        vrt_bands = tree.getroot().findall("VRTRasterBand")
        if len(vrt_bands) != len(paths):
            raise ValueError("GDAL did not include every source band.")
        for band, name, info in zip(vrt_bands, BAND_ORDER, infos):
            ET.SubElement(band, "Description").text = name
            # These are spectral channels, not RGB/alpha samples.
            color = band.find("ColorInterp")
            if color is not None:
                band.remove(color)
            ET.SubElement(band, "ColorInterp").text = "Undefined"
            for key in ("scale", "offset"):
                if key in info["bands"][0]:
                    element = band.find(key.title())
                    if element is None:
                        element = ET.SubElement(band, key.title())
                    element.text = str(info["bands"][0][key])
        tree.write(vrt, encoding="utf-8", xml_declaration=True)
        staged = temp / output.name
        gdal.run("gdal_translate", "-q", "-of", "GTiff", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE", vrt, staged)
        combined = gdal.info(staged)
        if grid(combined) != grid(reference) or len(combined["bands"]) != len(paths):
            raise ValueError("The output grid or band count differs from the source.")

        records = []
        for index, (name, path, info) in enumerate(zip(BAND_ORDER, paths, infos), 1):
            actual, original = combined["bands"][index - 1], info["bands"][0]
            if actual.get("description") != name or any(
                str(actual.get(key)) != str(original.get(key)) for key in ("type", "noDataValue", "scale", "offset")
            ):
                raise ValueError(f"Output metadata mismatch for {name}.")
            source_pixels = gdal.pixels(path, 1, temp / f"source-{index}.bin")
            output_pixels = gdal.pixels(staged, index, temp / f"output-{index}.bin")
            if source_pixels != output_pixels:
                raise ValueError(f"Decoded output pixels differ for {name}.")
            records.append({"index": index, "name": name, "source_file": path.name,
                            "source_sha256": digest(path), "pixels_sha256": source_pixels})

        duplicates = []
        for index, record in enumerate(records):
            for previous in records[:index]:
                if record["pixels_sha256"] == previous["pixels_sha256"]:
                    duplicates.append([previous["name"], record["name"]])
        manifest = {
            "schema_version": 1, "source_scene": source.name,
            "file": output.name, "sha256": digest(staged), "bytes": staged.stat().st_size,
            "width": reference["size"][0], "height": reference["size"][1],
            "crs_wkt": reference["coordinateSystem"]["wkt"], "geotransform": reference["geoTransform"],
            "data_type": reference["bands"][0]["type"], "bands": records,
            "identical_pixel_bands": duplicates,
            "verification": "Each decoded output band is byte-identical to its source; no resampling or type conversion.",
            "gdal_version": gdal.run("gdalinfo", "--version").strip(),
            "notes": ["Band names are preserved as descriptions. Duplicate bands are retained as supplied.",
                      "The source directory name describes mirroring; original acquisition/export provenance has not been verified."],
        }
        staged_manifest = temp / manifest_path.name
        staged_manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        staged.replace(output)
        staged_manifest.replace(manifest_path)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Directory containing B1.tif ... B12.tif (without B10).")
    parser.add_argument("--output", type=Path, default=ROOT / "assets" / "demo-scene.tif")
    parser.add_argument("--replace", action="store_true", help="Replace an existing generated bundle after verification.")
    args = parser.parse_args()
    try:
        manifest = prepare(args.source, args.output, replace=args.replace)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Scene preparation failed: {error}\n")
    print(f"Verified {len(manifest['bands'])} bands: {args.output.resolve()}")
    if manifest["identical_pixel_bands"]:
        print(f"Identical pixel bands retained: {manifest['identical_pixel_bands']}")


if __name__ == "__main__":
    main()
