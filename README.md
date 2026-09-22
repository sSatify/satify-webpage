# Satify website

A three-page static website for Satify: a cheerful pixel-art homepage and plain, readable legal pages. HTML, CSS, and a
small progressive-enhancement script; no framework, package dependencies, trackers, or external font requests. A
light/dark switch is available on every page; light is the default and an explicit choice is remembered locally.

## Local preview

Open `index.html` through your IDE's built-in web preview. Reload the browser after changes.

## Check and build

Use Node.js 22 or later:

```sh
npm run check
npm run build
```

The build copies only public website files into `dist/`. Reference downloads, tools, and documentation are excluded. All
page and asset links are relative, supporting both the GitHub project URL and a future custom domain.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` checks, builds, and deploys on pushes to `main`, or on a manual run. In
the repository's **Settings → Pages**, choose **GitHub Actions** as the source. After the first successful deployment
the project URL is expected to be `https://ssatify.github.io/satify-webpage/`; use the workflow's actual deployment URL
to confirm.

Nothing has been published or configured remotely as part of local development.

## Later: connect www.satify.tech

1. Review the website on its GitHub Pages URL.
2. Verify ownership of `satify.tech` with GitHub, then set `www.satify.tech` as the repository's Pages custom domain.
3. Change the `www` DNS record to a CNAME pointing to `ssatify.github.io`. Preserve the app, game, email and
   verification records. Configure the apex domain separately if it should redirect to `www`.
4. Once GitHub has issued the certificate, enable HTTPS and verify `/`, `/imprint/`, and `/privacy/`, including the app
   and game links to those legal pages.

No `CNAME` is included yet: the current domain remains on its existing host until the cutover is requested. Domain
verification and DNS
guidance: [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

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
- The hero illustration is an eight-area discovery game: one connected river, a separate lower-right waterfall, three forests, and three built-up areas. Click or tap an area to reveal it. Map areas use pointer input only; the legend and status share a compact two-column footer. Each newly discovered area plays a short chime. Duplicate clicks do not increase the score or play a sound. Finding all eight triggers pixel fireworks and a locally synthesised victory sound, with a sound icon in the map header that toggles all game sounds and an inline replay button shown only after completion. Reduced-motion preferences replace the animation with still pixel stars. Progress is kept only for the current page visit. Without JavaScript the illustration and website navigation remain usable.
