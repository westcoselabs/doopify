import Link from 'next/link';

export default function CatalogPagination({ pagination, pathname, search = '' }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const href = (page) => {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (page > 1) query.set('page', String(page));
    return `${pathname}${query.size ? `?${query}` : ''}`;
  };
  const linkStyle = { color: 'inherit', padding: '12px 18px', border: '1px solid currentColor', borderRadius: 24, textDecoration: 'none' };
  return (
    <nav aria-label="Catalog pages" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, padding: '24px 24px 48px' }}>
      {pagination.page > 1 ? <Link href={href(pagination.page - 1)} prefetch={false} style={linkStyle}>Previous</Link> : null}
      <span>Page {pagination.page} of {pagination.totalPages}</span>
      {pagination.page < pagination.totalPages ? <Link href={href(pagination.page + 1)} prefetch={false} style={linkStyle}>Next</Link> : null}
    </nav>
  );
}
