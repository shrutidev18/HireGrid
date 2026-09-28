import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();
router.use(authMiddleware);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

// make sure the uploads folder actually exists before multer tries to write into it
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // prefix with a timestamp so two resumes with the same name don't collide
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

// POST /api/resumes - upload a PDF, extract its text, save a Resume row
router.post("/", (req, res) => {
  // calling upload.single() like this (instead of as normal middleware) so we
  // can catch multer's errors ourselves - otherwise a rejected file (wrong
  // type, too big) crashes past our route and Express just shows its default
  // HTML error page instead of a proper JSON response
  upload.single("resume")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded (or it wasn't a PDF)" });
    }

    try {
      const buffer = fs.readFileSync(req.file.path);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();

      const resume = await prisma.resume.create({
        data: {
          userId: req.userId as string,
          fileName: req.file.originalname,
          fileUrl: `/uploads/${req.file.filename}`,
          extractedText: result.text,
        },
      });

      res.status(201).json({ id: resume.id, fileName: resume.fileName, createdAt: resume.createdAt });
    } catch (err) {
      console.error("Failed to parse resume PDF:", err);
      res.status(500).json({ error: "Couldn't read that PDF - try a different file" });
    }
  });
});

// GET /api/resumes - list this user's resumes (for the resume dropdown + My Resumes page)
router.get("/", async (req, res) => {
  const resumes = await prisma.resume.findMany({
    where: { userId: req.userId as string },
    orderBy: { createdAt: "desc" },
  });

  res.json({ resumes });
});

// DELETE /api/resumes/:id - just delete it, not worrying about applications that reference it
router.delete("/:id", async (req, res) => {
  try {
    await prisma.resume.delete({
      where: { id: req.params.id, userId: req.userId as string },
    });

    res.json({ message: "Resume deleted" });
  } catch (err) {
    res.status(404).json({ error: "Resume not found" });
  }
});

export default router;
