import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import applicationsRoutes from "./routes/applications.routes";
import resumesRoutes from "./routes/resumes.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import profileRoutes from "./routes/profile.routes";

// the express app itself, separate from index.ts's app.listen() call -
// this way the test files can import the app and hit it with supertest
// without actually starting a server on a port
const app = express();

app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// so uploaded resume PDFs can be opened directly via their fileUrl
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/applications", applicationsRoutes);
app.use("/api/resumes", resumesRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);

export default app;
