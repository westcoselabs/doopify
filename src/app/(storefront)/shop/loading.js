export default function ShopLoading() {
  return <div role="status" aria-live="polite" style={{ minHeight: '70vh', padding: 48 }}>
    <h1>Loading products...</h1>
    <p>Syncing live catalog inventory and prices.</p>
    <h2>Loading catalog</h2>
    <p>Products will appear here as soon as availability checks finish.</p>
  </div>;
}
