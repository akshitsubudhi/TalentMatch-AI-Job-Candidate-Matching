import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, PgIngestionRepository } from "@talentmatch/core/db";
import { buildTestApp, makePdf, RESUME_LINES } from "./helpers";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe.skipIf(!TEST_DATABASE_URL)("API + real Postgres", () => {
  let admin: pg.Pool;
  let pool: pg.Pool;
  const dbName = `tm_api_test_${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await admin.query(`create database ${dbName}`);
    const url = new URL(TEST_DATABASE_URL!);
    url.pathname = `/${dbName}`;
    const setup = new pg.Pool({ connectionString: url.toString(), max: 1 });
    await applyMigrations(setup, {
      migrationsDir: path.join(root, "supabase/migrations"),
      localRolesFile: path.join(root, "supabase/local/00_supabase_roles.sql"),
    });
    await setup.end();
    pool = new pg.Pool({ connectionString: url.toString(), max: 5 });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${dbName} with (force)`);
    await admin?.end();
  });

  it("uploading the same PDF twice stores one candidate with its chunks", async () => {
    const { app } = buildTestApp({ repository: new PgIngestionRepository(pool) });
    const pdf = await makePdf(RESUME_LINES);
    const send = () =>
      request(app)
        .post("/v1/candidates")
        .field("fullName", "Synthetic DB Tester")
        .field("location", "Berlin")
        .field("seniority", "senior")
        .attach("file", pdf, { filename: "cv.pdf", contentType: "application/pdf" });
    const first = await send().expect(201);
    const second = await send().expect(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const { rows } = await pool.query("select (select count(*) from candidates)::int as c, (select count(*) from candidate_chunks)::int as k");
    expect(rows[0]).toEqual({ c: 1, k: 1 });
  });

  it("creates jobs idempotently in the database", async () => {
    const { app } = buildTestApp({ repository: new PgIngestionRepository(pool) });
    const body = {
      title: "Platform Engineer",
      description: "Run Kubernetes clusters with Terraform on AWS.",
      location: "Remote",
      seniority: "mid",
      skills: ["k8s", "terraform"],
    };
    const a = await request(app).post("/v1/jobs").send(body).expect(201);
    await request(app).post("/v1/jobs").send(body).expect(200);
    const { rows } = await pool.query("select skills, embedding_model from jobs where id = $1", [a.body.data.id]);
    expect(rows[0]).toEqual({ skills: ["Kubernetes", "Terraform"], embedding_model: "text-embedding-3-small" });
  });
});
