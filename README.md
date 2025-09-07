# 🌐 MapCraft

**MapCraft** is a lightweight, frontend‑only map composer to load and style country boundaries ([geoBoundaries](https://github.com/wmgeolab/geoBoundaries/)), draw simple shapes, and export clean SVGs for teaching, research, and design.

## 🗺️ Country Selection & Display

- **Country Selection**: Users can select countries in two ways:
  - **Search by Name**: Interactive autocomplete search with country names (e.g., "Germany", "France")
  - **ISO3 Codes**: Manual input of ISO3 country codes (e.g., "DEU,FRA")
- **Selected Countries Display**: Visual tags showing selected countries with easy removal
- **Boundary Data**: Country boundaries from geoBoundaries (using simplified geometries for better performance and smaller file sizes), loaded on demand as GeoJSON (TopoJSON is only used in build scripts when conversion is needed).
- **Combining Multiple Countries**: Ideal for comparisons, geopolitical analyses, or historical contexts.
- **Individual Styling**:
  - Per-country fill color, border color, and border width.
  - Deterministic pastel defaults per country.
  - Shows boundary year or fetch date when available (from local metadata).
  - Drawing tools: Lines, polygons, points via MapLibre Draw (panel styling currently applies to countries only).

## 🧭 Additional Layers & Overlays

- Not yet implemented: Time zones overlay, climate zones overlay, vegetation or elevation maps.

## 💾 Saving & Restoring

- Not yet implemented: Local saving in browser, caching of current view and loaded geometries.

## 📤 Export & Sharing

- **SVG (focus)**: Dedicated export path that re-renders all custom vector layers (boundaries, drawings) with d3-geo and geojson2svg in identical projection as pure SVG. Note: Tile basemap is not exported as SVG.
- Not yet implemented: PNG/JPG, interactive HTML map, QR code generator.

### Development (local)

- Start: `npm install` and `npm run dev`. The app runs locally via Vite.
- Build: `npm run build`, Preview: `npm run preview`.

## 🧱 Architecture

- **Frontend-only Application**  
  All logic runs in the browser – no server component required.

- **Technologies**  
  - HTML5, CSS3, JavaScript/TypeScript (ES6+)
  - [MapLibre GL JS](https://maplibre.org/) for performant, interactive maps (WebGL)
  - [maplibre-gl-draw](https://github.com/maplibre/maplibre-gl-draw) for drawing/editing (lines, polygons, points)
  - Optional in build scripts: [topojson-client](https://github.com/topojson/topojson-client) (used only for conversion in scripts)
  - [idb-keyval](https://github.com/jakearchibald/idb-keyval) for IndexedDB storage (planned)
  - [lz-string](https://pieroxy.net/blog/pages/lz-string/) for URL hash sharing (planned)
  - [qrcode](https://github.com/soldair/node-qrcode) for QR codes (planned)
  - For SVG export: [d3-geo](https://github.com/d3/d3-geo) and [geojson2svg](https://www.npmjs.com/package/geojson2svg) as export renderer
  - Local data vendoring scripts for geoBoundaries

- **Data Sources**  
  - Primary: [geoBoundaries](https://www.geoboundaries.org/) (current country/administrative boundaries)
  - Optional: OSM/Overpass for special boundaries; with caching and attribution

## 📚 Target Audience

- Teachers (Geography, History, Politics)
- Students: Project work, presentations
- Educational institutions & NGOs

## 🧪 Extension Ideas

- User accounts via Web Storage (without backend)
- Drag-and-drop for text fields and markers
- Historical map views (via external sources)
- Presentation mode for teaching

## 🔁 SVG Export Strategy

- MapLibre GL provides interaction (pan/zoom/style). For export, camera parameters (center, zoom, size) are read and mapped to a d3-geo Mercator projection.
- Custom vector layers (geoBoundaries, drawings) are rendered with this projection as pure SVG: print-ready, losslessly scalable.
- Basemap tiles are not exported as SVG. Options: a) Export without basemap, b) simple vector base (simplified coasts/rivers) as layer.

Note: For WebMercator, scale ≈ (256 / (2π)) · 2^zoom; the d3-geo projection is translated to the current viewport center.

## ⚙️ Data workflow

- Local vendoring of geoBoundaries data under `public/data/gbOpen/<ISO>/<ADM>/`.
- Scripts:
  - `scripts/fetch-geo.js` to fetch a single or multiple ISO3 codes for ADM0/ADM1.
  - `scripts/fetch-geo-all.js` and `scripts/fetch-all.sh` for batch fetch.
  - Writes GeoJSON plus a `meta.json` (includes fetchedAt and source metadata).
- CI: on-demand workflow to fetch boundaries and upload as build artifact.
- Future: optional simplification and additional sources can be added in scripts if needed.

## ⚖️ License Notice

When exporting maps or data from MapCraft, ensure compliance with the licenses of the underlying data sources. The primary data source is geoBoundaries, licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0).

For exported SVGs or other outputs containing geoBoundaries data:

- Provide appropriate credit to geoBoundaries.
- Include a link to the license: https://creativecommons.org/licenses/by/4.0/
- Indicate if changes were made to the data.

If other overlay data is included in exports, display their respective licenses and attributions visibly.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌐 Deploying to GitHub Pages

The app is set up to deploy to GitHub Pages automatically on pushes to `main`.

- Vite `base` is configured as `/MapCraft/` in `vite.config.ts` (project pages at `https://<user>.github.io/MapCraft/`).
- Workflow `.github/workflows/deploy-pages.yml` builds the site and publishes `dist/` to Pages.
- In your repo settings, enable Pages (Source: GitHub Actions). After the first successful run, your site is available at:
  - `https://kristjanesperanto.github.io/MapCraft/`

If you fork or rename the repo, update the `base` in `vite.config.ts` accordingly.

## 🚀 To‑Do

- Implement local saving in browser (IndexedDB)
- Add PNG/JPG export via canvas
- Add interactive HTML export
- Add QR code generator
- Add time zones and climate zones overlays
- Test SVG export on southern hemisphere (e.g., AUS, BRA) for correct projection and orientation
- Implement unit tests for critical functions
- Add option to add continent outlines as additional layer
- Translate UI to multiple languages (i18n)
- Style editor: unify draw-object styling with country styling in a safe, maintainable way
- Optional: OSM/Overpass fallback for special cases (with caching and attribution)