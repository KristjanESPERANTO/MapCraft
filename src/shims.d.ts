declare module '@mapbox/mapbox-gl-draw' {
  const MapboxDraw: any
  export default MapboxDraw
}

declare module 'geojson' {
  export type Geometry = any
  export type FeatureCollection<G extends Geometry = Geometry> = {
    type: 'FeatureCollection'
    features: any[]
  }
}
