# Coastal time-series demonstration data

Three Sentinel-2 exports of tile **T32UMF** provide a common view of coastal
farmland and tidal flats. Their sensor identification follows the tile name,
timestamps and B1–B12/B8A band inventory; these are not Landsat scenes.

| File | Acquisition date from source name | Size |
| --- | --- | --- |
| `coast-2021-09-01.tif` | 2021-09-01 | about 14.9 MB |
| `coast-2022-08-15.tif` | 2022-08-15 | about 14.7 MB |
| `coast-2022-09-04.tif` | 2022-09-04 | about 15.0 MB |

The TIFFs and their scene JSON files are downloaded from the pinned GitHub dataset
release and cached here; they are ignored by Git. Each scene JSON records the input hashes, output hash, decoded band hashes,
original dimensions and transform, crop window, band order and date provenance.
Git tracks `selection.json` to reproduce the cutouts and `../release.json` to pin
the size and checksum of every downloaded file.

## Selection and interpretation

Inspected all five dates in `test_data/large_images`. The 2021-08-30 and 2021-09-14
overviews have substantial cloud cover; the selected dates provide a clearer
common view. The cutout includes recognisable field boundaries, settlement,
shoreline, channels and tidal flats. Field colours and vegetation differ between
dates, providing useful targets for a time-series or difference-map demonstration.
A little cloud remains at the upper-left edge of the 2021 cutout; keep demonstrations
on the fields and shoreline. This is a visual selection, not a formal cloud mask.

Differences in water/tidal flats can reflect tide and sediment; field differences
can reflect crop state, harvest, season and illumination. Do not describe them as
confirmed permanent land-cover change or attribute a cause from these images alone.

The earlier Forest search covered 221 folders / 217 distinct scene names. Its
strongest pair was dated 2019-09-01 and 2019-09-16, with about 90% overlap and small
registration residuals in the approximately georeferenced mirrored exports.
The larger, matching-grid three-date series was selected instead. Forest candidate
bundles are not included in this project.

## Grid and samples

- Source exports: 6711 × 10981 pixels, Float32, EPSG:32632.
- Common source pixel window: x=3300, y=5500, width=1024, height=1024.
- Output: 1024 × 1024 pixels at 10 m (10.24 km square), matching transforms on all dates.
- Top-left grid corner: easting 473180 m, northing 6045020 m.
- All 13 supplied bands: B1, B2, B3, B4, B5, B6, B7, B8, B8A, B9, B10, B11, B12.
- Original NoData value (-Infinity), data type and band samples are preserved.
  All pixels in the selected windows are finite in all 13 bands.

The script crops in source pixels and stacks bands. It does not resample, shift,
reproject or apply radiometric corrections. Every decoded output band is verified
against its corresponding source window. The 10 m grid is the supplied export
grid; it does not imply that every Sentinel-2 band was originally acquired at 10 m.

Original SAFE/product metadata is absent. The source TIFFs carry `forced_epsg`
and `source_file` metadata; their export history was not independently verified.
Acquisition dates are taken from directory names. The demo explicitly imports
with scale 0.0001 and offset 0; this does not establish product level, atmospheric
correction or processing-baseline offsets. Use this set for demonstrating the UI,
not calibrated quantitative change claims.

## Rebuild and use

[selection.json](selection.json) defines the source folders under
`Satify_files/04_Data_and_Test_Data/test_data/large_images`, bands and window.
See the [video guide](../../README.md#time-series-project) for rebuilding and
`npm run setup:time-series`. Setup downloads missing bundles automatically, verifies
their checksums and reuses the local cache. It does not need the H: drive. You can
also run `npm run fetch-assets -- --dataset time-series` from `videos/` beforehand.
This directory is excluded from the website build.
