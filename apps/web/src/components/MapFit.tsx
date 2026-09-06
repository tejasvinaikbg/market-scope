'use client';
/**
 * What both maps share: Leaflet's bounds shape from ours, and the camera fit. The fit waits until the container has a
 * width — a map loaded on demand can mount at zero pixels — and is keyed on the values, so a refetch with equal bounds
 * does not move the camera.
 */
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { Bbox } from '@market-scope/shared';

export const toBounds = (b: Bbox): [[number, number], [number, number]] => [[b.south, b.west], [b.north, b.east]];

export function Fit({ bbox }: { bbox: Bbox | null }) {
  const map = useMap();
  const key = bbox ? `${bbox.south},${bbox.west},${bbox.north},${bbox.east}` : '';
  useEffect(() => {
    if (!bbox) return;
    const el = map.getContainer();
    const fit = () => { map.invalidateSize(); map.fitBounds(toBounds(bbox), { padding: [24, 24] }); };
    if (el.clientWidth > 0) { fit(); return; }
    const ro = new ResizeObserver(() => { if (el.clientWidth > 0) { fit(); ro.disconnect(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}