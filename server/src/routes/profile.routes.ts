import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();
router.use(authMiddleware);

const SALT_ROUNDS = 10;

// fields returned/accepted for the profile page - keeping this in one place
// so GET and PUT below select/send the exact same shape
function selectFields(user: {
  name: string;
  email: string;
  targetRole: string | null;
  experienceLevel: string | null;
  education: string | null;
  graduationYear: number | null;
  skills: string[];
}) {
  return {
    name: user.name,
    email: user.email,
    targetRole: user.targetRole,
    experienceLevel: user.experienceLevel,
    education: user.education,
    graduationYear: user.graduationYear,
    skills: user.skills,
  };
}

// GET /api/profile - account info + career details for the logged in user
router.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId as string } });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(selectFields(user));
});

// PUT /api/profile - update account info + career details.
// name/email are required (same as before), everything else is optional -
// these are filled in after signup, not required to have an account.
router.put("/", async (req, res) => {
  const { name, email, targetRole, experienceLevel, education, graduationYear, skills } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  // if they're changing the email, make sure nobody else already has it
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== req.userId) {
    return res.status(400).json({ error: "An account with this email already exists" });
  }

  const user = await prisma.user.update({
    where: { id: req.userId as string },
    data: {
      name,
      email,
      targetRole: targetRole || null,
      experienceLevel: experienceLevel || null,
      education: education || null,
      graduationYear: graduationYear ? Number(graduationYear) : null,
      skills: Array.isArray(skills) ? skills : [],
    },
  });

  res.json(selectFields(user));
});

// PUT /api/profile/password - check the current password, then set the new one
router.put("/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId as string } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordMatches) {
    return res.status(400).json({ error: "Current password is wrong" });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: req.userId as string },
    data: { passwordHash },
  });

  res.json({ message: "Password updated" });
});

export default router;
