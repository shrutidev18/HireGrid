-- Fix: deleting an Application was failing with a foreign key violation,
-- because every application always has at least one StatusHistory row and
-- the default onDelete action (Restrict) blocks the delete in that case.
-- Switching to Cascade so deleting an application also cleans up its
-- status history and analysis result.

-- DropForeignKey
ALTER TABLE "StatusHistory" DROP CONSTRAINT "StatusHistory_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "AnalysisResult" DROP CONSTRAINT "AnalysisResult_applicationId_fkey";

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
