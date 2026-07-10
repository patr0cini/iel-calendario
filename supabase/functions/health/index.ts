// GET /health (PROMPT.md sections 4 & 6).
//
// Keep-alive + real database touch: performs an actual read through the
// service_role so the Supabase free-tier project is not paused after 7 idle
// days. Called by .github/workflows/keepalive.yml every 6 hours.
//
// In a later phase this endpoint also triggers /sync when there are pending
// events (PROMPT §7). For now it just proves the database is reachable.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const headers = {
    ...cors,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // A real read so Supabase counts database activity.
    const { error } = await db.from("ministries").select("id").limit(1);
    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, ts: new Date().toISOString() }),
      { status: 200, headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers,
    });
  }
});
