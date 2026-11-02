/*
  Warnings:

  - You are about to drop the column `clubId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the `Club` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_clubId_fkey";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "clubId";

-- DropTable
DROP TABLE "Club";
