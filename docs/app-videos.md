# App showcase recordings

Five recordings for [#216](https://github.com/sSatify/issue-tracker/issues/216)
and [#217](https://github.com/sSatify/issue-tracker/issues/217). Three were recorded
on 9 November 2026 against the production app at **https://app.satify.tech**,
version **v3.0.0**. Smart Fill and Sync labelling were rerecorded on 10 November
against the updated local app at **http://127.0.0.1:3030**, version
**v3.0.1-local**. All use dark mode.
The selected assets are used on the website's unlisted `/app/` page.
Further website work can continue on `develop`; the deployment workflow publishes `main`.

The separate, unlisted `/app2/` page is a technical tool gallery using the
approved short edits. It has its own stylesheet and player interactions; `/app/`
and the original recordings remain unchanged. The five MP4s and their posters
are copied into `web/assets/videos/gallery/`, with hashes, edit versions, source
app versions and durations in `clips.json`. `npm run check` verifies these assets
and the new page as well as the original showcase.

The gallery selects Smart Fill v1 (Global only), Roads v5, Sync labelling v2,
Change Detection v3 and Propagate v2. Four clips are five seconds; Change
Detection is eight seconds and returns to the selected NDVI mask after its
histogram adjustment. All are 1280 × 720, 30 fps and silent. Their edit recipes
and capture provenance are documented in `tools/videos/assets/micro/README.md`.
The gallery uses short descriptions without scope badges, technical data tables,
detail disclosures, category filters, duration labels or the introductory metadata row. It offers
an enlarged player and mutually exclusive playback. Native players remain available without
JavaScript. Playback, keyboard focus, themes, direct-file access, and video
proportions from 320 to 1440 px were checked against the built page.
The page now ends after the gallery: Workflow notes, the invitation panel and
the recording note are removed, along with the Technical notes navigation link.
Its heading is “SATIFY tools in action”; the road card's category is “Road & river tracing”.
Select Similar was dropped from the showcase after the industrial roof trial
failed its selection-quality check. Its local trial captures and review artifacts remain in `tools/videos/output/`.

The recorder forces dark mode and switches Tool videos off before app startup,
including when its saved browser state has different preferences. Each new
showcase capture verifies the preferences and records them in its manifest.
The selected MP4s are listed with their origin, version, theme and SHA-256 in
`web/assets/videos/recordings.json`. The website check verifies their hashes,
origins and dark mode, plus the disabled Tool videos preference for the local captures.
Development trial captures remain ignored and are not selected for the website.

## Selected videos

| Feature | Asset in web/assets/videos/ | Dimensions | Duration | Size |
| --- | --- | --- | --- | --- |
| Smart Fill | smart-fill.mp4 | 1280 × 960 (4:3) | 19.0 s | 8.7 MB |
| Rivers & Roads Pen | rivers-roads.mp4 | 1280 × 960 (4:3) | 15.1 s | 2.0 MB |
| Time Series Sync labelling | time-series.mp4 | 1600 × 900 (16:9) | 23.9 s | 3.5 MB |
| Change detection | change-detection.mp4 | 1600 × 900 (16:9) | 17.5 s | 6.6 MB |
| Propagate Labels (experimental) | propagate.mp4 | 1600 × 900 (16:9) | 26.6 s | 3.6 MB |

Each silent H.264 MP4 has a WebP poster. A one-second still of the result opens
most clips, followed by app interaction with a visible pointer and short
captions. Captions use bold 40 px text, a high-contrast panel and a 14% bottom inset,
bringing them toward the centre and above the playback controls. Smart Fill uses
mode titles with a smaller explanatory line. No predicted labels or processing results are simulated.
Source datasets are prepared before capture. Smart Fill starts chronologically with Local,
without a result-preview intro. Propagate also has no result preview: it starts with a
clean image and shows every Forest, Water and Built-up example being drawn before
prediction. Its website poster also uses the clean before frame.
The new Smart Fill clip is under 25 seconds. Tool videos were disabled before
capture. Its pointer moves between actual controls and fill points without
returning to a resting position after each action. Cropped screenshots during
the screencast caused the earlier four-frame resize; the script no longer takes
them. The selected recording is the raw export, with no frame removal. A
frame-by-frame review of abrupt changes found only the intended zoom animations.
The new Sync labelling clip leaves the pointer at the action location between
steps. It labels Water with Adaptive Groups · k=3, draws one polygon spanning the
two marked shoreline stretches, and fills Seagrass with two Smart Fill clicks:
one for the shoreline and one for the darker interior. Both use Smooth Regions · k=10,
Viewport scope and Replace existing off.
The tool panel is placed left of the shoreline before capture so the full area
remains visible. The 23.9-second raw export needs no frame removal. Both classes
were verified on all three dates; the recorder undid its labels and removed its saved area.
An unselected 10 November rerecord is in
`tools/videos/output/2026-11-10T15-56-04-381Z-v2-time-series/`. Moving the
Seagrass click from (395, 580) to (390, 525) made the source date's hover preview
follow the dark tidal bands, but the two target dates still saved broad regions.
The hover previews showed narrower bands before the click, so that take was not
selected. The recorder cleaned its labels and area.
The selected Rivers & Roads clip starts clean, follows the owner-supplied forest
road through both bends, and accelerates only the tracing to 6.4 seconds. A later
review removed a brief six-frame resize and its distorted recovery frames near
13 seconds, the redundant ending after 15.1 seconds, and the final bottom caption.
Its poster shows the saved road without that caption.

The close-ups use larger players beside their descriptions. The three wide
workflows use the full content width, capped at 1120 CSS pixels. All players have
native controls, inline playback, preload="none", accessible descriptions and a
full-size link. There is no autoplay. The homepage retains the app section and menu link from `main`.
The dedicated `/app/` page is unlisted for colleague testing: no public-page navigation links to it,
and its `noindex` metadata opts out of search indexing. Propagate is marked experimental.
Fullscreen helps inspect comparison controls on phones.

## Provenance and interpretation

All five selected workflows were exercised in SATIFY. Smart Fill and Sync
labelling used the local **v3.0.1-local** app; the other three used production
**v3.0.0**.
The recorder prints the chosen origin before opening a managed project and saves
the observed app version, origin and verified theme in each recording manifest.

- Smart Fill compares Local, Viewport and Global using the same forest point, class
  and source mask from clean starts. Undo is verified before each new mode.
  The first view is zoomed in; after Viewport and Global, real zoom-out gestures reveal
  the image beyond a dashed outline of the previous viewport. Viewport leaves the
  outside unlabelled; Global includes matching regions there. Saved counts were
  9,994 (Local), 26,070 (Viewport) and 78,332 (Global). The recorder rejects a capture
  unless each mode demonstrably expands the saved extent. Generated regions require human review.
- Rivers & Roads Pen uses the supplied forest scene
  `dw_-64.3106956299_49.8925498786-20190820`. The guide follows the road's centre
  through both S-bends to the owner's red mark. Settings: 79.9 m brush, Draw,
  Trace, curvature 0.85, Fit width on, +1 px buffer, Replace existing off.
  A discarded guide measures the camera transform before capture; opening a fresh
  editor page afterward avoids production v3.0.0 briefly flashing that old guide.
  The recorded guide's maximum deviation from the reviewed path was 0.41 native
  pixels. Apply saved 581 road pixels (58,165 m²), verified from the stored tile.
  The intermediate export speeds only source seconds 2.0–17.5 by 2.4, giving a
  measured 6.4-second trace. The selected export then removes the brief resize,
  trims the ending, and clears the final caption without changing the road label.
- Sync labelling first uses Adaptive Groups · k=3 with Local scope to label Water.
  The click is in the middle of the channel (normalized first-pane position
  0.65, 0.61). Three user-marked water points were tested; all selected the same
  region, which covers the channel on the third date without filling the lower
  area selected by the earlier seed (0.52, 0.80). The workflow
  then draws a polygon around both eastern intertidal stretches and uses Smooth Regions · k=10
  with Viewport scope and Replace existing off to label the shoreline. A second
  click fills the dark interior on the source date; both target dates already
  had the matching mask region from the first click.
  Saved Water counts were 292,073, 344,753 and 222,492 pixels; Seagrass counts
  were 78,588, 69,923 and 73,809. Both target dates reported changed tiles for
  the first Seagrass fill; the second reported no additional target tiles.
  Cleanup undid the fills in reverse order, checked the saved counts after
  each Undo, removed the saved area, and verified all three dates were empty.
  Earlier Smart Fill trials with different settings showed only a preview; the
  selected settings saved labels on all dates.
- Change detection selects an NDVI decrease range near −0.2 and applies 13,584 pixels
  using the existing Open ground class. An index difference is not validated ground
  truth; the page asks viewers to interpret it with the imagery.
- Propagate shows all Forest, Water and Built-up examples being drawn, learns from
  them, previews predictions, and applies 247,576 new pixels after adjusting confidence to about 82%. Confidence
  and the displayed hold-out score are model diagnostics, not overall accuracy.

## Reproduction

See [the recorder guide](../tools/videos/README.md) for dependencies, login and project setup.
The recorder defaults to the production app and uses managed projects
`SATIFY website showcase 2026-11-09 tools` and
`SATIFY website showcase 2026-11-09 time series`. It requires their saved ownership
records under ignored `tools/videos/.state/`; it will not adopt arbitrary projects.
For a fresh checkout, prepare new managed projects through the setup CLI with these
names, or pass a matching `--project` name to the showcase command. Authentication and
project ownership are isolated per origin. Development requires explicit `--env dev`.

From tools/videos/, with Node 22+, Playwright's browser and FFmpeg installed:

```powershell
npm run showcase -- change-detection
npm run showcase -- propagate
```

To reproduce the selected Smart Fill clip, run the local app on port 3030 and
use the same origin and project name for interactive login, project setup and capture:

```powershell
npm run login -- --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 tools"
npm run setup -- --dataset tools --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 tools"
npm run showcase -- smart-fill --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 tools"
```

On Windows the interactive login opens Edge, allowing normal password paste.
The recorder stores its own session locally and the user signs in directly.
The selected 570-frame export needs no postprocessing. The recorder retains its
raw capture and recording manifest in the ignored output directory.

For the selected Sync labelling clip, the same local sign-in applies. Prepare its
separate three-date project, then record:

```powershell
npm run setup -- --dataset time-series --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 sync preview"
npm run showcase -- time-series --url http://127.0.0.1:3030 --project "SATIFY website showcase 2026-11-10 sync preview"
```

Run these sequentially. The recorder locks each managed project, resets only the
reserved tools drawing layer, and preserves mask display settings and other layers.
Time-series operations require empty demonstration layers, undo their own applied
labels, and verify all three dates are empty afterward. Authentication and raw
captures stay ignored. FFmpeg can be on PATH, installed locally as ffmpeg-static,
or selected with FFMPEG_PATH.

Selected source directories under ignored tools/videos/output/:

- 2026-11-10T11-41-16-511Z-v2-smart-fill
- 2026-11-09T15-37-42-339Z-forest-road-trial
- 2026-11-10T17-02-05-456Z-v2-time-series
- 2026-11-09T14-47-16-040Z-v2-change-detection
- 2026-11-09T14-47-51-805Z-v2-propagate

Each contains its MP4, final poster.png, before frame, capture and recording
manifest. WebP posters use FFmpeg scale=960:-2, quality 86. Propagate's website
poster uses before.png to avoid showing labels that disappear when playback starts.
The road capture was first exported as `forest-road-trial-faster.mp4`; `trial.json` records
the real operation and `review-faster.json` records its export timing. It uses the
separate managed production project `SATIFY forest road trial 2019-08-20 2026-11-09`.
The retained road capture can be exported from `tools/videos/` with:

```powershell
$roadRun = 'output/2026-11-09T15-37-42-339Z-forest-road-trial'
& node_modules/ffmpeg-static/ffmpeg.exe -hide_banner -loglevel error -y -i "$roadRun/forest-road-trial.mp4" -filter_complex '[0:v]trim=end=2.0,setpts=PTS-STARTPTS[head];[0:v]trim=start=2.0:end=17.5,setpts=(PTS-STARTPTS)/2.4[trace];[0:v]trim=start=17.5,setpts=PTS-STARTPTS[tail];[head][trace][tail]concat=n=3:v=1:a=0,fps=30,format=yuv420p[out]' -map '[out]' -an -c:v libx264 -crf 19 -pix_fmt yuv420p -movflags +faststart "$roadRun/forest-road-trial-faster.mp4"
```

Recheck the tracing interval after a new take; these boundaries apply only to the
selected source recording.
The selected 15.1-second cut was made from that intermediate export on 10 November 2026.
Its input is preserved locally as ignored `output/road-review-2026-11-10/rivers-roads-before-review.mp4`
and is also the `assets/videos/rivers-roads.mp4` blob in commit `8a97e76`.
At 30 fps, source frames 391–402 contain the resize and distorted recovery;
frames from 465 onward are the redundant ending. The final caption begins at
source frame 424. The unobstructed bottom of source frame 0 supplies the matching
map background under that caption after the cut. `web/assets/videos/recordings.json`
pins the source and selected MP4 hashes and the exact frame boundaries.
The website poster comes from the selected clip at 15.0 seconds.
To reproduce the final cut from `tools/videos/`, place the previous selected MP4
at the ignored review path above, then run:

```powershell
$review = 'output/road-review-2026-11-10'
ffmpeg -hide_banner -loglevel error -y -i "$review/rivers-roads-before-review.mp4" -vf "select='eq(n,0)',crop=648:138:316:691" -frames:v 1 "$review/clean-caption-area.png"
ffmpeg -hide_banner -loglevel error -y -i "$review/rivers-roads-before-review.mp4" -loop 1 -i "$review/clean-caption-area.png" -filter_complex "[0:v]trim=end_frame=391,setpts=PTS-STARTPTS[a];[0:v]trim=start_frame=403:end_frame=465,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,format=yuv420p[cut];[cut][1:v]overlay=x=316:y=691:enable='gte(n,412)':shortest=1,format=yuv420p[out]" -map '[out]' -an -c:v libx264 -crf 19 -preset medium -pix_fmt yuv420p -movflags +faststart "$review/rivers-roads-short-clean.mp4"
ffmpeg -hide_banner -loglevel error -y -ss 15.0 -i "$review/rivers-roads-short-clean.mp4" -frames:v 1 -vf 'scale=960:-2' -c:v libwebp -quality 86 -compression_level 6 "$review/rivers-roads-short-clean.webp"
```

Only selected MP4s, WebPs and the small recording provenance JSON in web/assets/videos/
enter the website build. Dataset provenance and checksums
remain in tools/videos/assets/release.json and the scene manifests.

The reusable recorder originally came from website branch tool_videos_mp at
22509dc8f47dd89acfe8caeeb20990b6ae94327b. The old three-video scenarios remain for
reference, but their Pen clip and former exports are no longer used by the site.

## Verification

All five scenarios completed; comparison operations verified their saved labels
and successful Undo cleanup. The selected Smart Fill clip was reviewed across its
timeline, including the previous resize location and every high-change interval,
decoded in full with FFmpeg, and played to the end
in the built website with no media error. Its H.264 stream is 1280 × 960 at 30 fps.
All 45 Node tests, the saved-login browser check, site checks and the static build
passed. The site check rejects public-page links to the unlisted showcase and
requires its `noindex` metadata. Builds exclude scene datasets, recording tools
and browser state.

When replacing a clip, update its poster and HTML dimensions together, review the
result at its actual display size, and rerun playback and responsive checks.

The road clip was reviewed across the new cut, including consecutive frames around
the removed resize and the clean saved result. Its new poster matches that result.
The new Smart Fill capture replaces its previous production recording and keeps
the same three verified fill counts. The Sync labelling rerecording saves Water
and Seagrass across all three dates and limits Seagrass to the drawn shoreline
area. Change detection and Propagate retain their earlier selected clips.
