# App showcase recordings

Five fresh recordings for [#216](https://github.com/sSatify/issue-tracker/issues/216)
and [#217](https://github.com/sSatify/issue-tracker/issues/217), recorded on 9 November
2026 against the production app at **https://app.satify.tech**, version **v3.0.0**, in dark mode.
Work continues on `codex/app-showcase-videos`.
These assets are integrated locally; this document does not indicate deployment.

The recorder now forces dark mode before app startup, including when its saved
browser state contains a light theme preference. Each new showcase capture verifies
the app's dark theme and includes `theme: "dark"` in its recording manifest.
The selected production MP4s are listed with their origin, version, theme and SHA-256 in
`assets/videos/recordings.json`. The website check verifies those hashes and requires production dark-mode recordings.
Development trial captures remain ignored and are not selected for the website.

## Selected videos

| Feature | Asset in assets/videos/ | Dimensions | Duration | Size |
| --- | --- | --- | --- | --- |
| Smart Fill | smart-fill.mp4 | 1280 × 960 (4:3) | 33.9 s | 13.9 MB |
| Rivers & Roads Pen | rivers-roads.mp4 | 1280 × 960 (4:3) | 16.5 s | 1.9 MB |
| Time Series Sync labelling | time-series.mp4 | 1600 × 900 (16:9) | 23.8 s | 6.1 MB |
| Change detection | change-detection.mp4 | 1600 × 900 (16:9) | 17.5 s | 6.6 MB |
| Propagate Labels (experimental) | propagate.mp4 | 1600 × 900 (16:9) | 26.6 s | 3.6 MB |

Each silent H.264 MP4 has a WebP poster. A one-second still of the result opens
most clips, followed by real-time app interaction with a visible pointer and short
captions. Captions use bold 40 px text, a high-contrast panel and a 14% bottom inset,
bringing them toward the centre and above the playback controls. Smart Fill uses
mode titles with a smaller explanatory line. No predicted labels or processing results are simulated.
Source datasets are prepared before capture. Smart Fill starts chronologically with Local,
without a result-preview intro. Propagate also has no result preview: it starts with a
clean image and shows every Forest, Water and Built-up example being drawn before
prediction. Its website poster also uses the clean before frame.

The close-ups use larger players beside their descriptions. The three wide
workflows use the full content width, capped at 1120 CSS pixels. All players have
native controls, inline playback, preload="none", accessible descriptions and a
full-size link. There is no autoplay. The homepage retains the app section and menu link from `main`.
The dedicated `/app/` page is unlisted for colleague testing: no public-page navigation links to it,
and its `noindex` metadata opts out of search indexing. Propagate is marked experimental.
Fullscreen helps inspect comparison controls on phones.

## Provenance and interpretation

All five selected workflows were exercised successfully on the production app **v3.0.0**.
The recorder prints the chosen origin before opening a managed project and saves
the observed app version, origin and verified theme in each recording manifest.

- Smart Fill compares Local, Viewport and Global using the same forest point, class
  and source mask from clean starts. Undo is verified before each new mode.
  The first view is zoomed in; after Viewport and Global, real zoom-out gestures reveal
  the image beyond a dashed outline of the previous viewport. Viewport leaves the
  outside unlabelled; Global includes matching regions there. Saved counts were
  9,994 (Local), 26,070 (Viewport) and 78,332 (Global). The recorder rejects a capture
  unless each mode demonstrably expands the saved extent. Generated regions require human review.
- Rivers & Roads Pen follows only the main road marked in the latest review: from
  the southwest, around the bend and east along the straight section, excluding
  the diagonal side road. The framing keeps that full route visible. A 16 px brush (twice the
  earlier width) marks a broad search area with a quick stroke: 100 ms per path
  segment instead of 320 ms. A 2.4-second preview hold and caption distinguish the
  automatically detected road from the guide. Trace and Fit width apply 73,295 m²
  (731 pixels). Suggested boundaries still require review.
- Sync labelling first labels Water, then switches to Agriculture and a finer mask
  to label two field regions across the same three coastal dates. Saved Water counts
  were 159,261, 192,288 and 101,856 pixels; Agriculture counts were 8,729, 6,343 and
  6,920. Both target dates reported success for all three operations. Cleanup undid
  each operation in reverse order, checking the saved counts after each Undo and
  verifying that all three dates were empty at the end.
- Change detection selects an NDVI decrease range near −0.2 and applies 13,584 pixels
  using the existing Open ground class. An index difference is not validated ground
  truth; the page asks viewers to interpret it with the imagery.
- Propagate shows all Forest, Water and Built-up examples being drawn, learns from
  them, previews predictions, and applies 247,576 new pixels after adjusting confidence to about 82%. Confidence
  and the displayed hold-out score are model diagnostics, not overall accuracy.

## Reproduction

See [the recorder guide](../videos/README.md) for dependencies, login and project setup.
The recorder defaults to the production app and uses managed projects
`SATIFY website showcase 2026-11-09 tools` and
`SATIFY website showcase 2026-11-09 time series`. It requires their saved ownership
records under ignored `videos/.state/`; it will not adopt arbitrary projects.
For a fresh checkout, prepare new managed projects through the setup CLI with these
names, or pass a matching `--project` name to the showcase command. Authentication and
project ownership are isolated per origin. Development requires explicit `--env dev`.

From videos/, with Node 22+, Playwright's browser and FFmpeg installed:

```powershell
npm run showcase -- smart-fill
npm run showcase -- rivers-roads
npm run showcase -- time-series
npm run showcase -- change-detection
npm run showcase -- propagate
```

Run these sequentially. The recorder locks each managed project, resets only the
reserved tools drawing layer, and preserves mask display settings and other layers.
Time-series operations require empty demonstration layers, undo their own applied
labels, and verify all three dates are empty afterward. Authentication and raw
captures stay ignored. FFmpeg can be on PATH, installed locally as ffmpeg-static,
or selected with FFMPEG_PATH.

Selected source directories under ignored videos/output/:

- 2026-11-09T14-48-57-084Z-v2-smart-fill
- 2026-11-09T14-46-06-582Z-v2-rivers-roads
- 2026-11-09T14-46-34-859Z-v2-time-series
- 2026-11-09T14-47-16-040Z-v2-change-detection
- 2026-11-09T14-47-51-805Z-v2-propagate

Each contains its MP4, final poster.png, before frame, capture and recording
manifest. WebP posters use FFmpeg scale=960:-2, quality 86. Propagate's website
poster uses before.png to avoid showing labels that disappear when playback starts.
Only selected MP4s, WebPs and the small recording provenance JSON in assets/videos/
enter the website build. Dataset provenance and checksums
remain in videos/assets/release.json and the scene manifests.

The reusable recorder originally came from website branch tool_videos_mp at
22509dc8f47dd89acfe8caeeb20990b6ae94327b. The old three-video scenarios remain for
reference, but their Pen clip and former exports are no longer used by the site.

## Verification

All five production scenarios completed; comparison operations verified their
saved labels and successful Undo cleanup. Posters and sampled frames were reviewed.
Full FFmpeg decoding verified H.264, silent streams, dimensions and durations.
All 45 Node/browser tests, site checks, IDE error inspections and the static build
passed. Browser QA played all five selected production videos to completion without
media errors. The homepage and its built HTML match `origin/main` exactly; checks
reject public-page links to the unlisted showcase and require its `noindex` metadata.
Builds exclude scene datasets, recording tools and browser state.

When replacing a clip, update its poster and HTML dimensions together, review the
result at its actual display size, and rerun playback and responsive checks.
