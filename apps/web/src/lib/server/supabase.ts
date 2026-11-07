import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env";

let client: SupabaseClient | undefined;

/**
 * Service-role client. It BYPASSES Row Level Security, so it must only ever run on
 * the server (the `server-only` import makes bundling it into client code a build error).
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const env = serverEnv();
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-client-info": "talentmatch-web" } },
  });
  return client;
}
