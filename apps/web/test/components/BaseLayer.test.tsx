/** The map's ground: OpenStreetMap tiles without a key; with one, Google's loader is configured once, the maps library imported, and the mutant layer added and removed with the component. */
import { render, waitFor } from '@testing-library/react';
import { BaseLayer } from '@/components/BaseLayer';

const fakeMap = { id: 'map' };
jest.mock('react-leaflet', () => ({ TileLayer: (p: { url: string }) => <div data-testid="osm" data-url={p.url} />, useMap: () => fakeMap }));
const setOptions = jest.fn(),
  importLibrary = jest.fn((_name: string) => Promise.resolve({}));
jest.mock('@googlemaps/js-api-loader', () => ({ __esModule: true, setOptions: (o: unknown) => setOptions(o), importLibrary: (n: string) => importLibrary(n) }));
const remove = jest.fn(),
  addTo = jest.fn((_map: unknown) => ({ remove })),
  googleMutant = jest.fn((_options: unknown) => ({ addTo }));
jest.mock(
  'leaflet.gridlayer.googlemutant/src/Leaflet.GoogleMutant.mjs',
  () => ({
    __esModule: true, // so the component's `import()` sees the class as the default export, as the real module has it
    default: class {
      constructor(options: unknown) {
        googleMutant(options);
      }
      addTo(map: unknown) {
        return addTo(map);
      }
    },
  }),
  { virtual: true },
);

test('without a key the ground is OpenStreetMap', () => {
  const { getByTestId } = render(<BaseLayer googleKey="" />);
  expect(getByTestId('osm')).toHaveAttribute('data-url', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  expect(setOptions).not.toHaveBeenCalled();
});

test('with a key the Google map is loaded once, added to the map, and removed when the ground leaves', async () => {
  const { queryByTestId, unmount } = render(<BaseLayer googleKey="browser-key" />);
  expect(queryByTestId('osm')).toBeNull();
  await waitFor(() => expect(addTo).toHaveBeenCalledWith(fakeMap));
  expect(setOptions).toHaveBeenCalledWith({ key: 'browser-key', v: 'weekly' });
  expect(importLibrary).toHaveBeenCalledWith('maps');
  expect(googleMutant).toHaveBeenCalledWith({ type: 'roadmap' });
  unmount();
  expect(remove).toHaveBeenCalledTimes(1);
  render(<BaseLayer googleKey="browser-key" />); // a second map on the page
  await waitFor(() => expect(addTo).toHaveBeenCalledTimes(2));
  expect(setOptions).toHaveBeenCalledTimes(1); // the loader takes its options once
});
