import Link from 'next/link';
import { Component as EtheralShadow } from '@/components/ui/etheral-shadow';
import { getStorefrontProducts } from '@/server/services/product.service';
import { getStorefrontCollectionSummaries } from '@/server/services/collection.service';
import FeaturedCollectionsGrid from '@/components/storefront/FeaturedCollectionsGrid';
import { getStorefrontBadgeText } from '@/lib/storefrontAvailability';

export const metadata = {
  title: 'Doopify - Commerce, Refined',
  description: 'Premium products, delivered.',
};

export default async function LandingPage() {
  let featured = [];
  let featuredCollections = [];

  try {
    const result = await getStorefrontProducts({ pageSize: 3 });
    featured = result.products || [];
  } catch {}

  try {
    const result = await getStorefrontCollectionSummaries();
    featuredCollections = (result || []).slice(0, 3);
  } catch {}

  let store = null;
  try {
    const { getPublicStorefrontSettings } = await import('@/server/services/settings.service');
    store = await getPublicStorefrontSettings();
  } catch {}

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .landing {
          background: #080808;
          color: #f2ede4;
          min-height: 100vh;
          font-family: var(--font-body), sans-serif;
        }

        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 24px 48px;
          background: linear-gradient(to bottom, rgba(8, 8, 8, 0.95), transparent);
        }

        .nav-logo {
          font-family: var(--font-headline), sans-serif;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #f2ede4;
          text-decoration: none;
          text-transform: uppercase;
        }

        .nav-links {
          display: flex;
          gap: 36px;
          list-style: none;
        }

        .nav-links a {
          color: #b8ad9e;
          text-decoration: none;
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          transition: color 0.2s;
        }

        .nav-links a:hover {
          color: #f2ede4;
        }

        .hero {
          min-height: 100vh;
          padding: 120px 48px 80px;
          position: relative;
          overflow: hidden;
        }

        .hero-shader {
          min-height: calc(100vh - 200px);
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.008)),
            rgba(8, 8, 8, 0.94);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 36px 120px rgba(0, 0, 0, 0.68);
        }

        .hero-shader-content {
          max-width: 780px;
          margin: 0 auto;
          text-align: center;
          text-shadow: 0 18px 42px rgba(0, 0, 0, 0.36);
        }

        .hero-title {
          font-family: var(--font-headline), sans-serif;
          font-size: clamp(72px, 11vw, 128px);
          font-weight: 700;
          line-height: 0.9;
          letter-spacing: -0.075em;
          color: #ffffff;
        }

        .hero-title em {
          font-style: normal;
          color: inherit;
        }

        .hero-scroll {
          position: absolute;
          bottom: 92px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.28);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.28), transparent);
        }

        .featured {
          padding: 120px 48px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .section-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 64px;
          border-top: 1px solid #1e1c19;
          padding-top: 32px;
        }

        .section-label {
          font-size: 11px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #4a4540;
        }

        .section-title {
          font-family: var(--font-headline), sans-serif;
          font-size: 46px;
          font-weight: 700;
          letter-spacing: -0.04em;
          color: #f2ede4;
        }

        .section-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 18px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(18px) saturate(120%);
          -webkit-backdrop-filter: blur(18px) saturate(120%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 18px 30px rgba(0, 0, 0, 0.2);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.88);
          text-decoration: none;
          transition: transform 0.2s, border-color 0.2s, background 0.2s;
        }

        .section-link:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.2);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
            rgba(255, 255, 255, 0.06);
        }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .product-card {
          display: block;
          text-decoration: none;
          color: inherit;
          position: relative;
          padding: 12px;
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(24px) saturate(125%);
          -webkit-backdrop-filter: blur(24px) saturate(125%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 28px 56px rgba(0, 0, 0, 0.22);
          overflow: hidden;
          transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .product-card:hover .card-img-inner {
          transform: scale(1.03);
        }

        .product-card:hover {
          transform: translateY(-6px);
          border-color: rgba(255, 255, 255, 0.18);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            0 34px 70px rgba(0, 0, 0, 0.28);
        }

        .product-card::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.16), transparent 26%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 24%);
          opacity: 0.8;
        }

        .card-img {
          aspect-ratio: 3 / 4;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.015)),
            rgba(7, 7, 7, 0.56);
          position: relative;
        }

        .card-img-inner {
          width: 100%;
          height: 100%;
          transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .card-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #2a2820;
        }

        .placeholder-icon {
          font-size: 48px;
          opacity: 0.4;
        }

        .card-body {
          position: relative;
          z-index: 1;
          padding: 18px 8px 8px;
        }

        .card-vendor {
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.38);
          margin-bottom: 10px;
        }

        .card-title {
          font-family: var(--font-headline), sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: #f8f8f8;
          margin-bottom: 16px;
          line-height: 1.2;
        }

        .card-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .card-price {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.92);
        }

        .card-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
            rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.82);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: background 0.2s, border-color 0.2s;
        }

        .product-card:hover .card-chip {
          border-color: rgba(255, 255, 255, 0.18);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
            rgba(255, 255, 255, 0.06);
        }

        .strip {
          border-top: 1px solid #1e1c19;
          border-bottom: 1px solid #1e1c19;
          padding: 20px 0;
          overflow: hidden;
          margin: 0 48px 120px;
        }

        .strip-inner {
          display: flex;
          gap: 48px;
          animation: marquee 20s linear infinite;
          width: max-content;
        }

        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        .strip-item {
          font-size: 11px;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #2e2b26;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .strip-dot {
          width: 3px;
          height: 3px;
          background: #c9a86c;
          border-radius: 50%;
        }

        .footer {
          border-top: 1px solid #1e1c19;
          padding: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .footer-links {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .footer-links a {
          color: #6f695f;
          text-decoration: none;
        }

        .footer-links a:hover {
          color: #b8ad9e;
        }

        .footer-brand {
          font-family: var(--font-headline), sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #2e2b26;
        }

        .footer-copy {
          font-size: 12px;
          color: #2e2b26;
          font-weight: 300;
        }

        @media (max-width: 900px) {
          .nav {
            padding: 20px 24px;
          }

          .hero {
            padding: 100px 24px 80px;
          }

          .hero-shader {
            min-height: calc(100vh - 180px);
            border-radius: 20px;
          }

          .featured {
            padding: 80px 24px;
          }

          .product-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .strip {
            margin: 0 24px 80px;
          }

          .footer {
            padding: 32px 24px;
            flex-direction: column;
            gap: 16px;
            text-align: center;
          }
        }

        @media (max-width: 600px) {
          .product-grid {
            grid-template-columns: 1fr;
          }

          .section-header {
            flex-direction: column;
            gap: 16px;
          }
        }
      `}</style>

      <div className="landing">
        <nav className="nav">
          <Link className="nav-logo" href="/">{store?.name || 'Doopify'}</Link>
          <ul className="nav-links">
            <li><Link href="/shop">Shop</Link></li>
            <li><Link href="/collections">Collections</Link></li>
            <li><Link href="/shop">About</Link></li>
          </ul>
        </nav>

        <section className="hero">
          <EtheralShadow
            animation={{ scale: 100, speed: 90 }}
            className="hero-shader"
            color="rgba(154, 154, 154, 1)"
            noise={{ opacity: 1, scale: 1.2 }}
            style={{ minHeight: 'calc(100vh - 200px)' }}
            type="custom"
          >
            <div className="hero-shader-content">
              <h1 className="hero-title">
                Commerce
                <br />
                <em>Refined</em>
              </h1>
            </div>
          </EtheralShadow>

          <div className="hero-scroll">
            <div className="scroll-line" />
            Scroll
          </div>
        </section>

        <div className="strip">
          <div className="strip-inner">
            {[...Array(8)].map((_, i) => (
              <span className="strip-item" key={i}>
                Free shipping over $100
                <span className="strip-dot" />
                Premium materials
                <span className="strip-dot" />
                30-day returns
                <span className="strip-dot" />
                Worldwide delivery
                <span className="strip-dot" />
              </span>
            ))}
          </div>
        </div>

        <section className="featured">
          {featuredCollections.length ? (
            <div style={{ marginBottom: 80 }}>
              <FeaturedCollectionsGrid
                collections={featuredCollections}
                label="Shop by Collection"
                sublabel="Merchandising"
              />
            </div>
          ) : null}

          <div className="section-header">
            <div>
              <p className="section-label">Handpicked for you</p>
              <h2 className="section-title">Featured Products</h2>
            </div>
            <Link className="section-link" href="/shop">View all</Link>
          </div>

          <div className="product-grid">
            {featured.map(product => {
              const image = product.media?.[0]?.url;
              const price = product.variants?.[0]?.price;
              const badgeLabel = getStorefrontBadgeText(product);

              return (
                <Link className="product-card" href={`/shop/${product.handle}`} key={product.id}>
                  <div className="card-img">
                    <div className="card-img-inner">
                      {image ? (
                        <img alt={product.title} src={image} />
                      ) : (
                        <div className="card-placeholder">
                          <span className="placeholder-icon">[]</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card-body">
                    {product.vendor ? <p className="card-vendor">{product.vendor}</p> : null}
                    <h3 className="card-title">{product.title}</h3>
                    <div className="card-meta">
                      {price != null ? (
                        <p className="card-price">${Number(price).toFixed(2)}</p>
                      ) : <span />}
                      <span className="card-chip">{badgeLabel || 'View Product'}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <footer className="footer">
          <span className="footer-brand">{store?.name || 'Doopify'}</span>
          <span className="footer-copy">&copy; 2026 {store?.name || 'Doopify'}. All rights reserved.</span>
          <span className="footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </span>
        </footer>
      </div>
    </>
  );
}
