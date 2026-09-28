import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../config/db";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();
router.use(authMiddleware);

const SALT_ROUNDS = 10;

// GET /api/profile - just name + email for the logged in user
router.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId as string } });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({ name: user.name, email: user.email });
});

// PUT /api/profile - update name and email
router.put("/", async (req, res) => {
  const { name, email } = req.body;

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
    data: { name, email },
  });

  res.json({ name: user.name, email: user.email });
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
