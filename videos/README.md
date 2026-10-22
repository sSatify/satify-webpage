# Repeatable tool videos

This folder contains portable demonstration data, project setup, and website
showcases for Pen, Smart Fill, and time-series change detection. The scripts operate the real SATIFY
editor at `https://app.satify.tech` by default, or `https://app-dev.satify.tech`
with `--env dev`, and export silent videos for a 500 × 450
website player (1200 × 1080 for change detection). The recorder is self-contained in this website repository; it
does not need the application source, Docker or a local SATIFY instance.
Website playback integration will be added separately.

Migrated from `sSatify/satify-app`, branch `feat/script-tool-videos_mp`, commit
`a5a67afa6010de1ebf15435aeb8fb7e03d7803e0`. The portable scene and project workflow
are preserved. The original tutorial scenarios have been rewritten as silent,
benefit-focused website showcases, with visible actions and results.

## Repository contents

- `assets/`: tracked selection definitions and the pinned dataset release with checksums.
  Downloaded scene JSON and GeoTIFFs are cached here and ignored by Git.
- `scripts/`, `scenarios/`, `tests/`: reusable recording code and automated checks.
- Configuration, npm package/lock files, this README and `.gitignore`.

New recordings and diagnostic images go to the Git-ignored `output/` directory.
Generated videos are reproducible and are not committed in this folder. When a
video is selected for the website, copy its reviewed MP4 into `../assets/videos/`
as part of the playback integration. The website build already copies `assets/`.
WebM intermediates, posters, test output and scratch images
are also excluded. The ignored `.state/`, `.cache/` and `node_modules/` directories
are local runtime data; keep `.state/` to retain login and managed-project identity.

## Status

Website showcase pass, 22 October 2026: both scripts recorded successfully against
`app-dev.satify.tech`. Pen exports at about 29 seconds / 503 KB; Smart Fill at about
23 seconds / 1.5 MB, both silent H.264 at 500 × 450. Reviewed before/result frames,
final video frames, and desktop/mobile previews. All 34 Node tests and the browser
recording/export/responsive-preview smoke test pass. These are first review drafts;
the new scenarios have not yet been recorded against production. The revised Pen
result was checked against the traced dark shoreline in both the saved native tile
and rendered image: no yellow over the water, no blue outside the yellow outline,
and no unpainted pixels anywhere inside it.

Change detection was also recorded on dev: about 19 seconds / 6.3 MB at 1200 × 1080.
New recordings keep only this large MP4 as the video output. It compares
the three dates, narrows the August–September 2022 NDVI decrease range, and applies
an 8,007-pixel mask. The recorder verifies the server result, then undoes its own
mask after capture and checks that no labels remain in the managed drawing layer.

Verified after migration on 22 October 2026: all 9 project tests, all 4 GDAL
scene tests, the browser authentication test, and the synthetic recording test
(including 500 × 450 H.264 export) pass from this repository. The bundled scene
matches its manifest. The website check and build pass, and the build excludes
this tooling directory. Those checks describe the original migration, before the
website showcase rewrite above.

The following checks were completed in the original application repository
before migration. They describe the local stack at that time, not verification
against the current published application:

- All 12 bands in `assets/demo-scene.tif` have decoded pixels identical to their
  source TIFFs, with the same dimensions, data type, CRS and transform.
- The current router recognised every band, accepted the generated metadata and
  upload, and converted the scene successfully in an isolated container.
- Project lifecycle tests cover reuse, interrupted upload recovery, configuration
  changes, name collisions, failed preparation and restricted drawing reset.
- A real Chromium smoke test exercised the visible cursor, button click,
  captions, WebM capture, and valid H.264 MP4 export at 500 × 450.
- Both scenarios have run in the authenticated local SATIFY stack. Smart fill
  compares three masks and applies Local, In viewport and Global fills, using
  Undo between scopes. The recorder checks the fill requests' scope and pond
  coordinates as well as their successful responses.

Review each clip at its final playback size before publishing. The browser smoke
test uses a synthetic page; the scenario recordings operate the actual editor.
Each scenario has its own focus, zoom, subject position and tool-card position.
The current clips crop a 600 × 540 imagery area and export at 500 × 450. The
browser remains larger so unrelated help panels and navigation controls stay
outside the crop. Smart Fill's mask and scope controls are inside the frame.
No application UI or imagery is painted over or removed.
This is a camera crop: **In viewport** still means SATIFY's full editor viewport,
not just the portion shown in the video. The dashed outline marks the original
full editor viewport when the Smart Fill demonstration zooms out.

## Website showcase direction

Each clip demonstrates one benefit through visible actions and results. The Pen
panel stays visible while drawing a yellow outline with two brush sizes, switching
to the blue label, increasing the brush size and selecting Fill gaps. Smart Fill changes masks and
selects each fill scope. There are no instructional captions, undo comparisons, voiceovers,
or speed changes. The pointer stays inside the recorded frame at all times,
including pauses. Pen rests beside the size field; Smart Fill keeps its cursor on
the subject while previewing masks with Shift + scroll. It moves to the card only
to change scope and for the final hold, clearing the preview without hiding the cursor.

- **Pen — Make every detail count:** trace a yellow boundary around the pond, select
  blue in the on-image label picker, then use a wider brush in Fill gaps mode.
  Use 4 px on the outer yellow curve and 2 px on the tight inner bend.
  The brush overlaps the existing yellow pixels without replacing them. Hold the
  two-colour result. Aim for 20–30 seconds.
- **Smart Fill — Choose the region. Choose the reach.:** explore masks, fill the
  forest with Local, extend the result with In viewport, then use Global. Zoom out
  to reveal the viewport boundary and labels beyond it. Aim for 20–30 seconds.

Timing is a guide, not a hard limit: real server responses and rendering are
awaited. Every export includes `before.png`, a final `poster.png`, and a local
`preview.html` pairing the video with draft benefit copy. The preview displays
the video at up to 500 × 450 with text alongside; below 720 px, text moves below
the video and the video scales proportionally. Playback is silent, user-controlled,
and loopable. This preview does not publish or change the website.

## First recording

Use Node.js 22 or newer and install FFmpeg (`ffmpeg` and `ffprobe` on PATH).
From this directory:

```powershell
npm ci
npm run browsers
npm run login
npm run record -- pen
npm run record -- smart-fill
```

Setup and recording automatically download missing scenes from the pinned
[demo-data-v2 release](https://github.com/sSatify/satify-webpage/releases/tag/demo-data-v2)
before opening the app. To download all four scenes separately (about 53 MB):

```powershell
npm run fetch-assets
```

Use `-- --dataset tools` for just the urban forest scene or `-- --dataset time-series`
for the three coastal scenes. Valid cached files are reused without network access;
every JSON and TIFF is checked against the SHA-256 and size in `assets/release.json`.
Scene JSON files are downloaded and verified first; their image references and
checksums must agree with that lock before any imagery is downloaded.
Downloads are staged under temporary filenames and only installed after verification.
Interrupted or invalid downloads are discarded. If a local JSON or TIFF differs, it is kept
and the command stops; `npm run fetch-assets -- --force` explicitly restores the
published copies. The standalone downloader needs only Node.js, not Playwright.

This repository and its release are public, so downloads need no account. For a
private dataset repository, the downloader can use `GH_TOKEN` / `GITHUB_TOKEN`, or
the GitHub CLI login (`gh auth login`), with repository read access. Credentials
are used only for GitHub API requests and are never written into manifests.

`login` opens a separate Chromium window. Sign in to SATIFY there, then press
Enter in the terminal. Credentials and browser cookies stay in `.state/`, which
is Git-ignored. The app's normal authentication and permissions still apply.
The login page resizes with its window; you can enlarge or maximize it normally.
Setup uses the viewport from `config.json`; each recording then applies its
scenario's framing settings.
The bundled Chromium and its encoder are installed in `.cache/browsers/`.

The default URL is `https://app.satify.tech`. Setup prepares both projects in order:
`SATIFY tool demonstrations - urban forest`, then
`SATIFY time-series demonstrations - coastal farmland`:

```powershell
npm run setup
```

Use `--env dev` to target the development app. Pass it to each login, setup and
record command; the selection is per invocation and is not saved as a default:

```powershell
npm run login -- --env dev
npm run setup -- --env dev
npm run record -- pen --env dev
```

Setup waits for the first project to finish before starting the second. Existing
ready projects are reused. If either setup fails, the command stops; rerun it to
resume using the saved project state and upload checkpoints.

To prepare just one project, use `npm run setup -- --dataset tools` or
`npm run setup:time-series`, adding `--env dev` as needed. When giving setup a
custom `--project` name, also specify `--dataset` to select the intended project.

Omit `--env` or use `--env prod` for production. Login and project state remain
separate for each app, so sign in once per environment. Existing saved state
for either URL is reused. The advanced `--url ORIGIN` override is also available;
use it on its own, without `--env`.

Each `record` invocation prepares only its selected dataset automatically.
`npm run record` records both tools
scenarios. `npm run record -- change-detection --env dev` records change detection
using the time-series project automatically. Add `--headed` to watch the browser.
Results go to a new timestamped
directory under `output/`:

- `<scenario>.mp4`: 500 × 450 for Pen/Smart Fill; 1200 × 1080 for change detection.
- `<scenario>-unscaled.mp4`: the cropped scene at its original pixel dimensions (Pen/Smart Fill only).
- `<scenario>.webm`: the same crop before MP4 export (Pen/Smart Fill only).
- `capture.webm`: the original browser capture, retained for later reframing (Pen/Smart Fill only).
- Before/result images, provenance JSON with retained output sizes, and `preview.html`
  with pause/replay controls.

Change detection keeps only the large MP4, removing temporary WebMs after a
successful export. Setup, upload and processing are
outside the recorded interval. Failed runs keep a diagnostic screenshot and may
leave a partial WebM, but do not produce a successful recording manifest.

To use a separate demo project on the published app:

```powershell
npm run record -- pen --project "SATIFY website video pilot"
```

Login is saved separately per origin; project identity is saved separately per
origin and project name. Setup and recording write to the selected app using
your signed-in account: they create or reuse the dedicated demo project and
reset its drawing layer before each recording, as described below. Sign in
afresh in this checkout; login state and local project identities are not part
of the migration. The optional `--url` override remains available, but no local
application build is needed for this workflow.

## What setup and reset do

The following describes the original single-scene `tools` dataset. The separate
time-series dataset and its setup are described below.

Setup verifies the TIFF against `assets/demo-scene.json`, detects its bands through
the router, creates the named project, saves its ID, supplies calibration and
labels, obtains a preparation slot, uploads once and waits for scene/mask
preparation. Successful reruns reuse the prepared scene. Checkpoints retain the
new project ID and browser ownership while an upload or processing run is in
progress, allowing setup to resume after an interruption.

A project with the same name is **not adopted** when the recorder has no saved
ID. A changed scene, calibration or label configuration requires a different
project name; existing projects are not deleted automatically. If preparation
fails, inspect the demo project in SATIFY and rerun setup. If its original upload
has expired or been removed, start with a new name.

Before each clip, recording selects that saved project and clears only the
scene's `Drawing Layer 1` (shown as **Raster labels**), including its native tiles
and legacy PNG snapshot. This is the layer the current editor initializes on
load. The recorder reserves it within its dedicated demo project. It restores
the demo labels, selected Water label, Pen settings, natural-colour display,
stretch and image fit. Masks and source imagery are retained. Do not use the
managed project for normal work or edit it in another window while recording.

The `run.lock` file prevents concurrent recorder runs for the same project. If a
process crashes, check that it has stopped before removing that single file.
Keep `.state/` if you want subsequent runs to recognise their managed projects.

## Scene provenance and rebuilding

The bundled scene comes from:

```text
E:\satify_copy\Forest\selection_trees_gte_20pct__built_gte_20pct__diag_mirror__center_georef\group_001_images_000001_to_000009\dw_-111.4634822751_56.7543659975-20190517
```

It has 510 × 510 pixels, 12 Float64 bands, and EPSG:4326 georeferencing. Band
order is **B1, B2, B3, B4, B5, B6, B7, B8, B8A, B9, B11, B12**. B8 and B8A are
identical in the supplied source and remain so in the bundle. The source folder
name indicates a mirrored selection; acquisition and export provenance were not
independently verified. Do not use it to illustrate differences between B8 and B8A.

This urban/forest scene replaces the initial northern forest/lake example.
The new project name keeps its setup identity separate from that earlier scene. The bundle
uses the neutral filenames `demo-scene.tif` and `demo-scene.json`; the manifest identifies the
actual source scene and its hashes.

`demo-scene.json` contains source hashes, decoded-pixel hashes, output hash, band
order, georeferencing and conversion-tool version. No original absolute path is
needed to record: the bundled TIFF is the complete portable input.

The owner confirmed a scale of **0.0001** and offset **0**. These are explicit
import settings in `config.json`; the combined TIFF preserves the original
samples. No L1C/L2A level is invented. Calibration is secondary for these painting
demos, but retaining it avoids silently changing the data interpretation.

Rebuilding requires Python 3.11+ and GDAL's `gdalinfo`, `gdalbuildvrt` and
`gdal_translate` on PATH. No Python packages are needed:

```powershell
python scripts/prepare-scene.py "E:\path\to\the\source-scene" --replace
```

The script rejects missing bands, extra TIFFs, differing grids, CRS, data types
or nodata values. It stacks without resampling, adds band descriptions and checks
every decoded output band before replacing the output. Original files are never
modified. Use `--output` for a different bundle. Regeneration can produce a
different compressed file hash with a different GDAL version, even when the
decoded pixels remain identical.

## Time-series project

Three matching Sentinel-2 cutouts are defined in [assets/time-series/](assets/time-series/README.md):
1 September 2021, 15 August 2022 and 4 September 2022. They show coastal farmland
and tidal flats on tile T32UMF, using the same 1024 × 1024 window on a 10 m grid.
All 13 supplied bands, including B10, are retained without resampling. The three
TIFFs total about 45 MB and are downloaded from the dataset release into that folder.
H: is only needed to rebuild them, not to set up the project.

From `videos/`, after the usual dependency/browser installation:

```powershell
npm run login
npm run setup:time-series
```

This creates or resumes **SATIFY time-series demonstrations - coastal farmland**
on the selected app (production by default). Its selection, labels and calibration are under `timeSeries`
in `config.json`. Login is shared with the tools dataset for the same origin;
saved project identity and upload checkpoints are separate. A same-named project
without a saved identity is not adopted. Use a new name when changing the inputs:

```powershell
npm run setup:time-series -- --project "SATIFY coastal series v2"
```

Setup verifies every bundled TIFF, detects all three scenes, saves dated metadata,
uploads them into one project and requests preparation together. Each successful
upload is checkpointed, so an interrupted run skips files already acknowledged.
Ready projects are checked and reused without resetting their labels. The original
Pen/Smart fill recordings continue to use the urban forest scene. The default
`npm run setup` prepares both this tools project and the time-series project;
`npm run setup:time-series` prepares only the latter.

The project's images are ready for time-series/change-detection recording on dev:

```powershell
npm run record -- change-detection --env dev
```

The named scenario selects the time-series dataset automatically; an explicit
mismatched `--dataset tools` is rejected before contacting the app. Alternatively,
`npm run record -- all --dataset time-series --env dev` records all scenarios for
this dataset. Production remains the default when `--env` is omitted.

This scenario opens the September 2022 image, briefly shows the three dates with
shared zoom, then compares August and September using NDVI. It visibly drags the
range boundary to about −0.2, selects Open ground, and applies the mask. The source
crop and final `change-detection.mp4` are 1200 × 1080. No smaller MP4 or WebM
intermediates are retained after export. Its responsive preview uses this video
and stacks the text below it on screens up to 1600 px wide.

Recording refuses pre-existing pixels in the managed drawing layer of the current
scene. After capture, it undoes only its own Apply operation and verifies that the
layer is empty again. It never blanket-resets time-series labels. The recorded
date pair, threshold, written pixel count and source hashes are saved in the
recording manifest. Real app responses and rendering are awaited; duration varies.

To reproduce the cutouts, use Python 3.11+ and GDAL as above:

```powershell
python scripts/prepare-time-series.py "H:\.shortcut-targets-by-id\17UZtfjLsDpfIyCg3pymAqIQHT-LSwEvR\Satify_files\04_Data_and_Test_Data\test_data\large_images" --replace
```

[selection.json](assets/time-series/selection.json) owns the dates, source folder
names, band order and pixel window. `prepare-time-series.py` calls the shared scene
builder with that window and adds date provenance to each manifest. It leaves the
original files untouched. Dates come from the source folder names and are retained
in the output filenames and scene names for the app's date detection.

## Editing demonstrations

Each file in `scenarios/` exports `framing`, `showcase` (draft title, copy, timing
and story beats), `prepare(page)` (controls set before capture), and the default
recorded sequence. Change `focus` (image fractions), `zoom` (relative to Fit image),
`subjectAt` and `panelAt` (fractions of the cropped frame) independently for each
tool. `width` and `height` set the crop; `cropX`, `cropTop`, and `cropBottom` leave
room for the surrounding editor controls. `viewportWidth` preserves the desktop
layout. `panelAt` can place the draggable card outside the crop. Keep a 10:9 crop
for an edge-to-edge 500 × 450 export.
The shared framing helper uses real wheel zoom and Pan gestures before recording,
and moves the tool card using its drag handle. Image-relative pointer paths use
that camera transform, so moving the focus does not require rewriting the strokes.

Pen starts with the yellow Open ground label and a visible panel in pixel units.
It draws the outer curve with a 4-pixel brush, switches to 2 pixels for the tight
inner bend, and closes the outline. It opens the native right-click label picker
inside the crop, selects blue Water, and visibly increases the size to 8 pixels.
It selects Fill gaps and paints the pond, overlapping the yellow outline. The
native mode changes only unlabelled pixels, so the yellow remains visible.
All three strokes require a successful native tile save. The paths are traced in
native pixels against the pond's dark shoreline, with an explicit subpixel camera
alignment in the scenario. Recheck that alignment after changing the framing or
browser. Review the saved label tile as well as the video: yellow must stay outside
the water, blue must stay inside the closed yellow outline, and every enclosed
non-yellow pixel must be blue. The footprint test checks the entire enclosed area,
including shore pixels outside the traced dark water.
Smart Fill selects Forest before capture and starts with Mask 5 and Local scope.
Native Shift + scroll advances to Masks 6 and 7 with the pointer stationary over
the forest, making the different previews easy to compare. Each of the Local, In viewport
and Global fills verifies its response and request coordinates/scope. These are
model-suggested regions, not ground-truth forest boundaries. Review the broader
selection when masks or source imagery change. Final holds rest on noninteractive
parts of the visible cards, clearing map previews without triggering tooltips. Pointer
moves outside the crop are rejected, and the browser smoke test checks every
interpolated position for both resting styles.
Rendering and all pending server writes must finish before the final poster and
export are accepted. No extra recording length is added just to meet a target.

`scripts/presentation.mjs` controls movement timing, cursor and captions.
`scripts/framing.mjs` positions the image and card for each scenario.
`scripts/record.mjs` controls readiness, capture, export and playback preview.
The temporary full-window capture is removed after the cropped exports succeed;
both final videos and the poster exclude the application header.
Tool names use the UI's accessible names. The canvas selector and server routes
are kept in these helpers so UI/API changes have a small update surface.

The scripts perform real input; they do not simulate the resulting labels.
Setup uses the existing router API to avoid recording repetitive upload steps.
Review generated clips when tool behaviour or mask algorithms change, even if
the script still runs successfully. Website playback can be added separately.

## Checks

```powershell
npm test
python -m unittest discover -s tests -p "test_*.py" -v
npm run test:recording
npm run test:runtime
```

`npm test` first fetches/verifies the four scene assets; subsequent runs work from
the local cache. To run just the downloader tests without network or imagery, use
`node --test tests/fetch-assets.test.mjs`.

The Python checks require `gdal_create` as well as the other GDAL tools.
The runtime browser check uses a temporary local server to verify saved cookies
and refreshed authorization still work after the setup page closes.

## Updating the shared dataset

`assets/release.json` pins a repository, release tag, scene manifest paths, and
the filename, local cache path, size and SHA-256 of all eight dataset files.
All four TIFFs and their four full scene JSON files are release attachments and
ignored local cache files. The release also contains `SHA256SUMS.txt`.
The dataset release is versioned independently of the website and is not marked
as the latest software release.

To change a scene, rebuild it with the appropriate preparation script and review
the new data. Publish the resulting TIFFs, individual scene JSON files and checksums
under a **new dataset tag** (for example `demo-data-v3`); never replace attachments
under a tag already in use. Update `assets/release.json` with the exact byte sizes
and SHA-256 hashes of both the TIFFs and JSON files, including their formatting.
Commit that lock and any changed selection definitions or project configuration
with the code; leave the full scene JSON and TIFFs in the ignored cache.
Verify a fresh download before
sharing that change. An old checkout continues to use its old tag and checksums.

Release publication requires repository write access; consumption requires only
read access for private repositories. Website visitors receive neither the scene
data nor recording tools. Moving the cache out of Git does not rewrite history:
the original demo TIFF and its scene JSON remain in earlier commits.
