"use client";

import { useMemo } from 'react';
import { useProductStore } from '../../context/ProductContext';
import MediaGalleryManager from '../media/MediaGalleryManager';

export default function ProductMediaManager() {
  const { editor, actions } = useProductStore();
  const draftProduct = editor.draftProduct;

  const images = useMemo(
    () =>
      (draftProduct?.images || []).map(image => ({
        id: image.id,
        src: image.src,
        alt: image.alt,
        assetId: image.assetId,
      })),
    [draftProduct?.images]
  );

  if (!draftProduct) {
    return null;
  }

  // Mirror the original preview resolution: explicit selection, else featured.
  const selectedImageId =
    images.find(image => image.id === editor.previewImageId)?.id ||
    editor.draftFeaturedImage?.id ||
    null;

  return (
    <MediaGalleryManager
      dropzoneDescription="Drop JPG, PNG, WebP, or GIF files up to 4.5 MB to attach them to this product gallery."
      dropzoneTitle="Drag and drop product media"
      featuredImageId={draftProduct.featuredImageId}
      images={images}
      onAddAssetToGallery={asset => actions.addImagesFromLibrary(asset)}
      onMoveImage={(imageId, direction) => actions.moveImage(imageId, direction)}
      onRemoveImage={imageId => actions.removeImage(imageId)}
      onSelectImage={imageId => actions.selectPreviewImage(imageId)}
      onSetFeatured={imageId => actions.setFeaturedImage(imageId)}
      onUploadToGallery={files => actions.addImagesFromFiles(files, { attachToDraft: true })}
      onUploadToLibrary={files => actions.addImagesFromFiles(files, { attachToDraft: false })}
      selectedImageId={selectedImageId}
    />
  );
}
