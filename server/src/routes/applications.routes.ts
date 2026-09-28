import { Router } from "express";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/authMiddleware";
import { analyzeResumeMatch } from "../utils/gemini";

const router = Router();

// every route here needs a logged-in user
router.use(authMiddleware);

// POST /api/applications - create a new application + the first status history row
router.post("/", async (req, res) => {
  const {
    companyName,
    jobTitle,
    jobLocation,
    employmentType,
    jobLink,
    jobDescription,
    resumeId,
    status,
    dateApplied,
    notes,
  } = req.body;

  if (!companyName || !jobTitle || !jobLocation || !employmentType || !jobDescription) {
    return res.status(400).json({ error: "Company, job title, location, employment type and job description are required" });
  }

  const initialStatus = status || "SAVED";

  const application = await prisma.application.create({
    data: {
      userId: req.userId as string,
      companyName,
      jobTitle,
      jobLocation,
      employmentType,
      jobLink,
      jobDescription,
      resumeId: resumeId || null,
      status: initialStatus,
      dateApplied: dateApplied ? new Date(dateApplied) : null,
      notes,
    },
  });

  // log the starting status so the history list isn't missing its first entry
  await prisma.statusHistory.create({
    data: {
      applicationId: application.id,
      status: initialStatus,
    },
  });

  // if there's a resume attached, run it against the job description through
  // Gemini and save the result. If anything about this fails we just skip it -
  // the application itself is already created either way.
  let analysisResult = null;
  if (resumeId && jobDescription) {
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId, userId: req.userId as string },
    });

    if (resume) {
      const analysis = await analyzeResumeMatch(resume.extractedText, jobDescription);

      if (analysis) {
        analysisResult = await prisma.analysisResult.create({
          data: {
            applicationId: application.id,
            matchedSkills: analysis.matchedSkills,
            missingSkills: analysis.missingSkills,
            matchScore: analysis.matchScore,
            suggestions: analysis.suggestions,
          },
        });
      }
    }
  }

  res.status(201).json({ application, analysisResult });
});

// GET /api/applications - list of this user's applications (for the list/search/filter page)
router.get("/", async (req, res) => {
  const { search, status } = req.query;

  const where: any = { userId: req.userId as string };

  if (search && typeof search === "string") {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { jobTitle: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status && typeof status === "string") {
    where.status = status;
  }

  const applications = await prisma.application.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  res.json({ applications });
});

// GET /api/applications/:id - one application with status history + analysis result
router.get("/:id", async (req, res) => {
  const application = await prisma.application.findUnique({
    where: { id: req.params.id, userId: req.userId as string },
    include: {
      statusHistory: { orderBy: { changedAt: "asc" } },
      analysisResult: true,
      resume: true,
    },
  });

  if (!application) {
    return res.status(404).json({ error: "Application not found" });
  }

  res.json({ application });
});

// PUT /api/applications/:id - edit application fields (status is handled separately below)
router.put("/:id", async (req, res) => {
  const {
    companyName,
    jobTitle,
    jobLocation,
    employmentType,
    jobLink,
    jobDescription,
    resumeId,
    dateApplied,
    notes,
  } = req.body;

  try {
    const application = await prisma.application.update({
      where: { id: req.params.id, userId: req.userId as string },
      data: {
        companyName,
        jobTitle,
        jobLocation,
        employmentType,
        jobLink,
        jobDescription,
        resumeId: resumeId || null,
        dateApplied: dateApplied ? new Date(dateApplied) : null,
        notes,
      },
    });

    res.json({ application });
  } catch (err) {
    // Prisma throws if the where clause doesn't match anything (wrong id / not this user's)
    res.status(404).json({ error: "Application not found" });
  }
});

// PATCH /api/applications/:id/status - change status + log it in status history
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  try {
    const application = await prisma.application.update({
      where: { id: req.params.id, userId: req.userId as string },
      data: { status },
    });

    await prisma.statusHistory.create({
      data: {
        applicationId: application.id,
        status,
      },
    });

    res.json({ application });
  } catch (err) {
    res.status(404).json({ error: "Application not found" });
  }
});

// DELETE /api/applications/:id
router.delete("/:id", async (req, res) => {
  try {
    await prisma.application.delete({
      where: { id: req.params.id, userId: req.userId as string },
    });

    res.json({ message: "Application deleted" });
  } catch (err) {
    res.status(404).json({ error: "Application not found" });
  }
});

export default router;
