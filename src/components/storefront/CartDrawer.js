"use client";

import Link from 'next/link';

import { useCart } from '../../context/CartContext';

export default function CartDrawer() {
  const { items, removeItem, updateQuantity, total, clearCart, isOpen, closeCart } = useCart();

  return (
    <>
      <style>{`
        .cdr-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;opacity:0;pointer-events:none;transition:opacity 0.3s}
        .cdr-overlay.open{opacity:1;pointer-events:all}
        .cdr-drawer{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;background:#0f0e0c;z-index:201;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94);display:flex;flex-direction:column}
        .cdr-drawer.open{transform:translateX(0)}
        .cdr-head{display:flex;align-items:center;justify-content:space-between;padding:28px 28px 20px;border-bottom:1px solid #1e1c19}
        .cdr-title{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;color:#f2ede4}
        .cdr-close{background:none;border:none;color:#6a6058;cursor:pointer;font-size:22px;line-height:1}
        .cdr-close:hover{color:#f2ede4}
        .cdr-items{flex:1;overflow-y:auto;padding:20px 28px}
        .cdr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:16px;color:#3a3830}
        .cdr-empty-icon{font-size:48px;font-family:'Cormorant Garamond',serif}
        .cdr-item{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid #1a1916}
        .cdr-item-img{width:72px;height:72px;background:#161410;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#2a2820}
        .cdr-item-img img{width:100%;height:100%;object-fit:cover}
        .cdr-item-info{flex:1;min-width:0}
        .cdr-item-title{font-size:14px;color:#f2ede4;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cdr-item-variant{font-size:12px;color:#6a6058;margin-bottom:10px}
        .cdr-item-row{display:flex;align-items:center;justify-content:space-between}
        .cdr-qty{display:flex;align-items:center;gap:8px}
        .cdr-qty-btn{width:24px;height:24px;background:#1e1c19;border:none;color:#f2ede4;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 0.15s}
        .cdr-qty-btn:hover{background:#2e2b26}
        .cdr-qty-val{font-size:14px;color:#f2ede4;min-width:20px;text-align:center}
        .cdr-item-price{font-size:14px;color:#c9a86c}
        .cdr-remove{background:none;border:none;color:#3a3830;cursor:pointer;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-top:6px;transition:color 0.15s}
        .cdr-remove:hover{color:#c9a86c}
        .cdr-foot{padding:24px 28px;border-top:1px solid #1e1c19}
        .cdr-total-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:20px}
        .cdr-total-label{font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#6a6058}
        .cdr-total-val{font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;color:#f2ede4}
        .cdr-note{margin:0 0 14px;font-size:12px;line-height:1.45;color:#6a6058}
        .cdr-checkout{width:100%;padding:16px;background:#c9a86c;border:none;color:#080808;font-size:12px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;cursor:pointer;transition:background 0.2s;text-decoration:none;display:flex;align-items:center;justify-content:center}
        .cdr-checkout:hover{background:#dbb97e}
        .cdr-clear{width:100%;padding:10px;background:none;border:none;color:#3a3830;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;margin-top:10px;transition:color 0.15s}
        .cdr-clear:hover{color:#6a6058}
      `}</style>

      <div className={`cdr-overlay${isOpen ? ' open' : ''}`} onClick={closeCart} />
      <div className={`cdr-drawer${isOpen ? ' open' : ''}`}>
        <div className="cdr-head">
          <h2 className="cdr-title">Your Bag ({items.length})</h2>
          <button className="cdr-close" onClick={closeCart}>✕</button>
        </div>
        <div className="cdr-items">
          {items.length === 0 ? (
            <div className="cdr-empty">
              <div className="cdr-empty-icon">✦</div>
              <span style={{ fontSize: 13, letterSpacing: '0.05em' }}>Your bag is empty</span>
            </div>
          ) : (
            items.map(item => (
              <div className="cdr-item" key={item.id || item.variantId}>
                <div className="cdr-item-img">
                  {item.image
                    ? <img src={item.image} alt={item.title} />
                    : <span style={{ fontSize: 24, color: '#2a2820' }}>✦</span>
                  }
                </div>
                <div className="cdr-item-info">
                  <div className="cdr-item-title">{item.title}</div>
                  {item.variantTitle && <div className="cdr-item-variant">{item.variantTitle}</div>}
                  <div className="cdr-item-row">
                    <div className="cdr-qty">
                      <button className="cdr-qty-btn" onClick={() => updateQuantity(item.variantId, item.quantity - 1)}>−</button>
                      <span className="cdr-qty-val">{item.quantity}</span>
                      <button className="cdr-qty-btn" onClick={() => updateQuantity(item.variantId, item.quantity + 1)}>+</button>
                    </div>
                    <span className="cdr-item-price">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                  <button className="cdr-remove" onClick={() => removeItem(item.variantId)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>
        {items.length > 0 && (
          <div className="cdr-foot">
            <div className="cdr-total-row">
              <span className="cdr-total-label">Subtotal</span>
              <span className="cdr-total-val">${total.toFixed(2)}</span>
            </div>
            <p className="cdr-note">Automatic promotions are calculated at checkout.</p>
            <Link className="cdr-checkout" href="/checkout" onClick={closeCart}>Proceed to Checkout</Link>
            <button className="cdr-clear" onClick={clearCart}>Clear bag</button>
          </div>
        )}
      </div>
    </>
  );
}
