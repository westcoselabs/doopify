-- CreateTable
CREATE TABLE "launch_readiness_snapshots" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'default',
  "payload" JSONB NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL,
  "runByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "launch_readiness_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "launch_readiness_snapshots_scope_key" ON "launch_readiness_snapshots"("scope");

-- CreateIndex
CREATE INDEX "launch_readiness_snapshots_checkedAt_idx" ON "launch_readiness_snapshots"("checkedAt");