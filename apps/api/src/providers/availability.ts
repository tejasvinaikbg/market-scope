/**
 * Which data sources the product can offer right now, from configuration alone. The setup screen reads this to grey
 * an option out instead of letting the server reject the choice; the markets service reads it to refuse anyway, because
 * a request can be made by hand. Every provider has a switch; a Google provider also needs its key configured.
 */
import { config, type Config } from '../config.ts';

export type ProviderKind = 'places' | 'geocoding';
export interface ProviderOption {
  id: 'overpass' | 'nominatim' | 'google';
  name: string;
  enabled: boolean;
  reason: 'not configured' | 'disabled' | null;   // why it is off, in the words the screen shows
}

type ProviderConfig = Pick<Config,
  'OVERPASS_ENABLED' | 'NOMINATIM_ENABLED' |
  'GOOGLE_PLACES_API_KEY' | 'GOOGLE_PLACES_ENABLED' | 'GOOGLE_GEOCODING_API_KEY' | 'GOOGLE_GEOCODING_ENABLED'>;

type State = Pick<ProviderOption, 'enabled' | 'reason'>;
/** An OSM provider has only its switch. */
const osm = (on: boolean): State => (on ? { enabled: true, reason: null } : { enabled: false, reason: 'disabled' });
/** A Google provider needs its key first: without one there is nothing to switch on, whatever the switch says. */
const google = (on: boolean, key: string | undefined): State => (!key ? { enabled: false, reason: 'not configured' } : osm(on));

/** Every provider the product knows, with whether it can be chosen. `c` is a parameter so tests can pass a made-up configuration. */
export function listProviders(c: ProviderConfig = config): Record<ProviderKind, ProviderOption[]> {
  return {
    places: [
      { id: 'overpass', name: 'OSM Overpass', ...osm(c.OVERPASS_ENABLED) },
      { id: 'google', name: 'Google Places API (New)', ...google(c.GOOGLE_PLACES_ENABLED, c.GOOGLE_PLACES_API_KEY) },
    ],
    geocoding: [
      { id: 'nominatim', name: 'OSM Nominatim', ...osm(c.NOMINATIM_ENABLED) },
      { id: 'google', name: 'Google Geocoding API', ...google(c.GOOGLE_GEOCODING_ENABLED, c.GOOGLE_GEOCODING_API_KEY) },
    ],
  };
}

/** Why a provider cannot be used right now — "Google Places API (New) is not configured" — or null when it can. */
export function providerUnavailable(kind: ProviderKind, id: string, c: ProviderConfig = config): string | null {
  const option = listProviders(c)[kind].find((p) => p.id === id);
  if (!option) return `unknown ${kind} provider "${id}"`;
  return option.enabled ? null : `${option.name} is ${option.reason}`;
}