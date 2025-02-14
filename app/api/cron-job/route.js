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
    console.log("⏰ Running Cron Job...");

    // Step 1: Fetch all records from the `auth0_cookies` table
    const { data: cookies, error } = await supabase.from("auth0_cookies").select("*");

    if (error) {
      console.error("❌ Error fetching cookies:", error);
      return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
    }

    if (!cookies || cookies.length === 0) {
      console.log("✅ No cookies found, exiting.");
      return NextResponse.json({ message: "No cookies found" });
    }

    console.log(`🍪 Found ${cookies.length} cookies. Processing...`);

    // Step 2: Iterate over each session and delete it from Auth0
    for (const cookie of cookies) {
      const sessionId = cookie.session_id; // Assuming session ID is stored in `value`

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

            // Step 3: Delete processed records from Supabase
            const { error: deleteError } = await supabase.from("auth0_cookies").delete().neq("id", 0);

            if (deleteError) {
            console.error("❌ Error deleting cookies:", deleteError);
            return NextResponse.json({ error: "Failed to delete records" }, { status: 500 });
            }

            console.log("🗑️ Successfully deleted all processed cookies.");
            

        } else {
          console.error(`❌ Failed to delete session ${sessionId}:`, await response.text());
          return NextResponse.json({ message: `Failed to delete session ${sessionId} ` });

        }
      } catch (error) {
        console.error(`❌ Error deleting session ${sessionId}:`, error);
      }
    }

    return NextResponse.json({ message: `Processed and deleted ${cookies.length} cookies.` });
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
