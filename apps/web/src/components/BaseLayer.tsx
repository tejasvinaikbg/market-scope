/**
 * The map's ground: OpenStreetMap tiles, or a Google road map when the browser key is set. Everything drawn on top —
 * boundary, pins, lines, the picked ring — is Leaflet either way, so the two grounds are interchangeable and the map
 * palette (light in both themes) holds for both. The Google map is loaded on demand with Google's own loader and shown
 * through Leaflet by the GoogleMutant layer, which is the way Google's terms allow its map under Leaflet.
 */
'use client';

import { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';

/** Inlined by Next at build time; blank means the OpenStreetMap ground. */
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export function BaseLayer({ googleKey = GOOGLE_MAPS_KEY }: { googleKey?: string }) {
  if (googleKey) return <GoogleGround apiKey={googleKey} />;
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
  );
}

/** Google's loader accepts its options once per page; the second map on a page must not repeat them. */
let loaderConfigured = false;

/** Adds the Google ground to the map it sits in, and takes it away again when it leaves. */
function GoogleGround({ apiKey }: { apiKey: string }) {
  const map = useMap();
  useEffect(() => {
    let layer: { remove(): void } | undefined;
    let gone = false;
    (async () => {
      const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');
      if (!loaderConfigured) {
        setOptions({ key: apiKey, v: 'weekly' });
        loaderConfigured = true;
      }
      await importLibrary('maps'); // google.maps must exist before the mutant is constructed
      (window as unknown as { L?: unknown }).L ??= await import('leaflet'); // the mutant's last line registers a factory on a global Leaflet; the ES build sets none
      const { default: Mutant } = await import('leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs'); // the ES source: see src/types
      if (gone) return;
      layer = new Mutant({ type: 'roadmap' }).addTo(map);
    })().catch((err) => console.error('Google map failed to load; the map stays without a ground', err));
    return () => {
      gone = true;
      layer?.remove();
    };
  }, [map, apiKey]);
  return null;
}
