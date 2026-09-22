# Satify website

A three-page static website for Satify: a cheerful pixel-art homepage and plain, readable legal pages. HTML, CSS, and a
small progressive-enhancement script; no framework, package dependencies, trackers, or external font requests. A
light/dark switch is available on every page. The default follows the browser/system preference, including changes
while the page is open; an explicit choice overrides it and is remembered locally.

The homepage introduces the invitation-only Satify app, its labelling workflow, and how to request access.
Remote sensing imagery is the general term used for the app's satellite, drone, and aerial imagery support.
The header's "The app" link leads to the app section, which also provides sign-in for existing users.
The free game introduces the labelling concepts without requiring an account or invitation.

## License

See [LICENSE](LICENSE) for copyright and permissions. The website is not offered under an open-source license;
third-party material, including the Silkscreen font, retains its own license terms.

## Local preview

Open `index.html` through your IDE's built-in web preview. Reload the browser after changes.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` checks, builds, and deploys on pushes to `main`, or on a manual run. In
the repository's **Settings → Pages**, choose **GitHub Actions** as the source. After the first successful deployment
the project URL is expected to be `https://ssatify.github.io/satify-webpage/`; use the workflow's actual deployment URL
to confirm.

## Content and legal migration

Legal content was taken from the current [imprint](https://www.satify.tech/imprint/)
and [privacy notice](https://www.satify.tech/privacy/) on 22 September 2026. Changes in the new notice:

- Controller address changed to Mittlerer Landweg 26, 21033 Hamburg; supervisory-authority contact updated to Hamburg.
- IONOS website hosting, WebAnalytics, and Website Builder cookie descriptions replaced with GitHub Pages hosting
  information.
- IONOS email, app, game, account, retention, and consent provisions preserved.
- The new website uses no analytics or website-set cookies; the optional theme choice is saved in local storage
  (`satify-theme`), as described in the privacy notice; links to the app and game lead to their separate services.

The new hosting text describes the planned GitHub Pages deployment. The existing public website notice must stay with
the existing host until that website is switched. Recheck the notice if hosting or tracking behavior changes.

Sources for the revised
sections: [GitHub Pages data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection), [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement), [Hamburg supervisory authority](https://datenschutz-hamburg.de/).

## Design assets

- Original Satify SVG and PNG supplied by the owner, in `assets/`.
- Silkscreen by Jason Kottke, self-hosted under the SIL Open Font License; license in `assets/fonts/OFL.txt`.
  Source: [Google Fonts](https://github.com/google/fonts/tree/main/ofl/silkscreen).
- Original generated pixel artwork: `assets/pixel-world.png`. Creation details and the full prompt are
  in [docs/artwork.md](docs/artwork.md).
- Game promotion screenshot: `assets/satify-game-mobile.png`, supplied by Marco on 22 September 2026.
  It shows the actual Satify game on mobile, with satellite imagery, labels, and labelling tools. The original
  screenshot is displayed without retouching and can be opened at full size. The interactive hero retains the pixel artwork.
- App workspace screenshot: `assets/satify-app-workspace.png`, supplied by Marco on 22 September 2026.
  Displayed without retouching in the app section, with an enlarged on-page panel that closes using its Close button,
  Escape, or a click outside the panel. It shows label classes,
  Smart Fill controls, and the settings panel; the visible OpenStreetMap attribution is retained.
- The hero illustration is an eight-area discovery game: one connected river, a separate lower-right waterfall, three
  forests, and three built-up areas. Click or tap an area to reveal it. Map areas use pointer input only; the legend and
  status share a compact two-column footer. Each newly discovered area plays a short chime. Duplicate clicks do not
  increase the score or play a sound. Finding all eight triggers pixel fireworks and a locally synthesised victory
  sound, with a sound icon in the map header that toggles all game sounds and an inline replay button shown only after
  completion. Reduced-motion preferences replace the animation with still pixel stars. Progress is kept only for the
  current page visit. Without JavaScript the illustration and website navigation remain usable.

## Game sounds

The sounds were created in code for this website during development. They are synthesised directly in
the visitor's browser using the Web Audio API in [discovery.js](discovery.js), with square-wave tones and short volume
envelopes for a retro chiptune sound. No audio recordings, downloaded sound packs, third-party samples, or external
audio services are used.

- **Discovery chime:** a short, rising two-note sound for each newly found area.
- **Victory fanfare:** a six-note melody after all eight areas are found, starting after the final discovery chime.
