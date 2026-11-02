# App showcase recordings

Five fresh recordings for [#216](https://github.com/sSatify/issue-tracker/issues/216)
and [#217](https://github.com/sSatify/issue-tracker/issues/217), recorded on 2 November
2026 against app-dev.satify.tech. Work continues on `codex/app-showcase-videos`.
These assets are integrated locally; this document does not indicate deployment.

## Selected videos

| Feature | Asset in assets/videos/ | Dimensions | Duration | Size |
| --- | --- | --- | --- | --- |
| Smart Fill | smart-fill.mp4 | 1280 × 960 (4:3) | 17.8 s | 6.1 MB |
| Rivers & Roads Pen | rivers-roads.mp4 | 1280 × 960 (4:3) | 26.6 s | 3.0 MB |
| Time Series Sync labelling | time-series.mp4 | 1600 × 900 (16:9) | 24.6 s | 6.5 MB |
| Change detection | change-detection.mp4 | 1600 × 900 (16:9) | 17.2 s | 6.5 MB |
| Propagate Labels (experimental) | propagate.mp4 | 1600 × 900 (16:9) | 33.4 s | 4.2 MB |

Each silent H.264 MP4 has a WebP poster. A one-second still of the result opens
most clips, followed by real-time app interaction with a visible pointer and short
captions. No predicted labels or processing results are simulated. Source datasets
are prepared before capture. Propagate has no result preview: it starts with a
clean image and shows every Forest, Water and Built-up example being drawn before
prediction. Its website poster also uses the clean before frame.

The close-ups use larger players beside their descriptions. The three wide
workflows use the full content width, capped at 1120 CSS pixels. All players have
native controls, inline playback, preload="none", accessible descriptions and a
full-size link. There is no autoplay. The homepage has three poster links into the
app page. Propagate is marked experimental and available in LAB mode on the
development app. Fullscreen helps inspect comparison controls on phones.

## Provenance and interpretation

Feature selection was checked against develop commit
`11bda0740497e0d37aa57f5ba1dc4459b6129ae1`. The recordings use the deployed development
app **v2.5.15-dev.0065+867515e**, earlier than that source commit. All five selected
workflows were exercised successfully on that deployed build.

- Smart Fill fills forest locally and across the viewport, then adds the pond as
  Water. Generated regions require human review.
- Rivers & Roads Pen follows the arterial roads marked in the user's review: down
  to the junction, then around the broad northeast bend. An 8 px brush with Trace
  and Fit width applies 49,632 m² (495 pixels). The result follows the main roads;
  suggested boundaries still require review.
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
  them, previews predictions, and applies 248,234 new pixels after adjusting confidence to about 82%. Confidence
  and the displayed hold-out score are model diagnostics, not overall accuracy.

## Reproduction

See [the recorder guide](../videos/README.md) for dependencies, login and project setup.
The new recorder targets the development app and existing managed projects
`SATIFY website showcase 2026-10-26 tools` and
`SATIFY website showcase 2026-10-26 time series`. It requires their saved ownership
records under ignored `videos/.state/`; it will not adopt arbitrary projects.
For a fresh checkout, prepare new managed projects through the setup CLI, then
update the project-name mapping in `showcase-v2.mjs`.

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

- 2026-11-02T09-47-27-780Z-v2-smart-fill
- 2026-11-02T10-24-11-791Z-v2-rivers-roads
- 2026-11-02T10-34-21-912Z-v2-time-series
- 2026-11-02T09-55-08-487Z-v2-change-detection
- 2026-11-02T10-35-55-787Z-v2-propagate

Each contains its MP4, final poster.png, before frame, capture and recording
manifest. WebP posters use FFmpeg scale=960:-2, quality 86. Propagate's website
poster uses before.png to avoid showing labels that disappear when playback starts.
Only selected MP4s and
WebPs in assets/videos/ enter the website build. Dataset provenance and checksums
remain in videos/assets/release.json and the scene manifests.

The reusable recorder originally came from website branch tool_videos_mp at
22509dc8f47dd89acfe8caeeb20990b6ae94327b. The old three-video scenarios remain for
reference, but their Pen clip and former exports are no longer used by the site.

## Verification

All five actual-app scenarios completed; comparison operations also verified their
saved labels and successful Undo cleanup. Posters and sampled frames were reviewed.
Media probes verified H.264, silent streams, dimensions and durations. All 37 Node
tests, the browser recording/export smoke test, site checks and the static build
passed. Browser QA played all five selected videos to completion, checked desktop
and mobile layouts at 1440, 768, 390 and 320 pixels, verified homepage links and found
no page errors. Light and dark layouts were reviewed. Builds exclude scene datasets,
recording tools and browser state.

When replacing a clip, update its poster and HTML dimensions together, review the
result at its actual display size, and rerun playback and responsive checks.
