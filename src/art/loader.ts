import { parseManifest, readPlateSvg, type PlateArt } from './plates.ts';

/**
 * Load every plate listed in public/plates/plates.json. New art dropped into
 * public/plates/ and listed in the manifest appears without code changes.
 * A plate whose file is missing or unreadable is skipped with a warning.
 */
export async function loadPlates(base: string = import.meta.env.BASE_URL): Promise<PlateArt[]> {
  const dir = `${base}plates/`;
  const res = await fetch(`${dir}plates.json`);
  if (!res.ok) throw new Error(`plates.json: HTTP ${res.status}`);
  const entries = parseManifest(await res.json());

  const results = await Promise.allSettled(
    entries.map(async (entry) => {
      const r = await fetch(dir + entry.file);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return readPlateSvg(entry, await r.text());
    }),
  );

  const plates: PlateArt[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') plates.push(result.value);
    else console.warn(`Vivi Fashion Dresses: skipping plate "${entries[i]!.id}": ${String(result.reason)}`);
  });
  return plates;
}
