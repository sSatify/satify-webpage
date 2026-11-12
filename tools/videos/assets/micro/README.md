# Short showcase pilots

This is a review concept, separate from the website's selected recordings.
Smart Fill shows Global only; all landscape pilots are silent, with no audio track.

`satellite-poses-v1.png` is a transparent two-pose adaptation of SATIFY's existing
satellite. The built-in image generation tool produced it; the reference and full
prompt are preserved in the adjacent JSON. Left: curious. Right: delighted.
The current Roads pilot uses a fresh local recording; earlier versions use
`web/assets/videos/rivers-roads.mp4`. Smart Fill uses the verified existing
`web/assets/videos/smart-fill.mp4` capture.

With Python, Pillow, numpy and FFmpeg available, run from the repository root:

```powershell
python tools/videos/scripts/edit-roads-micro.py --ffmpeg <path-to-ffmpeg> --recording tools/videos/output/<local-capture>/recording.json
```

The script currently uses Windows Segoe UI fonts. It exports the 1280 × 720,
30 fps, five-second silent H.264 MP4, poster, contact sheet, edit manifest and preview HTML under ignored
`tools/videos/output/roads-micro-pilot-v5/`. Serve that directory to review.
The renderer does not replace selected website assets or publish anything.

Version 2 uses a single image across the frame, rotated 90 degrees so the road
runs horizontally. Only “Follow the road” and the tool name remain as captions.
Saty stays at a fixed position and size, crossfading to happy at the saved result.
Version 3 ends at five seconds, removing the redundant two-second hold. The
closing sound and Saty's reaction finish within the new ending. Previous versions
remain in their earlier ignored output directories.

Version 4 enlarges the logo and Saty to match the owner's annotated rectangles.
The caption is “Trace it roughly. SATIFY fits the road.” Duration remains five
seconds, and Saty stays fixed throughout.

Version 5 uses a new local-app recording with fitting revision 2, a 159.8 m
wide loose guide, curvature 0.25 and zero buffer. The caption is “Mark it roughly.
SATIFY finds the road.” The renderer requires the capture manifest and checks
its local origin, fitting revision, disabled Tool videos, dark theme and recorded
Preview/Apply count agreement. It reads the original WebM and crops it directly.
The five-second edit follows the measured capture timings rather than old cuts.
The owner subsequently requested removing all Roads sound effects. The current
MP4 has no audio track, and the preview has a single Replay button.

Open `tools/videos/previews/roads-micro.html` directly to review Roads. Its base
URL resolves the actual output directory. The generated output `index.html`
instead uses its own directory, so both file and HTTP previews work.

Reviewed source: `output/2026-11-11T15-42-08-514Z-local-road-micro/recording.json`
(relative to `tools/videos/`). It was captured at `http://127.0.0.1:3030`, visible
version `v3.0.1-local`, dark mode, Tool videos off. The actual revision-2 Preview,
Apply receipt and saved tile counts agreed at 280 road pixels. The recorder undid
its own Apply and verified the managed layer was empty afterward. This is a
review pilot; the website's selected video and production remain unchanged.

Before selecting a revised export, decode its full 150 frames, inspect frame
sequences around output frames 18, 93, 120, 132 and 138, plus any detected image
changes, and verify silent playback in the built website preview.

## Smart Fill · Global only

Run `scripts/edit-smart-fill-micro.py --ffmpeg <path-to-ffmpeg>` from
`tools/videos/` (or use its full path from the repository root). It exports to
`output/smart-fill-micro-pilot-v1/`. Open `previews/smart-fill-micro.html` directly
or the generated output `index.html` to review it.

The five-second landscape edit uses only source seconds 13.25–14.1 of the existing
Global action. Source SHA-256 is checked against `web/assets/videos/recordings.json`,
which records 78,332 saved Global pixels in the original v3.0.1-local capture.
The crop removes controls and old captions. It retains the recorded source/label
pixels and emphasises the recorded click location with a short graphic pulse.
It does not reproduce the Local/Viewport comparisons or their camera movements.

Caption: “Click once. Label matching forest patches.” The same large logo and
fixed Saty are reused. All pilots have no audio track, as requested by the owner.
Every export is decoded in full, with short frame sequences saved around cuts
and detected image changes. Review file and built-page playback before selecting.

## Time series · Sync labelling

Run `scripts/edit-time-series-micro.py --ffmpeg <path-to-ffmpeg>` from
`tools/videos/`. Open `previews/time-series-micro.html` directly or the generated
`output/time-series-micro-pilot-v2/index.html` to review the five-second edit.

This uses the Water and Seagrass fills in the verified existing
`web/assets/videos/time-series.mp4` capture. The caption is “Label once. Sync
across dates.” The three dated coastal crops fill the frame; controls and the old
captions are outside them. Each output beat crops all three dates from the same
source frame. Jump cuts remove pending states so dates two and three update in
the same output frame. The masks are actual recorded results; playback timing is
edited. The original version remains in the ignored `time-series-micro-pilot-v1/`.

Version 2 reduces the opening pause to 0.6 seconds. Water appears on the first
date at 0.6 seconds and both target dates at 0.9 seconds. Seagrass follows at
2.0 / 2.4 seconds; the completed darker interior appears at 3.3 seconds. Source
snapshots are 6.25, 6.4, 7.1, 17.2, 18.0 and 20.8 seconds, omitting temporary
hover previews and the polygon-drawing workflow. The saved polygon and its
outside-area shading remain visible during the Seagrass beat. Short graphic
pulses emphasise the recorded Water and first Seagrass seed locations. Source
SHA-256 and saved counts for both classes on all dates are verified against
`web/assets/videos/recordings.json`.

Date labels remain visible: 2021-09-01, 2022-08-15 and 2022-09-04. Saty and the
logo keep their established sizes and positions. The MP4 has no audio stream.

## Propagate labels · Experimental

Run `scripts/edit-propagate-micro.py --ffmpeg <path-to-ffmpeg>` from
`tools/videos/`. Open `previews/propagate-micro.html` directly or
`output/propagate-micro-pilot-v2/index.html` to review the five-second pilot.

Caption: “Teach a little. Label a lot.” The crop shows recorded Forest, Water
and Built-up example strokes, then the saved Propagate labels result at 3.8
seconds. The first 0.5 seconds give a clean view. Version 2 gives each stroke
31 frames instead of 21 (about 48% more viewing time) and shortens the final
result hold from 2.2 to 1.2 seconds. Total duration remains five seconds. The
original version remains in the ignored `propagate-micro-pilot-v1/`. Drawing is
accelerated; class selection, workspace setup, model waiting and confidence
adjustment are omitted. No label pixels or prediction animation are generated.
One of the original run's two Forest strokes is outside this close crop.

The selected original `web/assets/videos/propagate.mp4` is SHA-256 checked against
`web/assets/videos/recordings.json`: production v3.0.0, dark theme, recorded
2026-11-09. This pilot edits that capture; it is not a local-app rerecord.
Source windows are 0.3, 4.7–6.2, 10.2–11.6, 14.9–16.5 and 23.5 seconds. The
last frame is the applied result after the original capture's successful save.
The Propagate workspace shifts the source image by (-177, +24) pixels. Separate
720 × 405 crops compensate for that translation and exclude the old captions and
controls, keeping the map aligned through the result cut.

The large logo and fixed Saty match the other pilots. Saty crossfades to happy
at the result. “Propagate labels · Experimental” remains visible throughout;
the MP4 has no audio track. Decode all 150 frames, inspect short sequences at
the edits and detected image changes, and check file and built-page playback
before selecting an export. The website's selected assets are unchanged.

## Change detection · Local rerecording

`scripts/record-change-micro.mjs` owns a separate two-date local project. Both
preparation and capture require `--url http://127.0.0.1:3030 --expect-version
3.0.1-local`. Add `--prepare` to prepare only, or `--inspect` to inspect framing
without applying labels. Use the existing local browser login, with Tool videos
off and dark mode verified. The script does not rebuild or change the app.

Selected source: `output/2026-11-12T08-48-02-732Z-local-change-micro/recording.json`.
It compares 2022-08-15 with 2022-09-04 in local v3.0.1-local. The real Change
Detection tool selects NDVI below approximately -0.2, in Viewport scope, and saves
7,560 pixels as the deliberately descriptive class “NDVI decrease”. The saved
tile count matches Apply; the reference date stays empty. The recorder undid its
operation and verified both dates were empty afterward. A drop in NDVI does not
establish harvesting, deforestation or another cause.

Run `scripts/edit-change-micro.py --ffmpeg <path-to-ffmpeg> --recording
output/2026-11-12T08-48-02-732Z-local-change-micro/recording.json` from
`tools/videos/`. Outputs are in `output/change-micro-pilot-v3/`; the direct preview
is `previews/change-micro.html`. Caption: “What changed?” Reference and current
imagery are aligned crops from the same clean capture frame. The original
five-second blink edit remains in `output/change-micro-pilot-v1/`, using the
earlier `2026-11-12T08-34-18-390Z-local-change-micro` capture. No masks are
generated or animated, and the existing selected website recording is unchanged.

Version 2 uses the new source
`output/2026-11-12T08-48-02-732Z-local-change-micro/recording.json` and extends the
edit to eight seconds. Add `--histogram` to the explicit local capture command to
record the real boundary drag from zero to -0.20. This take again saved exactly
7,560 pixels; Apply/saved tiles agree, and cleanup is recorded as `[0, 0]`.

Version 2 outputs remain in `output/change-micro-pilot-v2/`.
The first two date views last 0.9 seconds each. The actual NDVI difference fills
the frame from 1.8 to 3.4 seconds; its original ramp key is repositioned intact
above the footer. The actual histogram drag follows from 3.4 to 6.5 seconds,
reframed as the only main subject. The selected tail visibly narrows to the
recorded cutoff; a brief graphic ring emphasises that final handle position.
The saved yellow labels appear at 6.5 seconds and remain for 1.5 seconds.
Histogram and NDVI map get separate moments so viewers can follow each. Saty and
the logo remain fixed, and there is no audio. No histogram or mask is simulated.
Verification decodes all 240 frames and reviews short sequences at cuts and
detected changes, followed by file and built-page playback checks. Version 1
remains available in its ignored output directory.

Version 3 uses the same verified capture and keeps the eight-second duration.
After the histogram, the actual difference-panel preview returns with the
selected pixels in blue over the dimmed NDVI ramp. The same “NDVI < −0.20”
condition carries from the histogram to this map. The stages are: dates at
0 / 0.9 seconds, NDVI difference at 1.8, histogram at 3.0, selected NDVI map at
5.5, and saved yellow labels at 6.8 seconds. The selected map holds for 1.3
seconds and the saved labels for 1.2 seconds. This is the recorded pre-Apply
selection, not a reconstructed overlay. The direct preview now points to
`output/change-micro-pilot-v3/`. Logo, Saty, sound and resolution stay unchanged.

## Select Similar — positive and negative examples

The local Select Similar pilot uses its own managed city-scene project and the
experimental tool. Record against the explicitly selected local build:

```powershell
node scripts/record-similar-micro.mjs --inspect --url http://127.0.0.1:3030 --expect-version 3.0.1-local
node scripts/record-similar-micro.mjs --url http://127.0.0.1:3030 --expect-version 3.0.1-local
```

The saved origin-specific login is reused. The recorder verifies dark mode,
Tool videos off, project identity and an initially empty reserved drawing layer.
It paints Forest and Water examples, selects Forest as the target, ticks Water
under “Not like these”, and runs Linear (fast) with Pixels and Whole image.
The first take is `output/2026-11-12T11-45-47-654Z-local-similar-micro/`.
It saved 265 Forest and 87 Water example pixels, then 42,305 additional Forest
pixels. Downloaded native tiles agree with the Apply receipt: 42,570 Forest
pixels and the unchanged 87 Water pixels. Cleanup was verified at zero labels.

Render from the repository root using an environment with Pillow and NumPy:

```powershell
python tools/videos/scripts/edit-similar-micro.py tools/videos/output/2026-11-12T11-45-47-654Z-local-similar-micro/recording.json --ffmpeg <ffmpeg-path>
```

The five-second, silent 1280 × 720 edit is in `output/similar-micro-pilot-v1/`.
It shows Forest drawing from 0.3 s, Water drawing from 1.8 s, and the saved
matching labels from 3.3 s. One fixed crop keeps the geography stable; setup,
learning and save waits are omitted. “Find these.” / “Ignore those.” / “Label
the matches.” accompany the real strokes and saved raster. Class tags are edit
annotations. Saty and the logo remain visible. No label output is generated.
All 150 frames were decoded; nine-frame sequences around every edit cut were
reviewed. The selected copy in the `/app2/` gallery was played to completion and
checked in the enlarged viewer and responsive layouts from 320 to 1440 px.

Version 2 replaces the visually dissimilar Forest/Water pair with Built-up and
Open ground examples. Its selected local take is
`output/2026-11-12T12-16-24-240Z-local-similar-micro/recording.json`.
Use `--pair built-ground` on the same explicit local capture command. It uses
two real roof strokes (191 pixels together) and an 80-pixel bare-ground stroke;
the second roof lies below the final crop. The baseline and exclusion pass use
the same UI-set similarity threshold, 0.80. Apply wrote 6,283 additional Built-up
pixels, verified in downloaded native tiles: 6,474 Built-up and the unchanged
80 Open ground pixels. The isolated drawing layer was reset and verified empty.

Pass that capture manifest to the same editor command to produce
`output/similar-micro-pilot-v2/satify-similar-5s-v2.mp4`. A tighter fixed crop
keeps the visible roof and similar-looking bare-ground example in one view.
The duration, captions, continuous Saty/logo presence and silent soundtrack stay
the same. The raw recordings and version 1 remain available locally. Version 2
was initially selected in the app2 gallery; its full 150-frame decode, edit-cut sequences,
silent stream metadata and built-page playback were verified.

### Industrial roof trial — not selected for a new video

The owner-approved industrial candidate is prepared as `assets/industrial-scene.tif`
with `assets/industrial-scene.json`. Its twelve decoded bands, grid, types and source
hashes were verified using `prepare-road-scene.py --display-name "Industrial roofs
and bare ground"`; source files were left unchanged.

The `industrial-roofs` pair uses a separate managed local project. Run a still
trial before recording:

```powershell
node scripts/record-similar-micro.mjs --pair industrial-roofs --trial --model logistic --threshold 0.35 --url http://127.0.0.1:3030 --expect-version 3.0.1-local
```

The checked examples are one light roof, one grey roof and one dark roof (393
pixels together), plus a 208-pixel bare-ground stroke. Native example tiles are
saved before learning. The corrected-example runs include
`output/2026-11-12T12-39-56-308Z-local-similar-micro/` (boosting, 0.10) and
`output/2026-11-12T12-41-44-053Z-local-similar-micro/` (linear, 0.35).
Both learners were reviewed over thresholds 0.01, 0.05, 0.10, 0.20, 0.35, 0.50,
0.65 and 0.80. Boosting missed many roof interiors; broader cuts also selected
paving. Linear improved light-roof coverage but missed grey roofs and selected
substantial roads and paved areas. The roof-quality condition was not met, so no
new video was created. The owner then dropped Select Similar from the gallery,
leaving the original five short videos. Review artifacts are
`output/industrial-roof-assessment.json` and `output/industrial-roof-assessment.jpg`.
Apply receipts and downloaded tiles agreed, and each test project layer was
reset and verified empty after the trial.
