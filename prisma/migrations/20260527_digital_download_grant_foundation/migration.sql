-- CreateEnum
CREATE TYPE "DigitalDownloadEventResult" AS ENUM ('ALLOWED', 'DENIED_EXPIRED', 'DENIED_REVOKED', 'DENIED_EXHAUSTED', 'DENIED_OTHER');

-- CreateTable
CREATE TABLE "digital_assets" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_digital_assets" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "digitalAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_digital_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_download_grants" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "digitalAssetId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "downloadLimit" INTEGER NOT NULL DEFAULT 5,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_download_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_download_events" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "result" "DigitalDownloadEventResult" NOT NULL,

    CONSTRAINT "digital_download_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "digital_assets_storeId_idx" ON "digital_assets"("storeId");

-- CreateIndex
CREATE INDEX "digital_assets_storageProvider_idx" ON "digital_assets"("storageProvider");

-- CreateIndex
CREATE INDEX "digital_assets_storageKey_idx" ON "digital_assets"("storageKey");

-- CreateIndex
CREATE INDEX "product_digital_assets_productId_sortOrder_idx" ON "product_digital_assets"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "product_digital_assets_digitalAssetId_idx" ON "product_digital_assets"("digitalAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "product_digital_assets_productId_digitalAssetId_key" ON "product_digital_assets"("productId", "digitalAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_download_grants_tokenHash_key" ON "digital_download_grants"("tokenHash");

-- CreateIndex
CREATE INDEX "digital_download_grants_storeId_idx" ON "digital_download_grants"("storeId");

-- CreateIndex
CREATE INDEX "digital_download_grants_orderId_idx" ON "digital_download_grants"("orderId");

-- CreateIndex
CREATE INDEX "digital_download_grants_orderItemId_idx" ON "digital_download_grants"("orderItemId");

-- CreateIndex
CREATE INDEX "digital_download_grants_productId_idx" ON "digital_download_grants"("productId");

-- CreateIndex
CREATE INDEX "digital_download_grants_digitalAssetId_idx" ON "digital_download_grants"("digitalAssetId");

-- CreateIndex
CREATE INDEX "digital_download_grants_expiresAt_idx" ON "digital_download_grants"("expiresAt");

-- CreateIndex
CREATE INDEX "digital_download_grants_revokedAt_idx" ON "digital_download_grants"("revokedAt");

-- CreateIndex
CREATE INDEX "digital_download_events_grantId_idx" ON "digital_download_events"("grantId");

-- CreateIndex
CREATE INDEX "digital_download_events_occurredAt_idx" ON "digital_download_events"("occurredAt");

-- AddForeignKey
ALTER TABLE "digital_assets" ADD CONSTRAINT "digital_assets_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_digital_assets" ADD CONSTRAINT "product_digital_assets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_digital_assets" ADD CONSTRAINT "product_digital_assets_digitalAssetId_fkey" FOREIGN KEY ("digitalAssetId") REFERENCES "digital_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_download_grants" ADD CONSTRAINT "digital_download_grants_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_download_grants" ADD CONSTRAINT "digital_download_grants_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_download_grants" ADD CONSTRAINT "digital_download_grants_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_download_grants" ADD CONSTRAINT "digital_download_grants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_download_grants" ADD CONSTRAINT "digital_download_grants_digitalAssetId_fkey" FOREIGN KEY ("digitalAssetId") REFERENCES "digital_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_download_events" ADD CONSTRAINT "digital_download_events_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "digital_download_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;