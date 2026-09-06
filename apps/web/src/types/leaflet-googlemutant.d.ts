/**
 * The GoogleMutant layer's ES module source, imported by path: the package's "browser" field points bundlers at a UMD
 * build that registers itself on a global Leaflet, which a bundled app does not have. The source exports the class; the
 * Next config aliases `leaflet` so the source and react-leaflet share one copy.
 */
declare module 'leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs' {
  import type { GridLayer, GridLayerOptions } from 'leaflet';
  export interface GoogleMutantOptions extends GridLayerOptions {
    type?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  }
  export default class GoogleMutant extends GridLayer {
    constructor(options?: GoogleMutantOptions);
  }
}
