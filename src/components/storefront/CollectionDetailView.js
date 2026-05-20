"use client";

import Link from 'next/link';
import { useState } from 'react';

import { useCart } from '@/context/CartContext';
import CartDrawer from '@/components/storefront/CartDrawer';
import {
  getProductPrimaryVariant,
  getStorefrontBadgeText,
  isVariantPurchasable,
} from '@/lib/storefrontAvailability';

const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .collection-root {
    min-height: 100vh;
    background: #080808;
    color: #f2ede4;
    font-family: var(--font-body), sans-serif;
  }

  .collection-nav {
    position: sticky;
    top: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 48px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(8, 8, 8, 0.78);
    backdrop-filter: blur(20px) saturate(120%);
    -webkit-backdrop-filter: blur(20px) saturate(120%);
  }

  .nav-logo {
    font-family: var(--font-headline), sans-serif;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f2ede4;
    text-decoration: none;
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .nav-link {
    color: #6a6058;
    text-decoration: none;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: color 0.2s;
  }

  .nav-link:hover {
    color: #f2ede4;
  }

  .cart-btn {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03)),
      rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    color: #f5f5f5;
    padding: 10px 18px;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s, transform 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cart-btn:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .cart-count {
    background: #f5f5f5;
    color: #080808;
    font-size: 10px;
    font-weight: 700;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero {
    padding: 56px 48px 32px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #4a4540;
    margin-bottom: 12px;
  }

  .title {
    font-family: var(--font-headline), sans-serif;
    font-size: clamp(40px, 6vw, 68px);
    line-height: 0.98;
    letter-spacing: -0.05em;
    margin-bottom: 16px;
  }

  .description {
    max-width: 700px;
    color: #a79a8d;
    line-height: 1.75;
    font-size: 15px;
  }

  .hero-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 24px;
    color: #6a6058;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .collection-switcher {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 20px 48px 0;
    scrollbar-width: none;
  }

  .collection-switcher::-webkit-scrollbar { display: none; }

  .collection-chip {
    flex-shrink: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.82);
    text-decoration: none;
    padding: 10px 16px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.04);
    transition: border-color 0.2s, transform 0.2s;
  }

  .collection-chip:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    padding: 32px 48px 80px;
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
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 28px 56px rgba(0, 0, 0, 0.22);
    overflow: hidden;
    transition: transform 0.3s ease, border-color 0.3s ease;
  }

  .product-card:hover {
    transform: translateY(-4px);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .product-image {
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.04);
    position: relative;
  }

  .product-badge {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 10, 14, 0.82);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #f2ede4;
    z-index: 2;
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-headline), sans-serif;
    font-size: 48px;
    color: rgba(255, 255, 255, 0.14);
  }

  .card-actions {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
  }

  .add-btn {
    width: 100%;
    min-height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
      rgba(255, 255, 255, 0.06);
    color: #ffffff;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .add-btn:disabled {
    opacity: 0.72;
    cursor: not-allowed;
  }

  .add-btn.added {
    background:
      linear-gradient(180deg, rgba(90, 195, 125, 0.28), rgba(90, 195, 125, 0.18)),
      rgba(90, 195, 125, 0.16);
    border-color: rgba(90, 195, 125, 0.4);
  }

  .card-body {
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
    font-size: 22px;
    line-height: 1.2;
    margin-bottom: 16px;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .card-price {
    color: rgba(255, 255, 255, 0.92);
  }

  .card-compare {
    color: rgba(255, 255, 255, 0.32);
    text-decoration: line-through;
    font-size: 12px;
  }

  .empty {
    padding: 80px 48px;
    text-align: center;
    color: #9a9088;
  }

  @media (max-width: 980px) {
    .collection-nav,
    .hero,
    .collection-switcher,
    .grid,
    .empty {
      padding-left: 24px;
      padding-right: 24px;
    }

    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .nav-right {
      gap: 16px;
    }
  }
`;

export default function CollectionDetailView({ collection, peerCollections = [] }) {
  const { addItem, count, openCart } = useCart();
  const [added, setAdded] = useState({});

  function handleAddToCart(event, product) {
    event.preventDefault();

    const variant = getProductPrimaryVariant(product);
    if (!variant || !isVariantPurchasable(product, variant, 1)) return;

    const variantTitle =
      variant.title && !['Default', 'Default Title'].includes(variant.title) ? variant.title : undefined;

    addItem({
      variantId: variant.id,
      productId: product.id,
      title: product.title,
      variantTitle,
      price: variant.price,
      image: product.media?.[0]?.url || null,
    });

    setAdded((current) => ({ ...current, [product.id]: true }));
    window.setTimeout(() => {
      setAdded((current) => ({ ...current, [product.id]: false }));
    }, 1800);
  }

  return (
    <>
      <style>{styles}</style>
      <CartDrawer />

      <div className="collection-root">
        <nav className="collection-nav">
          <Link className="nav-logo" href="/">Doopify</Link>
          <div className="nav-right">
            <Link className="nav-link" href="/shop">Shop</Link>
            <Link className="nav-link" href="/collections">Collections</Link>
            <button className="cart-btn" onClick={openCart} type="button">
              Bag
              {count > 0 ? <span className="cart-count">{count}</span> : null}
            </button>
          </div>
        </nav>

        <header className="hero">
          <p className="eyebrow">Collection</p>
          <h1 className="title">{collection.title}</h1>
          <p className="description">
            {collection.description || 'A curated set of products designed to make merchandising feel intentional.'}
          </p>
          <div className="hero-meta">
            <span>{collection.productCount} products</span>
            <span>{collection.sortOrder.replace('_', ' ')}</span>
          </div>
        </header>

        {peerCollections.length ? (
          <div className="collection-switcher">
            {peerCollections.map((item) => (
              <Link className="collection-chip" href={`/collections/${item.handle}`} key={item.id}>
                {item.title}
              </Link>
            ))}
          </div>
        ) : null}

        {collection.products.length ? (
          <div className="grid">
            {collection.products.map((product) => {
              const variant = getProductPrimaryVariant(product);
              const isPurchasable = isVariantPurchasable(product, variant, 1);
              const badgeLabel = getStorefrontBadgeText(product);
              const image = product.media?.[0]?.url;
              const isAdded = added[product.id];

              return (
                <Link className="product-card" href={`/shop/${product.handle}`} key={product.id}>
                  <div className="product-image">
                    {image ? (
                      <img alt={product.title} src={image} />
                    ) : (
                      <div className="placeholder">✦</div>
                    )}
                    {badgeLabel ? <span className="product-badge">{badgeLabel}</span> : null}
                    <div className="card-actions">
                      <button
                        className={`add-btn${isAdded ? ' added' : ''}`}
                        disabled={!isPurchasable}
                        onClick={(event) => handleAddToCart(event, product)}
                        type="button"
                      >
                        {isAdded ? 'Added' : isPurchasable ? 'Add to Bag' : 'Unavailable'}
                      </button>
                    </div>
                  </div>

                  <div className="card-body">
                    {product.vendor ? <p className="card-vendor">{product.vendor}</p> : null}
                    <h2 className="card-title">{product.title}</h2>
                    <div className="card-footer">
                      <span className="card-price">
                        {variant ? `$${Number(variant.price).toFixed(2)}` : 'Unavailable'}
                      </span>
                      {variant?.compareAtPrice && Number(variant.compareAtPrice) > Number(variant.price) ? (
                        <span className="card-compare">${Number(variant.compareAtPrice).toFixed(2)}</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ padding: '80px 48px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-headline), sans-serif', fontSize: 52, fontWeight: 700, letterSpacing: '-0.05em', color: 'rgba(255,255,255,0.08)', marginBottom: 20 }}>✦</p>
            <p style={{ fontSize: 16, color: '#a79a8d', marginBottom: 8 }}>This collection is empty.</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.36)', marginBottom: 28, lineHeight: 1.7 }}>
              Products haven&apos;t been assigned here yet.<br />Use the admin collection workspace to add products.
            </p>
            <Link href="/shop" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 20px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', color: '#f2ede4', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none' }}>
              Browse all products
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
