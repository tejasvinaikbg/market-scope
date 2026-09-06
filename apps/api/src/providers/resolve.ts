/**
 * One rule for every kind of provider a market can choose: under the fixture mode every market gets the fixture, whatever
 * it chose; live, the one it chose; and a plain error, in the caller's words, when that one has no key. Discovery and
 * address lookup each build one of these from the providers they have (providers/index.ts).
 */
export type Resolver<Choice extends string, Provider> = (choice: Choice) => Provider;

export function createResolver<Choice extends string, Provider>(
  mode: 'live' | 'fixture',
  live: Record<Choice, Provider | null>,
  fixture: Provider,
  missing: (choice: Choice) => string,
): Resolver<Choice, Provider> {
  return (choice) => {
    if (mode === 'fixture') return fixture;
    const provider = live[choice];
    if (!provider) throw new Error(missing(choice));
    return provider;
  };
}
