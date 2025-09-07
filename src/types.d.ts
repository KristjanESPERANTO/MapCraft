declare module 'd3-geo';
declare module 'geojson2svg' {
	export class GeoJSON2SVG {
		constructor(options?: any)
		convert(geojson: any, options?: any): string[]
	}
}
