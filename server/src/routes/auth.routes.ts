import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

const SALT_ROUNDS = 10;

// how long the login stays valid for. Keeping it simple - 7 days.
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function generateToken(userId: string) {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "7d" });
}

// same cookie options used for both login and signup so they don't drift apart
function setTokenCookie(res: import("express").Response, token: string) {
  const isProduction = process.env.NODE_ENV === "production";

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_MS,
    // frontend (vercel) and backend (render) are on different domains in prod,
    // so the cookie needs sameSite "none" to be sent cross-site. browsers only
    // allow sameSite "none" if secure is also true, so these have to match -
    // in local dev both stay off since frontend/backend share localhost anyway
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}

router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are all required" });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = generateToken(user.id);
  setTokenCookie(res, token);

  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(400).json({ error: "Wrong password" });
  }

  const token = generateToken(user.id);
  setTokenCookie(res, token);

  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

router.get("/me", authMiddleware, async (req, res) => {
  // authMiddleware already checked the token, req.userId is set
  const user = await prisma.user.findUnique({ where: { id: req.userId as string } });

  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

export default router;
