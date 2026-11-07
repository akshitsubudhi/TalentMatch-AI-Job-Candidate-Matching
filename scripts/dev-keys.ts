/**
 * LOCAL STACK ONLY: mint the anon and service_role JWTs PostgREST expects, signed
 * with LOCAL_JWT_SECRET. Prints lines to paste into .env. With a real Supabase
 * project, copy the keys from Project Settings → API instead.
 */
import { createHmac, randomBytes } from "node:crypto";
import { loadDotEnv } from "./env";

loadDotEnv();
const secret = process.env.LOCAL_JWT_SECRET ?? randomBytes(32).toString("hex");

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");
function sign(role: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: "talentmatch-local", role, iat: now, exp: now + 60 * 60 * 24 * 365 * 5 }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

if (!process.env.LOCAL_JWT_SECRET) console.log(`LOCAL_JWT_SECRET=${secret}`);
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${sign("anon")}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${sign("service_role")}`);
