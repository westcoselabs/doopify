import { notFound } from 'next/navigation';

import CollectionDetailView from '@/components/storefront/CollectionDetailView';
import {
  getStorefrontCollectionByHandle,
  getStorefrontCollectionMetadata,
  getStorefrontCollectionLinks,
} from '@/server/services/collection.service';

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const collection = await getStorefrontCollectionMetadata(handle);

  if (!collection) {
    return {
      title: 'Collection not found',
    };
  }

  return {
    title: `${collection.title} - Doopify`,
    description: collection.description || `Browse ${collection.title} on Doopify.`,
  };
}

export default async function CollectionPage({ params, searchParams }) {
  const { handle } = await params;
  const query = await searchParams;
  const [collection, peerCollections] = await Promise.all([
    getStorefrontCollectionByHandle(handle, { page: Number(query?.page) }),
    getStorefrontCollectionLinks({ limit: 5, excludeHandle: handle }).catch((error) => {
      console.error('[CollectionPage]', error);
      return [];
    }),
  ]);

  if (!collection) {
    notFound();
  }

  return <CollectionDetailView collection={collection} peerCollections={peerCollections} />;
}
