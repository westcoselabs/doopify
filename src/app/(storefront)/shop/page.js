import ShopView from './ShopView';
import { getStorefrontProducts } from '@/server/services/product.service';
import { getStorefrontCollectionSummaries } from '@/server/services/collection.service';

export default async function ShopPage({ searchParams }) {
  const query = await searchParams;
  const search = String(query?.search || '').trim().slice(0, 200);
  const [catalog, collections] = await Promise.all([
    getStorefrontProducts({ page: Number(query?.page), pageSize: 24, search }),
    getStorefrontCollectionSummaries({ pageSize: 24 }),
  ]);
  return <ShopView products={catalog.products} pagination={catalog.pagination} collections={collections.collections} search={search} />;
}
