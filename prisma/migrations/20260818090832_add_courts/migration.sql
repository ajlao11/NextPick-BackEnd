-- CreateEnum
CREATE TYPE "CourtStatus" AS ENUM ('AVAILABLE', 'PLAYING', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CourtStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Court_sessionId_number_key" ON "Court"("sessionId", "number");

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
