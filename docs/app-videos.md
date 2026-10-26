# App showcase recordings

The app page implements [issue #216](https://github.com/sSatify/issue-tracker/issues/216)
with three real recordings for [issue #217](https://github.com/sSatify/issue-tracker/issues/217).
The recordings were made on 26 October 2026 against `app-dev.satify.tech`.

## Published assets (local, not deployed)

| Highlight | Video | Dimensions | Duration | Approximate size |
| --- | --- | --- | --- | --- |
| Smart Fill | `assets/videos/smart-fill.mp4` | 600 × 540 (10:9) | 24.5 s | 2.3 MB |
| Time series & change detection | `assets/videos/change-detection.mp4` | 1440 × 900 (16:10) | 21.3 s | 7.9 MB |
| Pen & Fill gaps | `assets/videos/pen.mp4` | 600 × 540 (10:9) | 29.4 s | 0.73 MB |

Each MP4 is silent H.264, with a local WebP poster. Native controls, inline playback,
`preload="none"`, written workflow descriptions, and a full-size link are provided.
There is no autoplay, third-party embed, tracking, or additional browser storage.
The two close-up videos retain the native recording resolution instead of the smaller
500 × 450 export. The comparison gets the full content width, capped at 1120 CSS pixels.
The videos keep their intrinsic proportions on narrow screens and support fullscreen.

The existing branch defines Pen rather than Rivers & Roads, so this pass uses Pen as
the third highlight. The comparison clip demonstrates NDVI range selection and applying
labels; it does not demonstrate Sync labelling. The page copy describes the recorded
workflow. Basemap attribution is retained in the comparison and provided below the demos.

## Recording source and reproduction

The tools in [videos/](../videos/README.md) came from the website repository's
`tool_videos_mp` branch at `22509dc8f47dd89acfe8caeeb20990b6ae94327b`.
The showcase and recording work is saved on `codex/app-showcase-videos` for further iteration.
The tooling was imported without merging the original video branch.
The recorder retains its safeguards for project ownership, reserved drawing-layer resets,
verified source imagery, and time-series cleanup. The comparison applies labels, verifies
the response, then undoes its own operation and checks that the drawing layer is empty.

This pass adapts the old label control names to the current class names, widens the
comparison crop, and scrolls Apply into view before checking the recorded bounds.
The final comparison selected an NDVI decrease boundary of approximately −0.2 and
labelled 12,172 pixels. This is a demo selection, not validated ground-truth land cover.

From `videos/`, with Node, Playwright's browser, FFmpeg and FFprobe installed:

```powershell
node scripts/cli.mjs login --env dev
node scripts/cli.mjs record smart-fill --env dev --project 'SATIFY website showcase 2026-10-26 tools'
node scripts/cli.mjs record change-detection --env dev --project 'SATIFY website showcase 2026-10-26 time series'
node scripts/cli.mjs record pen --env dev --project 'SATIFY website showcase 2026-10-26 tools'
```

The project names above are managed by this checkout's ignored `.state/` directory.
Keep that state to reuse the projects. A different checkout must choose fresh project
names if it has no saved ownership records. Never copy login credentials into tracked files.

Source runs (under ignored `videos/output/`):

- `2026-10-26T14-33-53-284Z-smart-fill`: selected `smart-fill-unscaled.mp4`.
- `2026-10-26T14-39-42-433Z-change-detection`: selected `change-detection.mp4`.
- `2026-10-26T14-41-28-059Z-pen`: selected `pen-unscaled.mp4`.

WebP posters were encoded from each run's `poster.png`. Recordings and manifests in
`output/` are diagnostic/reproduction material; only the selected videos and posters in
`assets/videos/` enter the website build. Dataset details and checksums are in
`videos/assets/release.json` and the recording manifests.

## Verification

All 34 Node tests, the browser/export/responsive smoke test, and the saved-login browser
check passed. The three scenarios completed against the real dev app. Sampled frames and
final posters were reviewed; Pen preserves its yellow boundary with a solid blue interior.
The site check covers MP4 and poster paths, and the static build includes the app and media
while excluding the recording tools, scene datasets, browser state, and raw captures.

For future replacements, keep the HTML dimensions consistent with the actual video,
update the poster and copy, and rerun the website checks plus desktop/mobile playback.
