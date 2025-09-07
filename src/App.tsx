import { useEffect, useRef, useState } from 'react'
import maplibregl, { LngLatLike, Map } from 'maplibre-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'
import { exportSvgFromFeatures } from './svgExport'
import type { FeatureCollection, Geometry } from 'geojson'
import { CountryAutocomplete } from './CountryAutocomplete'
import { Country, countries } from './countries'

export default function App() {
  const mapRef = useRef<Map | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [draw, setDraw] = useState<any>(null)
  const [isoInput, setIsoInput] = useState<string>('')
  const [admLevel, setAdmLevel] = useState<'ADM0'|'ADM1'>('ADM0')
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry>>({ type: 'FeatureCollection', features: [] })
  const [status, setStatus] = useState<string>('Ready')
  const [styleKeyProp] = useState<string>('shapeGroup')
  const [stylesByKey, setStylesByKey] = useState<Record<string, { fill?: string; stroke?: string; strokeWidth?: number }>>({})
  const [panelExpanded, setPanelExpanded] = useState<boolean>(true)
  const [selectedCountries, setSelectedCountries] = useState<Country[]>([])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: [
              'https://tiles.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
          }
        },
        layers: [
          { id: 'raster', type: 'raster', source: 'raster-tiles' }
        ]
      },
      center: [10, 51] as LngLatLike,
      zoom: 4,
      hash: true,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }))

    const drawStyles: any[] = [
      // Lines
      { id: 'gl-draw-line-inactive', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['!=', 'active', 'true']], paint: { 'line-color': ['coalesce', ['get', 'mapcraftStroke'], '#3b9ddd'], 'line-width': ['coalesce', ['get', 'mapcraftWidth'], 2] } },
      { id: 'gl-draw-line-active', type: 'line', filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']], paint: { 'line-color': ['coalesce', ['get', 'mapcraftStroke'], '#3b9ddd'], 'line-width': ['coalesce', ['get', 'mapcraftWidth'], 2] } },
      // Polygons
      { id: 'gl-draw-polygon-fill-inactive', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'active', 'true']], paint: { 'fill-color': ['coalesce', ['get', 'mapcraftFill'], '#3b9ddd'], 'fill-opacity': 0.1 } },
      { id: 'gl-draw-polygon-stroke-inactive', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'active', 'true']], paint: { 'line-color': ['coalesce', ['get', 'mapcraftStroke'], '#3b9ddd'], 'line-width': ['coalesce', ['get', 'mapcraftWidth'], 2] } },
      { id: 'gl-draw-polygon-fill-active', type: 'fill', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']], paint: { 'fill-color': ['coalesce', ['get', 'mapcraftFill'], '#3b9ddd'], 'fill-opacity': 0.1 } },
      { id: 'gl-draw-polygon-stroke-active', type: 'line', filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']], paint: { 'line-color': ['coalesce', ['get', 'mapcraftStroke'], '#3b9ddd'], 'line-width': ['coalesce', ['get', 'mapcraftWidth'], 2] } },
      // Points
      { id: 'gl-draw-point-inactive', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['!=', 'active', 'true']], paint: { 'circle-radius': 5, 'circle-color': ['coalesce', ['get', 'mapcraftFill'], '#3b9ddd'], 'circle-stroke-width': 1, 'circle-stroke-color': ['coalesce', ['get', 'mapcraftStroke'], '#fff'] } },
      { id: 'gl-draw-point-active', type: 'circle', filter: ['all', ['==', '$type', 'Point'], ['==', 'active', 'true']], paint: { 'circle-radius': 6, 'circle-color': ['coalesce', ['get', 'mapcraftFill'], '#3b9ddd'], 'circle-stroke-width': 2, 'circle-stroke-color': ['coalesce', ['get', 'mapcraftStroke'], '#fff'] } },
    ]

    const d: any = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, line_string: true, point: true, trash: true },
      styles: drawStyles,
    })
  map.addControl(d as any, 'top-right')
    setDraw(d)
    // Assign a style key to new/updated drawn features so they can be styled like countries
    const ensureDefaultStyle = (key: string) => {
      setStylesByKey(prev => {
        if (prev[key]) return prev
        const { fill, stroke } = pastelForKey(key)
        return { ...prev, [key]: { fill, stroke, strokeWidth: 1.5 } }
      })
    }
    const ensureStyleKey = (features: any[]) => {
      try {
        for (const f of (features || [])) {
          const id = (f as any)?.id
          const hasKey = !!(f as any)?.properties?.[styleKeyProp]
          if (id && !hasKey) {
            const key = `DRAW-${String(id).slice(0, 6)}`
            try { (d as any).setFeatureProperty(id, styleKeyProp, key) } catch {}
            ensureDefaultStyle(key)
          } else if (hasKey) {
            const key = String((f as any).properties[styleKeyProp])
            ensureDefaultStyle(key)
          }
        }
      } catch {}
    }

    const onCreate = (e: any) => {
      const feats = e?.features || []
      ensureStyleKey(feats)
      // Seed default mapcraft* props so style expressions take effect immediately
      try {
        for (const f of feats) {
          const id = (f as any)?.id
          if (!id) continue
          const key = String((f as any)?.properties?.[styleKeyProp] || '')
          const st = key && stylesByKey[key] ? stylesByKey[key] : pastelForKey(key || `DRAW-${String(id).slice(0,6)}`)
          const fill = (st as any).fill || '#5b9bd5'
          const stroke = (st as any).stroke || '#2f5597'
          const width = typeof (st as any).strokeWidth === 'number' ? (st as any).strokeWidth : 1.5
          try {
            ;(d as any).setFeatureProperty(id, 'mapcraftFill', fill)
            ;(d as any).setFeatureProperty(id, 'mapcraftStroke', stroke)
            ;(d as any).setFeatureProperty(id, 'mapcraftWidth', width)
          } catch {}
        }
      } catch {}
      applyPerFeatureStyles()
    }
    const onUpdate = (e: any) => { ensureStyleKey(e?.features || []); applyPerFeatureStyles() }
    const onDelete = (_e: any) => { applyPerFeatureStyles() }
    map.on('draw.create', onCreate)
    map.on('draw.update', onUpdate)
    map.on('draw.delete', onDelete)

    mapRef.current = map
    return () => {
      map.off('draw.create', onCreate)
      map.off('draw.update', onUpdate)
      map.off('draw.delete', onDelete)
      map.remove();
      mapRef.current = null
    }
  }, [])

  // Removed URL loader; we keep only ISO/ADM loader with local-first then remote fallback.

  // Simple bbox for Feature (lon/lat) without turf dependency
  function bbox(f: any): [number, number, number, number] {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const coordsWalk = (g: any) => {
      const t = g.type
      const c = g.coordinates
      if (t === 'Point') {
        const [x, y] = c; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      } else if (t === 'MultiPoint' || t === 'LineString') {
        for (const p of c) { const [x, y] = p; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
      } else if (t === 'MultiLineString' || t === 'Polygon') {
        for (const r of c) for (const p of r) { const [x, y] = p; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
      } else if (t === 'MultiPolygon') {
        for (const poly of c) for (const r of poly) for (const p of r) { const [x, y] = p; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
      } else if (t === 'GeometryCollection') {
        for (const gg of g.geometries) coordsWalk(gg)
      }
    }
    coordsWalk(f.geometry)
    return [minX, minY, maxX, maxY]
  }

  async function handleExportSVG() {
    const map = mapRef.current
    if (!map) return
    const features = draw?.getAll()
    const bounds = map.getBounds()
    const canvas = map.getCanvas()
    const width = canvas.width
    const height = canvas.height
    const center = map.getCenter()
    const zoom = map.getZoom()

    // Merge boundaries + drawn features (no topology ops; pure overlay)
    const merged: FeatureCollection<Geometry> = {
      type: 'FeatureCollection',
      features: [
        ...boundaries.features,
        ...((features?.features as any) || [])
      ]
    }

    const svg = exportSvgFromFeatures({
      width,
      height,
      center: [center.lng, center.lat],
      zoom,
  features: merged,
  styles: stylesByKey,
  styleKeyProp,
    })

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mapcraft-export.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  function uniqStyleKeys(): string[] {
    const keys = new Set<string>()
    for (const f of boundaries.features as any[]) {
      const k = f?.properties?.[styleKeyProp]
      if (k) keys.add(String(k))
    }
    return Array.from(keys).sort()
  }

  function updateStyle(key: string, patch: Partial<{ fill: string; stroke: string; strokeWidth: number }>) {
    setStylesByKey(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  // Handle country selection from autocomplete
  function handleCountrySelect(country: Country) {
    if (!selectedCountries.find(c => c.iso3 === country.iso3)) {
      setSelectedCountries(prev => [...prev, country])
      // Update isoInput to include the new country
      const currentIsos = isoInput.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
      if (!currentIsos.includes(country.iso3)) {
        const newIsos = [...currentIsos, country.iso3]
        setIsoInput(newIsos.join(','))
      }
    }
  }

  // Handle country removal
  function handleCountryRemove(country: Country) {
    setSelectedCountries(prev => prev.filter(c => c.iso3 !== country.iso3))
    // Update isoInput to remove the country
    const currentIsos = isoInput.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    const newIsos = currentIsos.filter(iso => iso !== country.iso3)
    setIsoInput(newIsos.join(','))
  }

  // Update selected countries when isoInput changes
  useEffect(() => {
    const isos = isoInput.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    const newSelectedCountries: Country[] = []
    for (const iso of isos) {
      // Try to find the country in our data
      const country = countries.find(c => c.iso3.toUpperCase() === iso)
      if (country) {
        newSelectedCountries.push(country)
      }
    }
    setSelectedCountries(newSelectedCountries)
  }, [isoInput])

  async function handleLoadISO3() {
    const map = mapRef.current
    if (!map || !isoInput.trim()) return
    const isos = isoInput.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    try {
  setStatus(`Loading ${isos.join(', ')} ${admLevel} …`)
      const fcs: FeatureCollection<Geometry>[] = []
      const badges: string[] = []
      for (const iso of isos) {
    // 1) Try local vendored files first (no external requests)
        const base = (import.meta as any).env?.BASE_URL || '/'
        const rel = `data/gbOpen/${iso}/${admLevel}/geoBoundaries-${iso}-${admLevel}`
        const localCandidates = [
          `${base}${rel}.geojson`,
          `${base}${rel}.topojson`,
          `/${rel}.geojson`,
          `/${rel}.topojson`,
          `${rel}.geojson`,
          `${rel}.topojson`,
        ]
        let loadedLocal = false
        const attempted: string[] = []
          // Try reading meta.json for date/info badges
          const metaUrlLocal = `public/data/gbOpen/${iso}/${admLevel}/meta.json`
          let metaBadge: string | null = null
          try {
            const m = await fetchLocalJson(metaUrlLocal)
            if (m && (m.fetchedAt || m.meta?.boundaryYear || m.meta?.buildDate)) {
              const year = m.meta?.boundaryYear || (m.meta?.boundaryYearRepresented) || null
              const fetched = m.fetchedAt ? new Date(m.fetchedAt).toISOString().slice(0, 10) : null
              metaBadge = year ? `${iso}(${year})` : (fetched ? `${iso}@${fetched}` : null)
            }
          } catch {}
        for (const loc of localCandidates) {
          attempted.push(loc)
          try {
            const gj = await fetchLocalJson(loc)
            if (gj) {
              let fc: FeatureCollection<Geometry>
              // Assume all local files are GeoJSON (no TopoJSON conversion needed)
              fc = gj.type === 'FeatureCollection' ? gj : { type: 'FeatureCollection', features: [gj] }
              fcs.push(fc)
              loadedLocal = true
                badges.push(metaBadge ? `${metaBadge} ✓ local` : `${iso}✓ local`)
              break // stop checking local candidates
            }
          } catch {}
        }
        if (loadedLocal) {
          continue // proceed to next ISO, skip remote fetch entirely
        }
        // 3) Fallback to remote geoBoundaries API if no local file found
    const metaUrl = `https://www.geoboundaries.org/api/current/gbOpen/${iso}/${admLevel}/`
    const metaRes = await fetch(metaUrl)
    if (!metaRes.ok) throw new Error(`Meta HTTP ${metaRes.status} for ${iso}`)
    const meta: any = await metaRes.json()
        const dl = meta.gjDownloadURL || meta.simplifiedGeometryGeoJSON || meta.geojsonDownloadURL || meta.geojsonURL || meta.downloadURL || meta.tjDownloadURL
  if (!dl) throw new Error(`No GeoJSON download URL for ${iso}`)
  const gj = await fetchJsonWithFallback(dl)
        let fc: FeatureCollection<Geometry>
        // Assume all remote data is GeoJSON (no TopoJSON conversion needed)
        fc = gj.type === 'FeatureCollection' ? gj : { type: 'FeatureCollection', features: [gj] }
        fcs.push(fc)
        badges.push(`${iso}⤓ remote`)
      }

      // Merge features
      const merged: FeatureCollection<Geometry> = { type: 'FeatureCollection', features: fcs.flatMap(fc => fc.features) }
      setBoundaries(merged)

  // Add to map
  const mapSourceId = 'user-boundaries'
  const fillId = 'user-boundaries-fill'
  const lineId = 'user-boundaries-line'
  if (map.getLayer(fillId)) map.removeLayer(fillId)
  if (map.getLayer(lineId)) map.removeLayer(lineId)
  if (map.getSource(mapSourceId)) map.removeSource(mapSourceId)
  map.addSource(mapSourceId, { type: 'geojson', data: merged })
  map.addLayer({ id: fillId, type: 'fill', source: mapSourceId, paint: { 'fill-color': '#5b9bd5', 'fill-opacity': 0.35 } })
  map.addLayer({ id: lineId, type: 'line', source: mapSourceId, paint: { 'line-color': '#2f5597', 'line-width': 1.5 } })
  applyPerFeatureStyles()

      // Fit
      let agg: [number, number, number, number] | null = null
      for (const f of merged.features) {
        const bb = bbox(f)
        if (!agg) { agg = bb } else {
          agg = [
            Math.min(agg[0], bb[0]),
            Math.min(agg[1], bb[1]),
            Math.max(agg[2], bb[2]),
            Math.max(agg[3], bb[3]),
          ]
        }
      }
      if (agg) {
        const panel = document.querySelector('.main-panel') as HTMLElement | null
        const panelWidth = panel ? panel.offsetWidth : 0
        const leftPad = Math.max(40, (panelWidth || 0) + 24) // add a small gutter next to the panel
        const padding = { top: 40, right: 40, bottom: 40, left: leftPad }
        map.fitBounds([[agg[0], agg[1]], [agg[2], agg[3]]], { padding, duration: 700 })
      }
  setStatus(`Done: ${badges.join(' · ')}`)
    } catch (e) {
      console.error(e)
  setStatus('Load error')
      alert('Could not load geoBoundaries. Check ISO3 codes, ADM level, and network access.')
    }
  }

  // Build expressions and apply per-feature styles for the boundaries and draw layers
  function applyPerFeatureStyles() {
    const map = mapRef.current
    if (!map) return
    const fillId = 'user-boundaries-fill'
    const lineId = 'user-boundaries-line'
    const defaultFill = '#5b9bd5'
    const defaultStroke = '#2f5597'
    const defaultWidth = 1.5

    // Push computed style as properties onto boundary features in the source
    try {
      const src: any = map.getSource('user-boundaries') as any
      if (src && typeof src.setData === 'function') {
        const styled: FeatureCollection<Geometry> = {
          type: 'FeatureCollection',
          features: (boundaries.features as any[]).map(f => {
            const key = String(f?.properties?.[styleKeyProp] || '')
            const st = key && stylesByKey[key] ? stylesByKey[key] : {}
            const fill = st.fill || defaultFill
            const stroke = st.stroke || defaultStroke
            const width = typeof st.strokeWidth === 'number' ? st.strokeWidth : defaultWidth
            return {
              ...f,
              properties: { ...(f.properties || {}), mapcraftFill: fill, mapcraftStroke: stroke, mapcraftWidth: width },
            }
          })
        }
        src.setData(styled as any)
      }
    } catch {}

    const getFillProp: any = ['coalesce', ['get', 'mapcraftFill'], defaultFill]
    const getStrokeProp: any = ['coalesce', ['get', 'mapcraftStroke'], defaultStroke]
    const getWidthProp: any = ['coalesce', ['get', 'mapcraftWidth'], defaultWidth]

    if (map.getLayer(fillId)) {
      map.setPaintProperty(fillId, 'fill-color', getFillProp as any)
      map.setPaintProperty(fillId, 'fill-opacity', 0.35)
    }
    if (map.getLayer(lineId)) {
      map.setPaintProperty(lineId, 'line-color', getStrokeProp as any)
      map.setPaintProperty(lineId, 'line-width', getWidthProp as any)
    }

    // Apply to Mapbox Draw layers as well: push computed colors/sizes into per-feature properties
    try {
      const all = (draw?.getAll()?.features as any[]) || []
      for (const f of all) {
        const id = (f as any)?.id
        if (!id) continue
        const key = String((f as any)?.properties?.[styleKeyProp] || '')
        const st = (key && stylesByKey[key]) ? stylesByKey[key] : {}
        const fill = st.fill || defaultFill
        const stroke = st.stroke || defaultStroke
        const width = typeof st.strokeWidth === 'number' ? st.strokeWidth : defaultWidth
        try {
          ;(draw as any)?.setFeatureProperty(id, 'mapcraftFill', fill)
          ;(draw as any)?.setFeatureProperty(id, 'mapcraftStroke', stroke)
          ;(draw as any)?.setFeatureProperty(id, 'mapcraftWidth', width)
        } catch {}
      }
    } catch {}

    const drawFillInactive = 'gl-draw-polygon-fill-inactive'
    const drawFillActive = 'gl-draw-polygon-fill-active'
    const drawPolyStrokeInactive = 'gl-draw-polygon-stroke-inactive'
    const drawPolyStrokeActive = 'gl-draw-polygon-stroke-active'
    const drawLineInactive = 'gl-draw-line-inactive'
    const drawLineActive = 'gl-draw-line-active'
    const drawPointInactive = 'gl-draw-point-inactive'
    const drawPointActive = 'gl-draw-point-active'

  // Reuse the same property-based expressions for draw layers

    if (map.getLayer(drawFillInactive)) map.setPaintProperty(drawFillInactive, 'fill-color', getFillProp as any)
    if (map.getLayer(drawFillActive)) map.setPaintProperty(drawFillActive, 'fill-color', getFillProp as any)
    if (map.getLayer(drawPolyStrokeInactive)) {
      map.setPaintProperty(drawPolyStrokeInactive, 'line-color', getStrokeProp as any)
      map.setPaintProperty(drawPolyStrokeInactive, 'line-width', getWidthProp as any)
    }
    if (map.getLayer(drawPolyStrokeActive)) {
      map.setPaintProperty(drawPolyStrokeActive, 'line-color', getStrokeProp as any)
      map.setPaintProperty(drawPolyStrokeActive, 'line-width', getWidthProp as any)
    }
    if (map.getLayer(drawLineInactive)) {
      map.setPaintProperty(drawLineInactive, 'line-color', getStrokeProp as any)
      map.setPaintProperty(drawLineInactive, 'line-width', getWidthProp as any)
    }
    if (map.getLayer(drawLineActive)) {
      map.setPaintProperty(drawLineActive, 'line-color', getStrokeProp as any)
      map.setPaintProperty(drawLineActive, 'line-width', getWidthProp as any)
    }
    if (map.getLayer(drawPointInactive)) {
      map.setPaintProperty(drawPointInactive, 'circle-color', getFillProp as any)
      map.setPaintProperty(drawPointInactive, 'circle-stroke-color', getStrokeProp as any)
      map.setPaintProperty(drawPointInactive, 'circle-stroke-width', 1.5)
    }
    if (map.getLayer(drawPointActive)) {
      map.setPaintProperty(drawPointActive, 'circle-color', getFillProp as any)
      map.setPaintProperty(drawPointActive, 'circle-stroke-color', getStrokeProp as any)
      map.setPaintProperty(drawPointActive, 'circle-stroke-width', 2)
    }
  }

  // Re-apply styles when the map or the style map changes
  useEffect(() => {
    applyPerFeatureStyles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stylesByKey, boundaries])

  // --- Color utilities for deterministic pastels per key ---
  function hashString(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return Math.abs(h >>> 0)
  }
  function clamp01(x: number) { return Math.min(1, Math.max(0, x)) }
  function hslToHex(h: number, s: number, l: number): string {
    // h [0,360), s,l [0,1]
    h = ((h % 360) + 360) % 360
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0, g = 0, b = 0
    if (0 <= h && h < 60) { r = c; g = x; b = 0 }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0 }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c }
    else { r = c; g = 0; b = x }
    const R = Math.round((r + m) * 255)
    const G = Math.round((g + m) * 255)
    const B = Math.round((b + m) * 255)
    return '#' + [R, G, B].map(v => v.toString(16).padStart(2, '0')).join('')
  }
  function pastelForKey(key: string): { fill: string; stroke: string } {
    const h = hashString(key) % 360
    const s = 0.45 // pastel saturation
    const l = 0.82 // light fill
    const fill = hslToHex(h, s, l)
    const stroke = hslToHex(h, clamp01(s + 0.15), clamp01(l - 0.25))
    return { fill, stroke }
  }

  // Initialize missing styles with deterministic pastels when boundaries change
  useEffect(() => {
  const keys = uniqStyleKeys()
    if (keys.length === 0) return
    let changed = false
    const next: Record<string, { fill?: string; stroke?: string; strokeWidth?: number }> = { ...stylesByKey }
    for (const k of keys) {
      if (!next[k]) {
        const { fill, stroke } = pastelForKey(k)
  next[k] = { fill, stroke, strokeWidth: 1.5 }
        changed = true
      } else {
        // backfill missing fields if any
        const cur = next[k]
        if (!cur.fill || !cur.stroke) {
          const { fill, stroke } = pastelForKey(k)
          if (!cur.fill) cur.fill = fill
          if (!cur.stroke) cur.stroke = stroke
          if (typeof cur.strokeWidth !== 'number') cur.strokeWidth = 1.5
          changed = true
        }
      }
    }
    if (changed) setStylesByKey(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaries])

  // Rewrite GitHub download URLs to jsDelivr to avoid CORS issues in the browser
  function canonicalizeDownloadUrl(u: string): string {
    try {
      const url = new URL(u)
      // Pattern 1: github.com/<owner>/<repo>/raw/<commit>/<path>
      if (url.hostname === 'github.com') {
        const parts = url.pathname.split('/') // ['', owner, repo, 'raw', commit, ...path]
        const owner = parts[1]
        const repo = parts[2]
        const rawIdx = parts.indexOf('raw')
        if (owner && repo && rawIdx !== -1 && parts[rawIdx + 1]) {
          const commit = parts[rawIdx + 1]
          const subPath = parts.slice(rawIdx + 2).join('/')
          return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commit}/${subPath}`
        }
      }
      // Pattern 2: raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>
      if (url.hostname === 'raw.githubusercontent.com') {
        const parts = url.pathname.split('/') // ['', owner, repo, commit, ...path]
        const owner = parts[1]
        const repo = parts[2]
        const commit = parts[3]
        const subPath = parts.slice(4).join('/')
        if (owner && repo && commit && subPath) {
          return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commit}/${subPath}`
        }
      }
      return u
    } catch {
      return u
    }
  }

  async function fetchJsonWithFallback(u: string): Promise<any> {
    const tried = new Set<string>()
    const candidates: string[] = []
    
    // First try the original URL (might work in some cases)
    candidates.push(u)
    
    // Primary CDN
    const jsd = canonicalizeDownloadUrl(u)
    if (jsd !== u) candidates.push(jsd)
    
    // Secondary: rawcdn.githack.com
    const gh = toGitHack(u)
    if (gh) candidates.push(gh)
    
    // Tertiary: statically.io
    const stat = toStatically(u)
    if (stat) candidates.push(stat)
    
    // Quaternary: r.jina.ai text fetcher (CORS-friendly)
    const jina = toJina(u)
    if (jina) candidates.push(jina)

    for (const c of candidates) {
      if (tried.has(c)) continue
      tried.add(c)
      try {
        console.log('Trying URL:', c)
        const res = await fetch(c, { redirect: 'follow' })
        console.log('Response status:', res.status, 'ok:', res.ok)
        if (!res.ok) {
          console.log('Response not ok, trying next...')
          continue
        }
        const text = await res.text()
        const trimmed = text.trim()
        console.log('Response text length:', trimmed.length)
        if (trimmed.length === 0) {
          console.log('Empty response, trying next...')
          continue
        }
        if (trimmed.startsWith('<')) {
          console.log('HTML response, trying next...')
          continue
        }
        console.log('Parsing JSON...')
        return JSON.parse(trimmed)
      } catch (error) {
        console.log('Error with URL', c, ':', error instanceof Error ? error.message : String(error))
        // try next
      }
    }
    throw new Error('JSON fetch failed for: ' + u)
  }

  function toJina(u: string): string | null {
    try {
      // r.jina.ai can proxy any URL by prefixing it; prefer https variant
      const url = new URL(u)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        const encoded = `${url.protocol}//${url.hostname}${url.pathname}${url.search}`
        return `https://r.jina.ai/${encoded}`
      }
      return null
    } catch {
      return null
    }
  }

  function toGitHack(u: string): string | null {
    try {
      const url = new URL(u)
      if (url.hostname === 'github.com') {
        const parts = url.pathname.split('/')
        const owner = parts[1]
        const repo = parts[2]
        const rawIdx = parts.indexOf('raw')
        if (owner && repo && rawIdx !== -1 && parts[rawIdx + 1]) {
          const commit = parts[rawIdx + 1]
          const subPath = parts.slice(rawIdx + 2).join('/')
          return `https://rawcdn.githack.com/${owner}/${repo}/${commit}/${subPath}`
        }
      }
      if (url.hostname === 'raw.githubusercontent.com') {
        const parts = url.pathname.split('/')
        const owner = parts[1]
        const repo = parts[2]
        const commit = parts[3]
        const subPath = parts.slice(4).join('/')
        if (owner && repo && commit && subPath) {
          return `https://rawcdn.githack.com/${owner}/${repo}/${commit}/${subPath}`
        }
      }
      return null
    } catch {
      return null
    }
  }

  function toStatically(u: string): string | null {
    try {
      const url = new URL(u)
      if (url.hostname === 'github.com') {
        const parts = url.pathname.split('/')
        const owner = parts[1]
        const repo = parts[2]
        const rawIdx = parts.indexOf('raw')
        if (owner && repo && rawIdx !== -1 && parts[rawIdx + 1]) {
          const commit = parts[rawIdx + 1]
          const subPath = parts.slice(rawIdx + 2).join('/')
          return `https://cdn.statically.io/gh/${owner}/${repo}/${commit}/${subPath}`
        }
      }
      if (url.hostname === 'raw.githubusercontent.com') {
        const parts = url.pathname.split('/')
        const owner = parts[1]
        const repo = parts[2]
        const commit = parts[3]
        const subPath = parts.slice(4).join('/')
        if (owner && repo && commit && subPath) {
          return `https://cdn.statically.io/gh/${owner}/${repo}/${commit}/${subPath}`
        }
      }
      return null
    } catch {
      return null
    }
  }
  async function fetchLocalJson(url: string): Promise<any | null> {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return null
      const ct = res.headers.get('content-type') || ''
      const text = await res.text()
      const trimmed = text.trim()
      if (trimmed.length === 0) return null
      if (ct.includes('json')) {
        try { return JSON.parse(trimmed) } catch { return null }
      }
      if (trimmed.startsWith('<')) return null
      try { return JSON.parse(trimmed) } catch { return null }
    } catch {
      return null
    }
  }


  return (
    <>
      <div className={`main-panel ${panelExpanded ? 'expanded' : 'collapsed'}`}>
        {/* Panel Header with Toggle */}
        <div className="panel-header">
          <button 
            className="panel-toggle" 
            onClick={() => setPanelExpanded(!panelExpanded)}
            title={panelExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {panelExpanded ? '◀' : '▶'}
          </button>
          {panelExpanded && <h2 className="panel-title">MapCraft</h2>}
          {panelExpanded && (
            <a
              className="github-link"
              href="https://github.com/KristjanESPERANTO/MapCraft"
              target="_blank"
              rel="noopener noreferrer"
              title="Open GitHub repository"
            >
              GitHub
            </a>
          )}
        </div>

        {/* Panel Content */}
        {panelExpanded && (
          <div className="panel-content">
            {/* Country Selection Section */}
            <div className="panel-section">
              <h3 className="section-title">Country selection</h3>
              <div className="section-content">
                {/* Country Search Autocomplete */}
                <CountryAutocomplete
                  onCountrySelect={handleCountrySelect}
                  placeholder="Search country..."
                  className="country-search"
                />

                {/* Selected Countries */}
                {selectedCountries.length > 0 && (
                  <div className="selected-countries">
                    <div className="selected-countries-label">Selected countries:</div>
                    <div className="selected-countries-list">
                      {selectedCountries.map(country => (
                        <div key={country.iso3} className="selected-country-tag">
                          <span className="country-name">{country.name}</span>
                          <span className="country-code">({country.iso3})</span>
                          <button
                            className="remove-country"
                            onClick={() => handleCountryRemove(country)}
                            title={`Remove ${country.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual ISO Input */}
                <div className="manual-input-section">
                  <label htmlFor="iso-input">Or enter ISO3 codes manually:</label>
                  <input
                    id="iso-input"
                    placeholder="ISO3 (e.g. DEU,FRA)"
                    value={isoInput}
                    onChange={e => setIsoInput(e.target.value)}
                  />
                </div>

                <select value={admLevel} onChange={e => setAdmLevel(e.target.value as any)}>
                  <option value="ADM0">ADM0</option>
                  <option value="ADM1">ADM1</option>
                </select>
                <button onClick={handleLoadISO3} disabled={!isoInput.trim()}>Load selection</button>
                {/* Debug ASM button removed */}
                <div className="status">{status}</div>
              </div>
            </div>

            {/* Style Editor Section */}
            <div className="panel-section">
              <h3 className="section-title">Styles</h3>
              <div className="section-content">
                {uniqStyleKeys().length === 0 ? (
                  <div className="empty-state">Country keys will appear here after loading.</div>
                ) : (
                  <>
                    <div className="style-header-row">
                      <div>Country</div>
                      <div>Fill</div>
                      <div>Stroke</div>
                      <div>Width</div>
                    </div>
                    <div className="style-grid">
                      {uniqStyleKeys().map(k => {
                        const st = stylesByKey[k] || {}
                        return (
                          <div key={k} className="style-item">
                            <div className="country-key" title={k}>{k}</div>
                            <input title="Fill color" type="color" value={st.fill || '#5b9bd5'} onChange={e => updateStyle(k, { fill: e.target.value })} />
                            <input title="Stroke color" type="color" value={st.stroke || '#2f5597'} onChange={e => updateStyle(k, { stroke: e.target.value })} />
                            <input title="Stroke width" type="number" min={0} step={0.5} value={st.strokeWidth ?? 1.5} onChange={e => updateStyle(k, { strokeWidth: Number(e.target.value) })} />
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Export Section */}
            <div className="panel-section">
              <h3 className="section-title">Export</h3>
              <div className="section-content">
                <button className="export-button" onClick={handleExportSVG}>Export SVG</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="map" ref={containerRef} />
      <div className="license-notice">
        This app uses data from geoBoundaries (CC-BY 4.0). Please respect the license terms.
      </div>
    </>
  )
}
