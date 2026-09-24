import Link from 'next/link';

export default function FeaturedCollectionsGrid({ collections = [], label = 'Shop by Collection', sublabel = 'Curated storefront edits', showViewAll = true }) {
  if (!collections.length) return null;

  return (
    <>
      <style>{`
        .fcg-header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:48px;border-top:1px solid #1e1c19;padding-top:32px}
        .fcg-eyebrow{font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#4a4540;margin-bottom:8px}
        .fcg-title{font-family:var(--font-headline),sans-serif;font-size:clamp(32px,4vw,46px);font-weight:700;letter-spacing:-0.04em;color:#f2ede4}
        .fcg-link{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03)),rgba(255,255,255,0.04);backdrop-filter:blur(18px) saturate(120%);-webkit-backdrop-filter:blur(18px) saturate(120%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 18px 30px rgba(0,0,0,0.2);font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.88);text-decoration:none;transition:transform 0.2s,border-color 0.2s}
        .fcg-link:hover{transform:translateY(-2px);border-color:rgba(255,255,255,0.2)}
        .fcg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}
        .fcg-card{display:block;text-decoration:none;color:inherit;position:relative;padding:12px;border-radius:24px;border:1px solid rgba(255,255,255,0.1);background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03)),rgba(255,255,255,0.04);backdrop-filter:blur(24px) saturate(125%);-webkit-backdrop-filter:blur(24px) saturate(125%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 28px 56px rgba(0,0,0,0.22);overflow:hidden;transition:transform 0.3s ease,border-color 0.3s ease,box-shadow 0.3s ease}
        .fcg-card:hover{transform:translateY(-6px);border-color:rgba(255,255,255,0.18);box-shadow:inset 0 1px 0 rgba(255,255,255,0.12),0 34px 70px rgba(0,0,0,0.28)}
        .fcg-img{aspect-ratio:3/4;overflow:hidden;border-radius:18px;border:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015)),rgba(7,7,7,0.56);position:relative}
        .fcg-img img{width:100%;height:100%;object-fit:cover;transition:transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)}
        .fcg-card:hover .fcg-img img{transform:scale(1.04)}
        .fcg-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:var(--font-headline),sans-serif;font-size:52px;font-weight:700;color:rgba(255,255,255,0.12)}
        .fcg-body{position:relative;z-index:1;padding:18px 8px 8px}
        .fcg-count{font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.38);margin-bottom:10px}
        .fcg-name{font-family:var(--font-headline),sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#f8f8f8;margin-bottom:16px;line-height:1.2}
        .fcg-meta{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .fcg-desc{font-size:12px;color:rgba(255,255,255,0.44)}
        .fcg-chip{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03)),rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;transition:background 0.2s,border-color 0.2s}
        .fcg-card:hover .fcg-chip{border-color:rgba(255,255,255,0.18)}
      `}</style>

      <div className="fcg-header">
        <div>
          <p className="fcg-eyebrow">{sublabel}</p>
          <h2 className="fcg-title">{label}</h2>
        </div>
        {showViewAll && (
          <Link prefetch={false} className="fcg-link" href="/collections">Browse all</Link>
        )}
      </div>

      <div className="fcg-grid">
        {collections.map(collection => (
          <Link prefetch={false} className="fcg-card" href={`/collections/${collection.handle}`} key={collection.id}>
            <div className="fcg-img">
              {collection.imageUrl ? (
                <img alt={collection.title} src={collection.imageUrl} />
              ) : (
                <div className="fcg-placeholder">✦</div>
              )}
            </div>
            <div className="fcg-body">
              <p className="fcg-count">{collection.productCount} {collection.productCount === 1 ? 'product' : 'products'}</p>
              <h3 className="fcg-name">{collection.title}</h3>
              <div className="fcg-meta">
                <p className="fcg-desc">{collection.description ? collection.description.slice(0, 48) + (collection.description.length > 48 ? '…' : '') : 'Curated edit'}</p>
                <span className="fcg-chip">Explore</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
