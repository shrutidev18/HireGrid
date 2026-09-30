-- Adds career info fields to User, for the profile page redesign.
-- All nullable (or defaulting to an empty array for skills) since existing
-- users won't have filled these in yet.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "targetRole" TEXT,
ADD COLUMN     "experienceLevel" TEXT,
ADD COLUMN     "education" TEXT,
ADD COLUMN     "graduationYear" INTEGER,
ADD COLUMN     "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
