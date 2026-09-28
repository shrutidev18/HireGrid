import request from "supertest";
import app from "../app";
import { prisma } from "../config/db";

// unique-ish email so re-running the tests doesn't collide with leftover data
const testEmail = `test_${Date.now()}@example.com`;
const testPassword = "testpass123";

let authCookie: string;
let createdUserId: string;
let createdApplicationId: string;

// clean up whatever this test run created - deleting the application first
// since Application -> User is a required relation (deleting the user first
// would fail with a foreign key error while an application still points to it)
afterAll(async () => {
  if (createdApplicationId) {
    await prisma.application.deleteMany({ where: { id: createdApplicationId } });
  }
  if (createdUserId) {
    await prisma.user.deleteMany({ where: { id: createdUserId } });
  }
  await prisma.$disconnect();
});

describe("auth", () => {
  test("signup works with valid details", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      name: "Test User",
      email: testEmail,
      password: testPassword,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testEmail);

    createdUserId = res.body.user.id;
    // grab the login cookie so later tests can act as this user
    authCookie = res.headers["set-cookie"][0];
  });

  test("login fails with a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: testEmail,
      password: "definitelyWrongPassword",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Wrong password");
  });
});

describe("applications", () => {
  test("creating an application works when logged in", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Cookie", authCookie)
      .send({
        companyName: "Test Co",
        jobTitle: "Test Role",
        jobLocation: "Remote",
        employmentType: "FULL_TIME",
        jobDescription: "just some text for the test",
      });

    expect(res.status).toBe(201);
    expect(res.body.application.companyName).toBe("Test Co");

    createdApplicationId = res.body.application.id;
  });

  test("fetching that application by id returns it", async () => {
    const res = await request(app)
      .get(`/api/applications/${createdApplicationId}`)
      .set("Cookie", authCookie);

    expect(res.status).toBe(200);
    expect(res.body.application.id).toBe(createdApplicationId);
    expect(res.body.application.companyName).toBe("Test Co");
  });
});
