// single shared PrismaClient instance - reused across all route files
// instead of making a new one every time (that leaks connections)
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
