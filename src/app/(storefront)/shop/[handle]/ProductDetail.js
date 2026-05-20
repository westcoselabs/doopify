"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import CartDrawer from '@/components/storefront/CartDrawer';
import {
  getStorefrontBadgeText,
  isComingSoonProduct,
  isVariantPurchasable,
} from '@/lib/storefrontAvailability';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .pd-root {
    min-height: 100vh;
    background: #080808;
    color: #f2ede4;
    font-family: 'DM Sans', sans-serif;
  }

  /* ── Nav ── */
  .pd-nav {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 48px;
    height: 68px;
    background: rgba(8,8,8,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid #1a1916;
  }
  .pd-nav-logo {
    font-family: 'Cormorant Garamond', serif;
    font-size: 22px;
    font-weight: 400;
    letter-spacing: 0.08em;
    color: #f2ede4;
    text-decoration: none;
  }
  .pd-nav-right { display: flex; align-items: center; gap: 32px; }
  .pd-nav-link {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6a6058;
    text-decoration: none;
    transition: color 0.2s;
  }
  .pd-nav-link:hover { color: #f2ede4; }
  .pd-cart-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: 1px solid #2a2720;
    padding: 8px 16px;
    color: #f2ede4;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .pd-cart-btn:hover { border-color: #c9a86c; color: #c9a86c; }

  /* ── Breadcrumb ── */
  .pd-breadcrumb {
    padding: 24px 48px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    letter-spacing: 0.08em;
    color: #3a3830;
  }
  .pd-breadcrumb a { color: #3a3830; text-decoration: none; transition: color 0.2s; }
  .pd-breadcrumb a:hover { color: #6a6058; }
  .pd-breadcrumb-sep { color: #2a2720; }
  .pd-breadcrumb-current { color: #6a6058; }

  /* ── Layout ── */
  .pd-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px 48px 80px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .pd-layout { grid-template-columns: 1fr; padding: 24px 24px 60px; }
    .pd-nav { padding: 0 24px; }
    .pd-breadcrumb { padding: 16px 24px 0; }
  }

  /* ── Gallery ── */
  .pd-gallery { position: sticky; top: 88px; }
  .pd-main-image {
    width: 100%;
    aspect-ratio: 3/4;
    background: #0f0e0c;
    overflow: hidden;
    margin-bottom: 12px;
    position: relative;
  }
  .pd-main-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94);
  }
  .pd-main-image:hover img { transform: scale(1.03); }
  .pd-no-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1e1c19;
    font-family: 'Cormorant Garamond', serif;
    font-size: 64px;
    font-weight: 300;
  }
  .pd-image-badge {
    position: absolute;
    top: 20px;
    left: 20px;
    background: #c9a86c;
    color: #080808;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding: 4px 10px;
  }
  .pd-thumbs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pd-thumbs::-webkit-scrollbar { display: none; }
  .pd-thumb {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    background: #0f0e0c;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }
  .pd-thumb.active { border-color: #c9a86c; }
  .pd-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .pd-thumb-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #1e1c19;
    font-size: 18px;
  }

  /* ── Info Panel ── */
  .pd-info {
    padding-left: 64px;
    padding-top: 8px;
  }
  @media (max-width: 900px) {
    .pd-info { padding-left: 0; padding-top: 32px; }
  }

  .pd-vendor {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #c9a86c;
    margin-bottom: 12px;
  }
  .pd-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(32px, 4vw, 52px);
    font-weight: 400;
    line-height: 1.1;
    color: #f2ede4;
    margin-bottom: 20px;
  }
  .pd-price-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 28px;
  }
  .pd-price {
    font-family: 'Cormorant Garamond', serif;
    font-size: 36px;
    font-weight: 400;
    color: #f2ede4;
  }
  .pd-price-compare {
    font-size: 18px;
    color: #3a3830;
    text-decoration: line-through;
  }
  .pd-divider {
    height: 1px;
    background: #1a1916;
    margin-bottom: 28px;
  }

  /* ── Options ── */
  .pd-option { margin-bottom: 24px; }
  .pd-option-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6a6058;
    margin-bottom: 10px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .pd-option-selected {
    font-weight: 400;
    letter-spacing: 0.05em;
    color: #f2ede4;
    text-transform: none;
  }
  .pd-option-values { display: flex; flex-wrap: wrap; gap: 8px; }
  .pd-opt-btn {
    padding: 8px 16px;
    background: none;
    border: 1px solid #2a2720;
    color: #6a6058;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
    position: relative;
  }
  .pd-opt-btn:hover:not(:disabled) { border-color: #4a4540; color: #f2ede4; }
  .pd-opt-btn.selected { border-color: #c9a86c; color: #f2ede4; background: rgba(201,168,108,0.06); }
  .pd-opt-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    text-decoration: line-through;
  }

  /* ── Quantity ── */
  .pd-qty-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  .pd-qty-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6a6058;
    min-width: 70px;
  }
  .pd-qty-ctrl { display: flex; align-items: center; border: 1px solid #2a2720; }
  .pd-qty-btn {
    width: 40px;
    height: 40px;
    background: none;
    border: none;
    color: #6a6058;
    font-size: 18px;
    cursor: pointer;
    transition: color 0.2s, background 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pd-qty-btn:hover { background: #1a1916; color: #f2ede4; }
  .pd-qty-val {
    width: 48px;
    text-align: center;
    font-size: 15px;
    color: #f2ede4;
    border-left: 1px solid #2a2720;
    border-right: 1px solid #2a2720;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── CTA ── */
  .pd-cta-stack { display: flex; flex-direction: column; gap: 12px; margin-bottom: 32px; }
  .pd-add-btn {
    width: 100%;
    padding: 18px 24px;
    background: #c9a86c;
    border: none;
    color: #080808;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    position: relative;
    overflow: hidden;
  }
  .pd-add-btn:hover:not(:disabled) { background: #dbb97e; }
  .pd-add-btn:active:not(:disabled) { transform: scale(0.99); }
  .pd-add-btn:disabled { background: #2a2720; color: #4a4540; cursor: not-allowed; }
  .pd-add-btn.added { background: #1e3a1a; color: #6abf5e; }

  .pd-buy-btn {
    width: 100%;
    padding: 18px 24px;
    background: none;
    border: 1px solid #2a2720;
    color: #f2ede4;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .pd-buy-btn:hover { border-color: #6a6058; }
  .pd-buy-btn:disabled {
    color: #4a4540;
    border-color: #23211d;
    cursor: not-allowed;
  }

  /* ── Stock ── */
  .pd-stock {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #6a6058;
    margin-bottom: 28px;
    letter-spacing: 0.05em;
  }
  .pd-stock-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .pd-stock-dot.in { background: #4a8c44; }
  .pd-stock-dot.low { background: #c9a86c; }
  .pd-stock-dot.out { background: #8c4444; }

  /* ── Description ── */
  .pd-desc-section { padding-top: 24px; border-top: 1px solid #1a1916; }
  .pd-desc-toggle {
    width: 100%;
    background: none;
    border: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    color: #f2ede4;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    cursor: pointer;
    border-bottom: 1px solid #1a1916;
  }
  .pd-desc-toggle:last-child { border-bottom: none; }
  .pd-desc-icon { font-size: 20px; color: #6a6058; transition: transform 0.3s; }
  .pd-desc-icon.open { transform: rotate(45deg); }
  .pd-desc-body {
    overflow: hidden;
    max-height: 0;
    transition: max-height 0.4s cubic-bezier(0.25,0.46,0.45,0.94);
  }
  .pd-desc-body.open { max-height: 600px; }
  .pd-desc-text {
    padding: 16px 0 24px;
    font-size: 14px;
    line-height: 1.75;
    color: #9a9088;
  }
  .pd-meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 24px;
    padding: 16px 0 24px;
    font-size: 13px;
  }
  .pd-meta-key { color: #4a4540; letter-spacing: 0.05em; }
  .pd-meta-val { color: #9a9088; }

  /* ── Back link ── */
  .pd-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #3a3830;
    text-decoration: none;
    margin-bottom: 0;
    transition: color 0.2s;
  }
  .pd-back:hover { color: #c9a86c; }

  /* ── Toast ── */
  .pd-toast {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: #1a1916;
    border: 1px solid #2a2720;
    color: #f2ede4;
    padding: 14px 28px;
    font-size: 13px;
    letter-spacing: 0.05em;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s, transform 0.3s;
    z-index: 999;
    white-space: nowrap;
  }
  .pd-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .pd-toast-gold { color: #c9a86c; }
`;

export default function ProductDetail({ product }) {
  const router = useRouter();
  const { addItem, count, openCart } = useCart();

  // Build option map for variant matching
  const options = product.options || [];
  const variants = product.variants || [];
  const images = product.media || [];

  // Selected option values — init with first value of each option
  const [selected, setSelected] = useState(() => {
    const init = {};
    options.forEach(opt => {
      if (opt.values?.length) init[opt.name] = opt.values[0].value;
    });
    return init;
  });

  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);
  const [added, setAdded] = useState(false);
  const [toast, setToast] = useState('');
  const [descOpen, setDescOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Find matching variant from selected options
  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    if (!options.length) return variants[0];

    return variants.find(v => {
      const parts = (v.title || '').split(' / ');
      return options.every((opt, i) => {
        return parts[i] === selected[opt.name];
      });
    }) || variants[0];
  }, [selected, variants, options]);

  // Price display
  const price = selectedVariant?.price ?? product.price ?? 0;
  const comparePrice = selectedVariant?.compareAtPrice ?? product.compareAtPrice;

  // Stock + availability
  const inventory = selectedVariant?.inventory ?? 0;
  const inStock = inventory > 0;
  const continueSelling = Boolean(selectedVariant?.continueSellingWhenOutOfStock);
  const lowStock = inventory > 0 && inventory <= 5;
  const comingSoon = isComingSoonProduct(product);
  const canPurchase = isVariantPurchasable(product, selectedVariant, qty);
  const badgeLabel = getStorefrontBadgeText(product);

  function selectOption(optName, val) {
    setSelected(prev => ({ ...prev, [optName]: val }));
  }

  // Check which option values produce a valid variant
  function isValueAvailable(optName, val) {
    const testSelected = { ...selected, [optName]: val };
    return variants.some(v => {
      const parts = (v.title || '').split(' / ');
      return options.every((opt, i) => parts[i] === testSelected[opt.name]);
    });
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function handleAddToCart() {
    if (!canPurchase) return;

    const variantTitle =
      selectedVariant?.title && !['Default', 'Default Title'].includes(selectedVariant.title)
        ? selectedVariant.title
        : undefined;

    addItem({
      id: selectedVariant?.id || product.id,
      productId: product.id,
      variantId: selectedVariant?.id,
      title: product.title,
      variantTitle,
      price,
      image: images[0]?.url || null,
      quantity: qty,
    });

    setAdded(true);
    showToast(`${product.title} added to cart`);
    setTimeout(() => setAdded(false), 2000);
  }

  const currentImage = images[activeImg];

  return (
    <div className="pd-root">
      <style>{styles}</style>

      {/* Nav */}
      <nav className="pd-nav">
        <Link href="/" className="pd-nav-logo">Doopify</Link>
        <div className="pd-nav-right">
          <Link href="/shop" className="pd-nav-link">Shop</Link>
          <button className="pd-cart-btn" onClick={openCart}>
            Bag ({count})
          </button>
        </div>
      </nav>

      {/* Breadcrumb */}
      <div className="pd-breadcrumb">
        <Link href="/">Home</Link>
        <span className="pd-breadcrumb-sep">/</span>
        <Link href="/shop">Shop</Link>
        <span className="pd-breadcrumb-sep">/</span>
        <span className="pd-breadcrumb-current">{product.title}</span>
      </div>

      {/* Main layout */}
      <div className="pd-layout">

        {/* Gallery */}
        <div className="pd-gallery">
          <div className="pd-main-image">
            {currentImage?.url ? (
              <img src={currentImage.url} alt={currentImage.altText || product.title} />
            ) : (
              <div className="pd-no-image">✦</div>
            )}
            {badgeLabel ? (
              <div className="pd-image-badge">{badgeLabel}</div>
            ) : comparePrice && comparePrice > price ? (
              <div className="pd-image-badge">Sale</div>
            ) : null}
          </div>
          {images.length > 1 && (
            <div className="pd-thumbs">
              {images.map((img, i) => (
                <div
                  key={img.id || i}
                  className={`pd-thumb${activeImg === i ? ' active' : ''}`}
                  onClick={() => setActiveImg(i)}
                >
                  {img.url ? (
                    <img src={img.url} alt={img.altText || `${product.title} ${i + 1}`} />
                  ) : (
                    <div className="pd-thumb-empty">✦</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="pd-info">
          <Link href="/shop" className="pd-back">← Back to shop</Link>

          {product.vendor && (
            <div className="pd-vendor" style={{ marginTop: 20 }}>{product.vendor}</div>
          )}

          <h1 className="pd-title">{product.title}</h1>

          <div className="pd-price-row">
            <span className="pd-price">${Number(price).toFixed(2)}</span>
            {comparePrice && Number(comparePrice) > Number(price) && (
              <span className="pd-price-compare">${Number(comparePrice).toFixed(2)}</span>
            )}
          </div>
          {product.availability?.availabilityMessage ? (
            <p style={{ margin: '-14px 0 22px', color: '#9a9088', fontSize: 13, lineHeight: 1.5 }}>
              {product.availability.availabilityMessage}
            </p>
          ) : null}

          <div className="pd-divider" />

          {/* Options */}
          {options.map(opt => (
            <div className="pd-option" key={opt.id || opt.name}>
              <div className="pd-option-label">
                {opt.name}
                <span className="pd-option-selected">{selected[opt.name]}</span>
              </div>
              <div className="pd-option-values">
                {opt.values?.map(v => (
                  <button
                    key={v.id || v.value}
                    className={`pd-opt-btn${selected[opt.name] === v.value ? ' selected' : ''}`}
                    onClick={() => selectOption(opt.name, v.value)}
                    disabled={!isValueAvailable(opt.name, v.value)}
                  >
                    {v.value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quantity */}
          <div className="pd-qty-row">
            <div className="pd-qty-label">Qty</div>
            <div className="pd-qty-ctrl">
              <button className="pd-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <div className="pd-qty-val">{qty}</div>
              <button
                className="pd-qty-btn"
                onClick={() =>
                  setQty(q =>
                    continueSelling ? Math.min(99, q + 1) : q < inventory ? q + 1 : q
                  )
                }
              >
                +
              </button>
            </div>
          </div>

          {/* Stock indicator */}
          <div className="pd-stock">
            <div className={`pd-stock-dot ${comingSoon ? 'low' : inStock ? (lowStock ? 'low' : 'in') : continueSelling ? 'low' : 'out'}`} />
            {comingSoon
              ? 'Coming soon'
              : inStock
                ? lowStock
                  ? `Only ${inventory} left`
                  : 'In stock'
                : continueSelling
                  ? 'Available on backorder'
                  : 'Out of stock'}
          </div>

          {/* CTAs */}
          <div className="pd-cta-stack">
            <button
              className={`pd-add-btn${added ? ' added' : ''}`}
              onClick={handleAddToCart}
              disabled={!canPurchase}
            >
              {added ? 'Added to Bag' : comingSoon ? 'Coming Soon' : canPurchase ? 'Add to Bag' : 'Out of Stock'}
            </button>
            <button
              className="pd-buy-btn"
              onClick={() => {
                if (!canPurchase) {
                  return;
                }
                handleAddToCart();
                router.push('/checkout');
              }}
              disabled={!canPurchase}
            >
              Buy Now
            </button>
          </div>

          {/* Description accordion */}
          <div className="pd-desc-section">
            <button className="pd-desc-toggle" onClick={() => setDescOpen(o => !o)}>
              Description
              <span className={`pd-desc-icon${descOpen ? ' open' : ''}`}>+</span>
            </button>
            <div className={`pd-desc-body${descOpen ? ' open' : ''}`}>
              <div className="pd-desc-text">
                {product.description || 'No description available.'}
              </div>
            </div>

            <button className="pd-desc-toggle" onClick={() => setDetailsOpen(o => !o)}>
              Product Details
              <span className={`pd-desc-icon${detailsOpen ? ' open' : ''}`}>+</span>
            </button>
            <div className={`pd-desc-body${detailsOpen ? ' open' : ''}`}>
              <div className="pd-meta-grid">
                {product.vendor && (
                  <>
                    <span className="pd-meta-key">Vendor</span>
                    <span className="pd-meta-val">{product.vendor}</span>
                  </>
                )}
                {product.productType && (
                  <>
                    <span className="pd-meta-key">Type</span>
                    <span className="pd-meta-val">{product.productType}</span>
                  </>
                )}
                {selectedVariant?.sku && (
                  <>
                    <span className="pd-meta-key">SKU</span>
                    <span className="pd-meta-val">{selectedVariant.sku}</span>
                  </>
                )}
                {selectedVariant?.weight && (
                  <>
                    <span className="pd-meta-key">Weight</span>
                    <span className="pd-meta-val">{selectedVariant.weight} {selectedVariant.weightUnit || 'kg'}</span>
                  </>
                )}
                <span className="pd-meta-key">Handle</span>
                <span className="pd-meta-val">{product.handle}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cart Drawer */}
      <CartDrawer />

      {/* Toast */}
      <div className={`pd-toast${toast ? ' show' : ''}`}>
        <span className="pd-toast-gold">✦</span> {toast}
      </div>
    </div>
  );
}

