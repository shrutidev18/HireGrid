import { Router } from "express";
import type { ApplicationStatus } from "@prisma/client";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();
router.use(authMiddleware);

const STATUSES: ApplicationStatus[] = ["SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

// GET /api/dashboard - total count, count per status, and the 5 most recent applications
router.get("/", async (req, res) => {
  const userId = req.userId as string;

  const totalApplications = await prisma.application.count({ where: { userId } });

  // one count query per status - simple, and there's only 5 statuses so this is fine
  const statusCounts: Record<string, number> = {};
  for (const status of STATUSES) {
    statusCounts[status] = await prisma.application.count({ where: { userId, status } });
  }

  const recentApplications = await prisma.application.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  res.json({ totalApplications, statusCounts, recentApplications });
});

export default router;
