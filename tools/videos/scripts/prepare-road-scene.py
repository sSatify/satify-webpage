"""Prepare the owner's separate forest-road trial scene with Rasterio.

Run in an environment with rasterio installed. Source bands are read-only; all
12 decoded bands, their grid and types are checked after stacking.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import numpy as np
import rasterio

BANDS = ('B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12')

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def prepare(source, output, display_name='Forest scene 2019-08-20'):
    source, output = source.resolve(), output.resolve()
    if source == output.parent or source in output.parents:
        raise ValueError('Output must be outside the source directory.')
    if output.exists() or output.with_suffix('.json').exists():
        raise ValueError('Keep the existing trial bundle; choose a new output name to rebuild.')
    # Google Drive's shortcut path exceeds MAX_PATH once a band name is added.
    if os.name == 'nt' and not str(source).startswith('\\\\?\\'):
        source = Path('\\\\?\\' + str(source))
    paths = [source / (band + '.tif') for band in BANDS]
    if any(not path.is_file() for path in paths):
        raise ValueError('All twelve expected source TIFFs are required.')
    if set(source.glob('*.tif')) != set(paths):
        raise ValueError('Unexpected TIFF bands; review the source selection.')
    arrays, records = [], []
    for index, (band, path) in enumerate(zip(BANDS, paths), 1):
        with rasterio.open(path) as src:
            grid = (src.width, src.height, src.transform, src.crs, src.dtypes, repr(src.nodata))
            if index == 1:
                reference, profile = grid, src.profile.copy()
            if grid != reference or src.count != 1 or src.crs is None:
                raise ValueError(f'{band}: grid, CRS, type or nodata differs.')
            data = src.read(1)
            arrays.append(data)
            records.append({'index': index, 'name': band, 'source_file': path.name,
                            'source_sha256': digest(path),
                            'pixels_sha256': hashlib.sha256(data.tobytes()).hexdigest()})
    output.parent.mkdir(parents=True, exist_ok=True)
    staged = output.with_suffix('.part.tif')
    profile.update(driver='GTiff', count=len(BANDS), tiled=True, blockxsize=256, blockysize=256, compress='deflate')
    with rasterio.open(staged, 'w', **profile) as dst:
        for index, (band, data) in enumerate(zip(BANDS, arrays), 1):
            dst.write(data, index)
            dst.set_band_description(index, band)
    with rasterio.open(staged) as dst:
        assert (dst.width, dst.height, dst.transform, dst.crs, (dst.dtypes[0],), repr(dst.nodata)) == reference
        for index, (data, record) in enumerate(zip(arrays, records), 1):
            assert np.array_equal(dst.read(index), data, equal_nan=True)
            assert dst.descriptions[index - 1] == record['name']
            assert digest(paths[index - 1]) == record['source_sha256'], 'Source changed during preparation'
        manifest = {'schema_version': 1, 'source_scene': source.name, 'displayName': display_name,
                    'file': output.name, 'sha256': digest(staged), 'bytes': staged.stat().st_size,
                    'width': dst.width, 'height': dst.height, 'crs_wkt': dst.crs.to_wkt(),
                    'geotransform': list(dst.transform.to_gdal()), 'data_type': dst.dtypes[0], 'bands': records,
                    'verification': 'Each decoded output band equals its source; no resampling or type conversion.',
                    'rasterio_version': rasterio.__version__, 'gdal_version': rasterio.__gdal_version__}
    staged.replace(output)
    output.with_suffix('.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    # Review-only natural-colour preview; the TIFF retains every original value.
    rgb = np.stack([arrays[BANDS.index(band)] for band in ('B4', 'B3', 'B2')])
    shown = np.zeros(rgb.shape, dtype='uint8')
    for channel in range(3):
        lo, hi = np.nanpercentile(rgb[channel], [2, 98])
        shown[channel] = np.clip((rgb[channel] - lo) / max(hi - lo, 1e-9) * 255, 0, 255).astype('uint8')
    with rasterio.open(output.with_suffix('.png'), 'w', driver='PNG', width=rgb.shape[2], height=rgb.shape[1], count=3, dtype='uint8') as dst:
        dst.write(shown)
    print(json.dumps({key: manifest[key] for key in ('file', 'width', 'height', 'geotransform', 'data_type', 'sha256')}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--display-name', default='Forest scene 2019-08-20')
    args = parser.parse_args()
    prepare(args.source, args.output, args.display_name)
