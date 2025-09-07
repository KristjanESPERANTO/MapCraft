import { geoMercator, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { GeoJSON2SVG } from 'geojson2svg'

export function exportSvgFromFeatures(params: {
  width: number
  height: number
  center: [number, number]
  zoom: number
  features: FeatureCollection<Geometry> | Feature<Geometry>
  styles?: Record<string, { fill?: string; stroke?: string; strokeWidth?: number }>
  styleKeyProp?: string
}): string {
  const { width, height, center, zoom, features } = params
  const styles = params.styles || {}
  const styleKeyProp = params.styleKeyProp || 'shapeGroup'

  // Approximate WebMercator scale for given zoom
  const scale = (256 / (2 * Math.PI)) * Math.pow(2, zoom)

  const projection = geoMercator()
    .center(center)
    .translate([width / 2, height / 2])
    .scale(scale)

  const path = geoPath(projection as any)

  const collection: FeatureCollection<Geometry> = Array.isArray((features as any).features)
    ? (features as FeatureCollection<Geometry>)
    : { type: 'FeatureCollection', features: [features as Feature<Geometry>] }

  // Compute bounds in current projection and crop SVG to that bbox
  let minX0 = Infinity, minY0 = Infinity, maxX0 = -Infinity, maxY0 = -Infinity
  for (const f of collection.features) {
    const b = path.bounds(f as any) as [[number, number], [number, number]] | undefined
    if (!b) continue
    const [[x0, y0], [x1, y1]] = b
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue
    if (x0 < minX0) minX0 = x0
    if (y0 < minY0) minY0 = y0
    if (x1 > maxX0) maxX0 = x1
    if (y1 > maxY0) maxY0 = y1
  }

  // Build initial content with the current projection (used for fallback if cropping not possible)
  const ds0 = collection.features
    .map((f: Feature<Geometry>) => path(f) || '')
    .filter(d => d.length > 0)
  let initialContent = ds0.map(d => `<path d="${d}" fill="rgba(100,149,237,0.35)" stroke="#333" stroke-width="1.5" />`).join('\n')
  if (!initialContent) {
    const d0 = path(collection as any) || ''
    if (d0) initialContent = `<path d="${d0}" fill="rgba(100,149,237,0.35)" stroke="#333" stroke-width="1.5" />`
  }

  // If bounds are invalid (no finite values), fall back to full-canvas export (no crop)
  const haveBounds = Number.isFinite(minX0) && Number.isFinite(minY0) && Number.isFinite(maxX0) && Number.isFinite(maxY0)
  if (!haveBounds || !initialContent) {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
      `<desc>MapCraft SVG Export</desc>\n` +
      `<metadata>\n` +
      `  <rdf:RDF>\n` +
      `    <cc:Work rdf:about="">\n` +
      `      <dc:title>MapCraft SVG Export</dc:title>\n` +
      `      <dc:creator>MapCraft</dc:creator>\n` +
      `      <cc:license rdf:resource="https://creativecommons.org/licenses/by/4.0/"/>\n` +
      `      <dc:description>geoBoundaries data is licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0). You must give appropriate credit to geoBoundaries, provide a link to the license, and indicate if changes were made.</dc:description>\n` +
      `    </cc:Work>\n` +
      `  </rdf:RDF>\n` +
      `</metadata>\n` +
      `<g>${initialContent
        .replace(/fill=\"rgba\(100,149,237,0\.35\)\"/g, 'fill="rgb(100,149,237)" fill-opacity="0.35"')
        .replace(/stroke-width=\"1\.5\"/g, 'stroke-width="1.5" vector-effect="non-scaling-stroke"')}</g>\n` +
      `</svg>`
    return svg
  }

  const pad = 2 // pixels
  const rawW = Math.max(1, Math.ceil(maxX0 - minX0))
  const rawH = Math.max(1, Math.ceil(maxY0 - minY0))
  // We'll derive final outW/outH later from projected aspect ratio, using this as the target long side
  const CLAMP_MAX = 4096 // cap extremely large exports to keep strokes visible and files manageable
  const targetLongSide = Math.min(CLAMP_MAX, Math.max(rawW, rawH))
  // Initialize; will be recomputed after projected extent is known
  let outW = rawW + 2 * pad
  let outH = rawH + 2 * pad

  // Project GeoJSON coordinates to Mercator first, then convert without a runtime converter.
  const baseProj2 = geoMercator().scale(1).translate([0, 0])

  function projPoint(pos: Position): [number, number] {
    const p = baseProj2([pos[0] as number, pos[1] as number] as any) as [number, number]
    return p
  }
  function projCoords(coords: any): any {
    if (typeof coords[0] === 'number') {
      return projPoint(coords as Position)
    }
    return (coords as any[]).map(projCoords)
  }
  function projGeometry(g: Geometry | null): Geometry | null {
    if (!g) return g
    const t = g.type
    if (t === 'Point' || t === 'MultiPoint' || t === 'LineString' || t === 'MultiLineString' || t === 'Polygon' || t === 'MultiPolygon') {
      return { type: t as any, coordinates: projCoords((g as any).coordinates) } as any
    }
    if (t === 'GeometryCollection') {
      const gc = g as any
      return { type: 'GeometryCollection', geometries: (gc.geometries || []).map((gg: Geometry) => projGeometry(gg)).filter(Boolean) as Geometry[] }
    }
    return g
  }
  const projected: FeatureCollection<Geometry> = {
    type: 'FeatureCollection',
    features: collection.features.map(f => {
      const props: any = { ...(f.properties || {}) }
      const keyVal = (props && props[styleKeyProp]) as string | undefined
      const st = (keyVal && styles[keyVal]) || {}
      if (st.fill) props.__fill = st.fill
      if (st.stroke) props.__stroke = st.stroke
      if (typeof st.strokeWidth === 'number') props.__strokeWidth = String(st.strokeWidth)
      return {
        type: 'Feature',
        properties: props,
        geometry: projGeometry(f.geometry) as Geometry,
      } as any
    })
  }
  // Compute projected extent
  let projMinX = Infinity, projMinY = Infinity, projMaxX = -Infinity, projMaxY = -Infinity
  const scan = (coords: any) => {
    if (typeof coords[0] === 'number') {
      const x = coords[0] as number, y = coords[1] as number
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      if (x < projMinX) projMinX = x
      if (y < projMinY) projMinY = y
      if (x > projMaxX) projMaxX = x
      if (y > projMaxY) projMaxY = y
    } else {
      for (const c of coords) scan(c)
    }
  }
  for (const f of projected.features) {
    const g = f.geometry as any
    if (!g) continue
    if (g.type === 'GeometryCollection') {
      for (const gg of (g.geometries || [])) {
        // @ts-ignore
        if (gg && (gg as any).coordinates) scan((gg as any).coordinates)
      }
    } else if ((g as any).coordinates) {
      // @ts-ignore
      scan((g as any).coordinates)
    }
  }
  if (!Number.isFinite(projMinX) || !Number.isFinite(projMinY) || !Number.isFinite(projMaxX) || !Number.isFinite(projMaxY)) {
    // Fallback to earlier initial projection content
    const svg = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" width=\"${width}\" height=\"${height}\" viewBox=\"0 0 ${width} ${height}\">\n` +
      `<desc>MapCraft SVG Export</desc>\n` +
      `<metadata>\n` +
      `  <rdf:RDF>\n` +
      `    <cc:Work rdf:about="">\n` +
      `      <dc:title>MapCraft SVG Export</dc:title>\n` +
      `      <dc:creator>MapCraft</dc:creator>\n` +
      `      <cc:license rdf:resource="https://creativecommons.org/licenses/by/4.0/"/>\n` +
      `      <dc:description>geoBoundaries data is licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0). You must give appropriate credit to geoBoundaries, provide a link to the license, and indicate if changes were made.</dc:description>\n` +
      `    </cc:Work>\n` +
      `  </rdf:RDF>\n` +
      `</metadata>\n` +
      `<g>${initialContent
        .replace(/fill=\"rgba\(100,149,237,0\.35\)\"/g, 'fill="rgb(100,149,237)" fill-opacity="0.35"')
        .replace(/stroke-width=\"1\.5\"/g, 'stroke-width="1.5" vector-effect="non-scaling-stroke"')}</g>\n` +
      `</svg>`
    return svg
  }
  // Recompute output dimensions to match projected aspect ratio (avoid forcing square)
  const projW = Math.max(1e-6, projMaxX - projMinX)
  const projH = Math.max(1e-6, projMaxY - projMinY)
  const ar = projW / projH
  if (ar >= 1) {
    outW = Math.max(1, Math.round(targetLongSide)) + 2 * pad
    outH = Math.max(1, Math.round(targetLongSide / ar)) + 2 * pad
  } else {
    outH = Math.max(1, Math.round(targetLongSide)) + 2 * pad
    outW = Math.max(1, Math.round(targetLongSide * ar)) + 2 * pad
  }
  const converter = new GeoJSON2SVG({
    // Use natural projected extent; we'll flip vertically in SVG to keep north up.
    mapExtent: { left: projMinX, bottom: projMinY, right: projMaxX, top: projMaxY },
    viewportSize: { width: outW, height: outH },
    precision: 2,
    attributes: [
      // defaults
      { property: 'fill', value: 'rgb(100,149,237)', type: 'static' },
      { property: 'fill-opacity', value: '0.35', type: 'static' },
      { property: 'stroke', value: '#333', type: 'static' },
      { property: 'stroke-width', value: '1.5', type: 'static' },
      // dynamic overrides from feature properties
      { property: 'properties.__fill', type: 'dynamic', key: 'fill' },
      { property: 'properties.__stroke', type: 'dynamic', key: 'stroke' },
      { property: 'properties.__strokeWidth', type: 'dynamic', key: 'stroke-width' },
      { property: 'vector-effect', value: 'non-scaling-stroke', type: 'static' },
      { property: 'fill-rule', value: 'evenodd', type: 'static' },
      { property: 'clip-rule', value: 'evenodd', type: 'static' },
    ]
  } as any)
  const content = converter.convert(projected as any).join('\n')
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">\n` +
    `<desc>MapCraft SVG Export (cropped)</desc>\n` +
    `<metadata>\n` +
    `  <rdf:RDF>\n` +
    `    <cc:Work rdf:about="">\n` +
    `      <dc:title>MapCraft SVG Export</dc:title>\n` +
    `      <dc:creator>MapCraft</dc:creator>\n` +
    `      <cc:license rdf:resource="https://creativecommons.org/licenses/by/4.0/"/>\n` +
    `      <dc:description>geoBoundaries data is licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0). You must give appropriate credit to geoBoundaries, provide a link to the license, and indicate if changes were made.</dc:description>\n` +
    `    </cc:Work>\n` +
    `  </rdf:RDF>\n` +
    `</metadata>\n` +
    `<g transform="translate(0, ${outH}) scale(1, -1)">${content}</g>\n` +
    `</svg>`

  return svg
}
