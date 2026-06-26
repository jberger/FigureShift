import { TwdbClient } from '@joelberger/twdb-client';

let cache: string[] | null = null;

// Brand names for path inference. Cached per session (be a good citizen: fetch once).
export async function getBrandNames(client: TwdbClient): Promise<string[]> {
  if (cache) return cache;
  const brands = await client.listBrands();
  cache = brands.map((b) => b.name);
  return cache;
}
