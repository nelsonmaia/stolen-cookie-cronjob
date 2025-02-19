import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_TOKEN = process.env.AUTH0_TOKEN;

export async function GET() {
  try {
    console.log("⏰ Running Manual Cleanup Job...");

    // Step 1: Fetch stolen cookies from "spycloud" table
    const { data: stolenCookies, error: stolenError } = await supabase
      .from("spycloud")
      .select("stolen_cookie");

    if (stolenError) {
      console.error("❌ Error fetching stolen cookies:", stolenError);
      return NextResponse.json({ error: "Failed to fetch stolen cookies" }, { status: 500 });
    }

    if (!stolenCookies || stolenCookies.length === 0) {
      console.log("✅ No stolen cookies found, exiting.");
      return NextResponse.json({ message: "No stolen cookies found" });
    }

    console.log(`🚨 Found ${stolenCookies.length} stolen cookies. Searching for matches...`);

    // Step 2: Fetch all Auth0 cookies
    const { data: authCookies, error: authError } = await supabase
      .from("auth0_cookies")
      .select("id, value, session_id");

    if (authError) {
      console.error("❌ Error fetching auth0 cookies:", authError);
      return NextResponse.json({ error: "Failed to fetch auth0 cookies" }, { status: 500 });
    }

    if (!authCookies || authCookies.length === 0) {
      console.log("✅ No auth0 cookies found, exiting.");
      return NextResponse.json({ message: "No auth0 cookies found" });
    }

    console.log(`🔎 Checking ${authCookies.length} auth0 cookies against stolen data...`);

    // Step 3: Find matching cookies
    const matchingCookies = authCookies.filter((authCookie) =>
      stolenCookies.some((stolen) => stolen.stolen_cookie === authCookie.value)
    );

    if (matchingCookies.length === 0) {
      console.log("✅ No matching cookies found.");
      return NextResponse.json({ message: "No matching sessions found for deletion." });
    }

    console.log(`⚠️ Found ${matchingCookies.length} matching sessions. Deleting...`);

    let deletedSessions = 0;

    for (const cookie of matchingCookies) {
      const sessionId = cookie.session_id;
      if (!sessionId) continue;

      try {
        const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/sessions/${sessionId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${AUTH0_TOKEN}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          console.log(`✅ Successfully deleted session: ${sessionId}`);

          // Remove from Supabase after successful deletion
          const { error: deleteError } = await supabase
            .from("auth0_cookies")
            .delete()
            .eq("session_id", sessionId);

          if (deleteError) {
            console.error("❌ Error deleting session from Supabase:", deleteError);
          } else {
            deletedSessions++;
          }
        } else {
          console.error(`❌ Failed to delete session ${sessionId}:`, await response.text());
        }
      } catch (error) {
        console.error(`❌ Error deleting session ${sessionId}:`, error);
      }
    }

    console.log(`🗑️ Successfully deleted ${deletedSessions} sessions.`);
    return NextResponse.json({ message: `Deleted ${deletedSessions} matching sessions.` });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
