"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminSelectableTile from '../admin/ui/AdminSelectableTile';
import AdminUploadDropzone from '../admin/ui/AdminUploadDropzone';
import styles from './MediaGalleryManager.module.css';

function mergeLibraryAssets(currentAssets, incomingAssets) {
  const assetMap = new Map(currentAssets.map(asset => [asset.id, asset]));
  incomingAssets.forEach(asset => {
    if (!asset?.id) {
      return;
    }

    assetMap.set(asset.id, {
      ...assetMap.get(asset.id),
      ...asset,
    });
  });

  return [...assetMap.values()].sort((first, second) => {
    const firstDate = first?.createdAt ? new Date(first.createdAt).getTime() : 0;
    const secondDate = second?.createdAt ? new Date(second.createdAt).getTime() : 0;
    return secondDate - firstDate;
  });
}

function formatAssetDate(value) {
  if (!value) {
    return 'Recently added';
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  } catch {
    return 'Recently added';
  }
}

/**
 * Presentational, controlled media gallery shared by the product editor and
 * the collection editor. It owns the "Media Library" tab data (fetch/refresh)
 * and tab/selection UI, while every gallery mutation is delegated to the host
 * through callbacks so each surface keeps its own data model.
 */
export default function MediaGalleryManager({
  images = [],
  featuredImageId = null,
  selectedImageId = null,
  allowReorder = true,
  dropzoneDescription = 'Drop JPG, PNG, WebP, or GIF files up to 4.5 MB to attach them to this gallery.',
  dropzoneTitle = 'Drag and drop product media',
  libraryDescription = 'Upload reusable product images for galleries, storefronts, and product pages. Files are stored in your configured media provider and managed through Doopify.',
  multiple = true,
  onAddAssetToGallery,
  onMoveImage,
  onRemoveImage,
  onSelectImage,
  onSetFeatured,
  onUploadToGallery,
  onUploadToLibrary,
  showFeatured = true,
  showLibraryTab = true,
}) {
  const galleryUploadInputRef = useRef(null);
  const libraryUploadInputRef = useRef(null);
  const draggedImageIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState('gallery');
  const [libraryAssets, setLibraryAssets] = useState([]);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');

  const selectedImage = useMemo(
    () => images.find(image => image.id === selectedImageId) || null,
    [images, selectedImageId]
  );

  const inGalleryAssetIds = useMemo(
    () => new Set(images.map(image => image.assetId).filter(Boolean)),
    [images]
  );
  const inGallerySrcs = useMemo(
    () => new Set(images.map(image => image.src).filter(Boolean)),
    [images]
  );

  useEffect(() => {
    if (!showLibraryTab) {
      return undefined;
    }

    let isActive = true;

    async function loadLibrary() {
      setIsLibraryLoading(true);
      setLibraryError('');

      try {
        const res = await fetch('/api/media?pageSize=72');
        const json = await res.json();

        if (!isActive) {
          return;
        }

        if (!json.success) {
          setLibraryError(json.error || 'Could not load the media library.');
          return;
        }

        setLibraryAssets(json.data.assets || []);
      } catch (error) {
        console.error('[MediaGalleryManager] media library fetch failed', error);
        if (isActive) {
          setLibraryError('Could not load the media library.');
        }
      } finally {
        if (isActive) {
          setIsLibraryLoading(false);
        }
      }
    }

    loadLibrary();

    return () => {
      isActive = false;
    };
  }, [showLibraryTab]);

  const mergeUploadedAssetsIntoLibrary = uploadedAssets => {
    if (!uploadedAssets?.length) {
      return;
    }
    setLibraryAssets(currentAssets =>
      mergeLibraryAssets(
        currentAssets,
        uploadedAssets.map(asset => ({
          ...asset,
          createdAt: asset.createdAt || new Date().toISOString(),
          linkedProducts: asset.linkedProducts || 0,
        }))
      )
    );
  };

  const uploadToGallery = async files => {
    const uploadedAssets = (await onUploadToGallery?.(Array.from(files || []))) || [];
    mergeUploadedAssetsIntoLibrary(uploadedAssets);
    if (uploadedAssets.length) {
      setActiveTab('gallery');
    }
    return uploadedAssets;
  };

  const uploadToLibrary = async files => {
    const uploadedAssets = (await onUploadToLibrary?.(Array.from(files || []))) || [];
    mergeUploadedAssetsIntoLibrary(uploadedAssets);
    return uploadedAssets;
  };

  const handleGalleryUploadSelection = async event => {
    await uploadToGallery(event.target.files);
    event.target.value = '';
  };

  const handleLibraryUploadSelection = async event => {
    await uploadToLibrary(event.target.files);
    event.target.value = '';
  };

  const refreshLibrary = () => {
    setIsLibraryLoading(true);
    setLibraryError('');
    fetch('/api/media?pageSize=72')
      .then(res => res.json())
      .then(json => {
        if (!json.success) {
          setLibraryError(json.error || 'Could not refresh the media library.');
          return;
        }

        setLibraryAssets(json.data.assets || []);
      })
      .catch(error => {
        console.error('[MediaGalleryManager] media refresh failed', error);
        setLibraryError('Could not refresh the media library.');
      })
      .finally(() => {
        setIsLibraryLoading(false);
      });
  };

  const renderGalleryTab = () => (
    <>
      <AdminUploadDropzone
        className={styles.uploadZone}
        description={dropzoneDescription}
        multiple={multiple}
        onFilesSelected={uploadToGallery}
        title={dropzoneTitle}
      />

      <div className={styles.actionRow}>
        <AdminButton leftIcon={<span className="material-symbols-outlined">add_photo_alternate</span>} onClick={() => galleryUploadInputRef.current?.click()} size="sm" variant="primary">
          Add photos
        </AdminButton>
        {showLibraryTab ? (
          <>
            <AdminButton leftIcon={<span className="material-symbols-outlined">upload</span>} onClick={() => libraryUploadInputRef.current?.click()} size="sm" variant="secondary">
              Upload to library
            </AdminButton>
            <AdminButton leftIcon={<span className="material-symbols-outlined">photo_library</span>} onClick={() => setActiveTab('library')} size="sm" variant="secondary">
              Open library
            </AdminButton>
          </>
        ) : null}
        {showFeatured ? (
          <AdminButton
            disabled={!selectedImage || selectedImage.id === featuredImageId}
            leftIcon={<span className="material-symbols-outlined">star</span>}
            onClick={() => selectedImage && onSetFeatured?.(selectedImage.id)}
            size="sm"
            variant="secondary"
          >
            Set featured
          </AdminButton>
        ) : null}
        <AdminButton
          disabled={!selectedImage}
          leftIcon={<span className="material-symbols-outlined">delete</span>}
          onClick={() => selectedImage && onRemoveImage?.(selectedImage.id)}
          size="sm"
          variant="danger"
        >
          Remove
        </AdminButton>
      </div>

      <div className={styles.thumbnailGrid}>
        {images.map((image, index) => (
          <AdminSelectableTile
            key={image.id}
            className={styles.thumbnailTile}
            draggable={allowReorder}
            footer={(
              <>
                <span className={styles.tilePosition}>{index + 1}</span>
                {showFeatured && image.id === featuredImageId ? <span className={styles.tileBadge}>Featured</span> : null}
              </>
            )}
            media={(
              <div className={styles.thumbnailTileImageWrap}>
                <Image alt={image.alt} className={styles.thumbnailImage} fill src={image.src} unoptimized />
              </div>
            )}
            onClick={() => onSelectImage?.(image.id)}
            onDragEnd={allowReorder ? () => {
              draggedImageIdRef.current = null;
            } : undefined}
            onDragOver={allowReorder ? event => {
              event.preventDefault();
            } : undefined}
            onDragStart={allowReorder ? () => {
              draggedImageIdRef.current = image.id;
            } : undefined}
            onDrop={allowReorder ? event => {
              event.preventDefault();
              const draggedImageId = draggedImageIdRef.current;
              if (!draggedImageId || draggedImageId === image.id) {
                return;
              }

              const fromIndex = images.findIndex(item => item.id === draggedImageId);
              const toIndex = images.findIndex(item => item.id === image.id);

              if (fromIndex === -1 || toIndex === -1) {
                return;
              }

              let steps = toIndex - fromIndex;
              while (steps !== 0) {
                onMoveImage?.(draggedImageId, steps > 0 ? 'right' : 'left');
                steps += steps > 0 ? -1 : 1;
              }

              draggedImageIdRef.current = null;
            } : undefined}
            selected={image.id === selectedImageId}
            type="button"
          />
        ))}

        <button className={styles.addTile} onClick={() => galleryUploadInputRef.current?.click()} type="button">
          <span className="material-symbols-outlined">add</span>
        </button>
      </div>
    </>
  );

  const renderLibraryTab = () => (
    <>
      <div className={styles.libraryIntro}>
        <div>
          <p className={styles.libraryEyebrow}>Media Library</p>
          <p className={styles.libraryText}>{libraryDescription}</p>
        </div>
        <div className={styles.actionRow}>
          <AdminButton leftIcon={<span className="material-symbols-outlined">upload</span>} onClick={() => libraryUploadInputRef.current?.click()} size="sm" variant="primary">
            Upload image
          </AdminButton>
          <AdminButton
            leftIcon={<span className="material-symbols-outlined">refresh</span>}
            onClick={refreshLibrary}
            size="sm"
            variant="secondary"
          >
            Refresh
          </AdminButton>
          <Link className={`admin-btn admin-btn--secondary admin-btn--sm ${styles.actionButtonLink}`} href="/media">
            <span className="material-symbols-outlined">open_in_new</span>
            Open media page
          </Link>
        </div>
      </div>

      <AdminUploadDropzone
        className={styles.uploadZone}
        description="Drop JPG, PNG, WebP, or GIF files up to 4.5 MB to upload reusable media."
        multiple={multiple}
        onFilesSelected={uploadToLibrary}
        title="Drag and drop to media library"
      />

      {libraryError ? <p className={styles.libraryError}>{libraryError}</p> : null}

      {isLibraryLoading ? (
        <div className={styles.libraryState}>Loading media library...</div>
      ) : libraryAssets.length ? (
        <div className={styles.libraryGrid}>
          {libraryAssets.map(asset => {
            const isInGallery = inGalleryAssetIds.has(asset.id) || inGallerySrcs.has(asset.url);

            return (
              <AdminSelectableTile
                action={(
                  <AdminButton
                    className={isInGallery ? styles.libraryButtonAdded : styles.libraryButton}
                    disabled={isInGallery}
                    onClick={() => {
                      onAddAssetToGallery?.(asset);
                      setActiveTab('gallery');
                    }}
                    size="sm"
                    variant={isInGallery ? 'secondary' : 'primary'}
                  >
                    {isInGallery ? 'In gallery' : 'Add to gallery'}
                  </AdminButton>
                )}
                className={styles.libraryCard}
                footer={(
                  <>
                    <span>{formatAssetDate(asset.createdAt)}</span>
                    <span>{asset.linkedProducts ? `${asset.linkedProducts} linked` : 'Unlinked'}</span>
                  </>
                )}
                key={asset.id}
                media={(
                  <div className={styles.libraryImageWrap}>
                    <Image
                      alt={asset.altText || asset.filename || 'Media library image'}
                      className={styles.libraryImage}
                      fill
                      src={asset.url}
                      unoptimized
                    />
                  </div>
                )}
                selected={isInGallery}
                subtitle={asset.altText || 'No alt text yet'}
                title={asset.filename || 'Untitled asset'}
              />
            );
          })}
        </div>
      ) : (
        <div className={styles.libraryState}>No uploads yet. Add your first image to start the library.</div>
      )}
    </>
  );

  return (
    <div className={styles.mediaShell}>
      {showLibraryTab ? (
        <div className={styles.tabRow}>
          <AdminButton
            className={styles.tabButton}
            onClick={() => setActiveTab('gallery')}
            size="sm"
            variant={activeTab === 'gallery' ? 'primary' : 'secondary'}
          >
            Gallery
          </AdminButton>
          <AdminButton
            className={styles.tabButton}
            onClick={() => setActiveTab('library')}
            size="sm"
            variant={activeTab === 'library' ? 'primary' : 'secondary'}
          >
            Media Library
          </AdminButton>
        </div>
      ) : null}

      <input accept="image/*" hidden multiple={multiple} onChange={handleGalleryUploadSelection} ref={galleryUploadInputRef} type="file" />
      <input accept="image/*" hidden multiple={multiple} onChange={handleLibraryUploadSelection} ref={libraryUploadInputRef} type="file" />

      {activeTab === 'gallery' || !showLibraryTab ? renderGalleryTab() : renderLibraryTab()}
    </div>
  );
}
