import Link from 'next/link';
import Image from 'next/image';
import CatalogPagination from '@/components/storefront/CatalogPagination';

import { getStorefrontCollectionSummaries } from '@/server/services/collection.service';

export const metadata = {
  title: 'Collections - Doopify',
  description: 'Browse curated product collections built in Doopify.',
};

export default async function CollectionsPage({ searchParams }) {
  let collections = [];
  let pagination;
  const query = await searchParams;

  try {
    ({ collections, pagination } = await getStorefrontCollectionSummaries({ page: Number(query?.page) }));
  } catch (error) {
    console.error('[CollectionsPage]', error);
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .collections-page { min-height: 100vh; background: #080808; color: #f2ede4; font-family: var(--font-body), sans-serif; }
        .nav { display: flex; align-items: center; justify-content: space-between; padding: 24px 48px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .nav-logo { font-family: var(--font-headline), sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #f2ede4; text-decoration: none; }
        .nav-links { display: flex; align-items: center; gap: 28px; }
        .nav-link { color: #6a6058; text-decoration: none; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
        .hero { padding: 64px 48px 36px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .eyebrow { font-size: 11px; letter-spacing: 0.28em; text-transform: uppercase; color: #4a4540; margin-bottom: 12px; }
        .title { font-family: var(--font-headline), sans-serif; font-size: clamp(42px, 6vw, 78px); line-height: 0.98; letter-spacing: -0.05em; margin-bottom: 16px; }
        .description { max-width: 720px; color: #a79a8d; line-height: 1.75; font-size: 15px; }
        .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; padding: 32px 48px 80px; }
        .card { display: block; text-decoration: none; color: inherit; border-radius: 24px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)), rgba(255,255,255,0.04); transition: transform 0.28s ease, border-color 0.28s ease; }
        .card:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.18); }
        .card-image { aspect-ratio: 4 / 3; background: rgba(255,255,255,0.04); overflow: hidden; }
        .card-image img { width: 100%; height: 100%; object-fit: cover; }
        .placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.14); font-family: var(--font-headline), sans-serif; font-size: 52px; }
        .card-body { padding: 20px; }
        .card-count { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.38); margin-bottom: 12px; }
        .card-title { font-family: var(--font-headline), sans-serif; font-size: 26px; line-height: 1.1; margin-bottom: 12px; }
        .card-description { color: #a79a8d; line-height: 1.7; font-size: 14px; margin-bottom: 18px; }
        .card-link { display: inline-flex; align-items: center; gap: 10px; color: #f2ede4; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; }
        .empty { padding: 80px 48px; color: #a79a8d; }
        @media (max-width: 980px) {
          .nav, .hero, .grid, .empty { padding-left: 24px; padding-right: 24px; }
          .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .grid { grid-template-columns: 1fr; }
          .nav-links { gap: 16px; }
        }
      `}</style>

      <div className="collections-page">
        <nav className="nav">
          <Link className="nav-logo" href="/">Doopify</Link>
          <div className="nav-links">
            <Link className="nav-link" href="/shop">Shop</Link>
            <Link className="nav-link" href="/checkout">Checkout</Link>
          </div>
        </nav>

        <header className="hero">
          <p className="eyebrow">Merchandising</p>
          <h1 className="title">Browse Collections</h1>
          <p className="description">
            Explore curated groupings that turn the storefront from a product list into a more intentional shopping experience.
          </p>
        </header>

        {collections.length ? (
          <div className="grid">
            {collections.map((collection) => (
              <Link className="card" href={`/collections/${collection.handle}`} key={collection.id}>
                <div className="card-image">
                  {collection.imageUrl ? (
                    <Image alt={collection.title} src={collection.imageUrl} width={800} height={600} sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw" unoptimized={!collection.imageUrl.startsWith('/')} />
                  ) : (
                    <div className="placeholder">✦</div>
                  )}
                </div>
                <div className="card-body">
                  <p className="card-count">{collection.productCount} products</p>
                  <h2 className="card-title">{collection.title}</h2>
                  <p className="card-description">
                    {collection.description || 'Open the collection to explore curated products and merchandising intent.'}
                  </p>
                  <span className="card-link">Explore collection</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-headline), sans-serif', fontSize: 42, fontWeight: 700, letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.1)', marginBottom: 20 }}>✦</p>
            <p style={{ fontSize: 15, color: '#a79a8d', marginBottom: 8 }}>No collections are live yet.</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.36)', marginBottom: 28, lineHeight: 1.7 }}>
              Collections group products into curated storefront edits.<br />Create one in the admin and assign products to make this page live.
            </p>
            <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', color: '#f2ede4', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>
              Browse all products
            </Link>
          </div>
        )}
        <CatalogPagination pagination={pagination} pathname="/collections" />
      </div>
    </>
  );
}
