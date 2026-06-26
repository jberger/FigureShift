import { TwdbClient, type Brand } from '@joelberger/twdb-client';

let brandCache: Brand[] | null = null;
const modelCache = new Map<string, string[]>(); // brandId -> create-form model names

// TWDB brands for make inference. Cached per session (be a good citizen: fetch once).
export async function getBrands(client: TwdbClient): Promise<Brand[]> {
  if (!brandCache) brandCache = await client.listBrands();
  return brandCache;
}

// A brand's model names (create-form). Cached per brand id so a big library scan stays polite.
export async function getCreateModels(client: TwdbClient, brandId: string): Promise<string[]> {
  let models = modelCache.get(brandId);
  if (!models) {
    models = await client.listCreateModels(brandId);
    modelCache.set(brandId, models);
  }
  return models;
}
