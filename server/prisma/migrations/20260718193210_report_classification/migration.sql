-- CreateEnum
CREATE TYPE "Category" AS ENUM ('HUMAN_FACTORS', 'AIRCRAFT_SYSTEMS', 'WEATHER', 'ATC_COMMUNICATION', 'RUNWAY_SAFETY', 'WILDLIFE', 'PROCEDURAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "category" "Category",
ADD COLUMN     "severity" "Severity",
ADD COLUMN     "severityJustification" TEXT,
ADD COLUMN     "summary" TEXT;

-- CreateIndex
CREATE INDEX "reports_category_idx" ON "reports"("category");

-- CreateIndex
CREATE INDEX "reports_severity_idx" ON "reports"("severity");
