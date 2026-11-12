# Tool gallery videos

The approved gallery is `/tools/` (`web/tools/index.html`). It replaces both
`/app/` and `/app2/`; those old pages and their long published videos are removed.
The gallery shares `web/styles.css` for SATIFY branding. Its own CSS and JS handle
the grid and players. The homepage app section links to the gallery; it is open
to search indexing.

## Selected exports

All five clips are silent H.264, 1280 × 720, 30 fps, with fixed prominent SATIFY
branding and Saty. Four run for five seconds; Change detection runs for eight.
The website assets and posters are in `web/assets/videos/gallery/`.
`clips.json` pins their exact hashes, dimensions, durations and edit versions.
The static build copies only `web/`, excluding the recorder and sources.

| Clip | Editor in tools/videos/scripts/ | Selected output in tools/videos/output/ |
| --- | --- | --- |
| Smart Fill · Global only | `edit-smart-fill-micro.py` | `smart-fill-micro-pilot-v1/satify-smart-fill-5s-v1.mp4` |
| Rivers & Roads Pen | `edit-roads-micro.py` | `roads-micro-pilot-v5/satify-roads-5s-v5.mp4` |
| Sync labelling | `edit-time-series-micro.py` | `time-series-micro-pilot-v2/satify-time-series-5s-v2.mp4` |
| Change detection | `edit-change-micro.py` | `change-micro-pilot-v3/satify-change-8s-v3.mp4` |
| Propagate labels · Experimental | `edit-propagate-micro.py` | `propagate-micro-pilot-v2/satify-propagate-5s-v2.mp4` |

## Retained source recordings

The exact inputs for all five edits are versioned under
`tools/videos/assets/sources/`, outside the published site:

- `smart-fill.mp4`, `time-series.mp4`, `propagate.mp4`: original longer recordings.
  `recordings.json` pins their SHA-256 hashes and app/build provenance, including
  verified Global fill counts and Water/Seagrass counts across the three dates.
- `rivers-roads.webm` and `rivers-roads.json`: raw local capture from
  `2026-11-11T15-42-08-514Z-local-road-micro`, v3.0.1-local. Revision-2 width fitting,
  159.8 m loose guide, curvature 0.25, zero buffer. Preview and saved Apply agreed
  at 280 road pixels; the recorder undid its own operation.
- `change-detection.webm` and `change-detection.json`: raw local capture from
  `2026-11-12T08-48-02-732Z-local-change-micro`, v3.0.1-local. NDVI difference between
  2022-08-15 and 2022-09-04, with the real histogram drag to approximately −0.20.
  Apply and native tiles agreed at 7,560 pixels; both dates were empty after Undo.

The two raw-capture JSON files retain editing/verification metadata and raw hashes.
Their video paths are relative to the JSON, so they work in a fresh checkout.
Private browser state and managed-project identifiers are excluded. The original
ignored capture directories are left intact locally. The sources show real SATIFY
imagery and raster results; edits shorten timing and add captions, branding and
click emphasis. They do not generate the labelled map pixels.

## Reproduce the current edits

Requirements: Python with Pillow and NumPy, FFmpeg, and Windows Segoe UI fonts.
The scripts currently use `C:/Windows/Fonts`; adapt the font helper when using
another operating system. Commands below run from the repository root:

Create an isolated editing environment once, then activate it before rendering:

```powershell
python -m venv tools/videos/.venv
& tools/videos/.venv/Scripts/Activate.ps1
python -m pip install -r tools/videos/requirements-editing.txt
```

```powershell
python tools/videos/scripts/edit-smart-fill-micro.py --ffmpeg ffmpeg
python tools/videos/scripts/edit-roads-micro.py --ffmpeg ffmpeg --recording tools/videos/assets/sources/rivers-roads.json
python tools/videos/scripts/edit-time-series-micro.py --ffmpeg ffmpeg
python tools/videos/scripts/edit-change-micro.py --ffmpeg ffmpeg --recording tools/videos/assets/sources/change-detection.json
python tools/videos/scripts/edit-propagate-micro.py --ffmpeg ffmpeg
```

Replace the `ffmpeg` argument with an executable path if it is not on PATH.
Outputs include the MP4, `poster.jpg`, `edit.json`, frame/contact sheets and a
preview under ignored `tools/videos/output/`. These commands do not publish or
replace selected website assets. Byte-identical exports depend on encoder, font
and imaging-library versions; the selected website hashes are the reference.
The source hashes are checked before rendering.

Current edit decisions:

- **Smart Fill:** Global action only, source seconds 13.25–14.1. Crop away the
  controls and previous captions. Caption: “Click once. Label matching forest
  patches.” A short graphic pulse marks the real click.
- **Roads:** one fixed crop rotated 90° counterclockwise. Clean view 0–0.6 s,
  loose stroke 0.6–3.1, fitted preview 3.1–4.0, Apply 4.0–4.4 and persisted result
  4.4–5.0. Caption: “Mark it roughly. SATIFY finds the road.” No sound effects.
- **Sync labelling:** three aligned coastal crops from each same source frame.
  Water appears at 0.6 s and simultaneously on both target dates at 0.9 s.
  Seagrass follows at 2.0/2.4 s, completed at 3.3 s. Source snapshots are 6.25,
  6.4, 7.1, 17.2, 18.0 and 20.8 s. Caption: “Label once. Sync across dates.”
- **Change detection:** reference/current dates at 0/0.9 s, NDVI difference at
  1.8, histogram/threshold at 3.0, selected NDVI mask again at 5.5, saved labels
  at 6.8. Caption: “What changed?” The real ramp key is repositioned intact.
  A decrease in NDVI indicates potential vegetation loss, without attributing
  a cause.
- **Propagate:** source 0.3 s clean frame; drawing intervals 4.7–6.2, 10.2–11.6
  and 14.9–16.5 s are retimed to 31 frames each, followed by the saved result at
  source 23.5 s. The final result holds 1.4 s including the transition. Crops
  compensate for the recorded workspace shift. Caption: “Teach a little. Label
  a lot.” The experimental tool name remains visible.

Saty is the transparent two-pose adaptation in `tools/videos/assets/micro/`.
Its adjacent JSON preserves the reference and generation prompt. The same logo,
large fixed mascot and single main visual area are used throughout. Saty can
crossfade to the happy pose without disappearing.

## Record a new take

See [the recorder guide](../tools/videos/README.md) for dependency/browser setup,
scene data and managed-project rules. Run recorder commands from `tools/videos/`.
For the local app, always pass `--url http://127.0.0.1:3030` to login, setup and
capture. Login opens its own Edge window: let the user sign in there and save
that session before setup. On this workstation launch interactive login outside
the Codex sandbox. Keep the password in the browser.

```powershell
npm run login -- --url http://127.0.0.1:3030
npm run setup -- --dataset tools --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 tools"
npm run showcase -- smart-fill --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 tools"
npm run setup -- --dataset time-series --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 sync preview"
npm run showcase -- time-series --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 sync preview"
node scripts/record-road-micro.mjs --url http://127.0.0.1:3030 --expect-version 3.0.1-local
node scripts/record-change-micro.mjs --histogram --url http://127.0.0.1:3030 --expect-version 3.0.1-local
```

Use the actual intended app version for a new take. Verify dark mode and Tool
videos off before capture. The road/change recorders prepare their own separate
projects; use `--prepare` to prepare without capturing. Run sequentially and do
not edit a managed project in another browser. Propagate's selected source was
recorded on production v3.0.0; `showcase -- propagate` also supports an explicitly
selected local origin for future rerecording. Existing project ownership state
is local and origin-specific; a fresh checkout must prepare its own projects.

## Review and select

1. Decode the entire export. Confirm H.264, 1280 × 720, 30 fps, the approved
   duration and no audio track.
2. Inspect short consecutive frame sequences around every edit and abrupt image
   change. One-second contact sheets can miss brief resize glitches.
3. Check real tool output, Preview/Apply agreement, saved raster pixels and cleanup
   receipts for a new capture. Review captions and persistent Saty/logo placement.
4. Copy the approved MP4 and poster into `web/assets/videos/gallery/` using the
   filenames in `clips.json`; update its hashes and edit version together.
5. Run `npm run check` and `npm run build`. Play the selected files to completion
   in the built `/tools/` page, including the enlarged viewer, both themes and
   narrow/mobile widths. Check exclusive playback and no-JS native controls.

Failed Select Similar trials and their scripts were removed after roof selection
proved unsuitable for this gallery. Old public long-video assets and unused page
styles were removed; the reusable recorder, approved sources and artwork remain.
Historical ignored local takes are not published. Basemap attribution in the
original recordings: © OpenStreetMap contributors.
