-- CreateTable
CREATE TABLE "digital_download_deliveries" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_download_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digital_download_deliveries_grantId_key" ON "digital_download_deliveries"("grantId");

-- CreateIndex
CREATE INDEX "digital_download_deliveries_createdAt_idx" ON "digital_download_deliveries"("createdAt");

-- AddForeignKey
ALTER TABLE "digital_download_deliveries" ADD CONSTRAINT "digital_download_deliveries_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "digital_download_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
