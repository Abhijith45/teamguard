/**
 * TeamGuard Database Backfill Migration: Spatial ReBAC Default Containers
 *
 * Idempotently provisions a default "General Workspace" space for every organization
 * in the database and updates all projects where spaceId IS NULL to point to it.
 *
 * Usage:
 *   node backend/scripts/backfill-spaces.js
 *   node scripts/backfill-spaces.js (from backend/)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../config/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded whether called from workspace root or backend directory
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export async function backfillSpaces() {
  console.log("==================================================================");
  console.log("TeamGuard: Starting Idempotent Spaces & Project Backfill Migration");
  console.log("==================================================================");

  const startTime = Date.now();
  let totalOrgs = 0;
  let spacesCreated = 0;
  let spacesExisting = 0;
  let projectsUpdated = 0;
  let projectsAlreadyMapped = 0;

  // 1. Fetch all organizations with their primary active membership (for creatorId)
  const organizations = await prisma.organization.findMany({
    orderBy: { id: "asc" },
    include: {
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });

  totalOrgs = organizations.length;
  console.log(`Found ${totalOrgs} organizations to evaluate.`);

  for (const org of organizations) {
    const creatorMembershipId = org.memberships[0]?.id ?? null;

    // 2. Check if default space already exists
    const existingSpace = await prisma.space.findUnique({
      where: {
        organizationId_slug: {
          organizationId: org.id,
          slug: "general-workspace",
        },
      },
    });

    let defaultSpace;
    if (existingSpace) {
      defaultSpace = existingSpace;
      spacesExisting++;
    } else {
      defaultSpace = await prisma.space.create({
        data: {
          organizationId: org.id,
          creatorId: creatorMembershipId,
          name: "General Workspace",
          slug: "general-workspace",
          description: "Default workspace for organization projects",
          icon: "Folder",
          color: "#6366f1",
          isPrivate: false,
          isArchived: false,
        },
      });
      spacesCreated++;
    }

    // 3. Update all projects in this organization where spaceId IS NULL
    const updateResult = await prisma.project.updateMany({
      where: {
        organizationId: org.id,
        spaceId: null,
      },
      data: {
        spaceId: defaultSpace.id,
      },
    });

    projectsUpdated += updateResult.count;

    // Count projects already assigned
    const mappedCount = await prisma.project.count({
      where: {
        organizationId: org.id,
        spaceId: { not: null },
      },
    });
    projectsAlreadyMapped += mappedCount - updateResult.count;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n------------------------------------------------------------------");
  console.log("Backfill Completed Successfully:");
  console.log(`- Total Organizations Evaluated:   ${totalOrgs}`);
  console.log(`- New Spaces Created:              ${spacesCreated}`);
  console.log(`- Pre-existing Spaces Retained:    ${spacesExisting}`);
  console.log(`- Orphan Projects Linked to Space: ${projectsUpdated}`);
  console.log(`- Projects Already Mapped:         ${projectsAlreadyMapped}`);
  console.log(`- Total Elapsed Time:              ${durationSec}s`);
  console.log("------------------------------------------------------------------\n");

  return {
    totalOrgs,
    spacesCreated,
    spacesExisting,
    projectsUpdated,
    durationSec,
  };
}

// Direct invocation guard
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  backfillSpaces()
    .catch((err) => {
      console.error("Fatal error during backfill execution:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
