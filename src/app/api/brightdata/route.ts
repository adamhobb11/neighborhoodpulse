/**
 * POST /api/brightdata
 *
 * Server-side proxy for Bright Data Web Unlocker API.
 * Keeps the API key secure — never exposed to the browser.
 *
 * Request body:
 *   { url: string; method?: "GET"|"POST"; body?: string; format?: "raw"|"json" }
 *
 * Response:
 *   { content: string; status: number; fetchedAt: string }
 */

import { NextResponse } from "next/server";

const BRIGHTDATA_ENDPOINT = "https://api.brightdata.com/request";

export async function POST(request: Request) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "BRIGHTDATA_API_KEY not configured" },
      { status: 503 }
    );
  }

  let body: { url?: string; method?: string; body?: string; format?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, method = "GET", body: requestBody, format = "raw" } = body;
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const bdPayload: Record<string, unknown> = {
    zone: process.env.BRIGHTDATA_ZONE || "web_unlocker",
    url,
    format,
  };

  // Support POST request proxying (for JSON APIs behind bot-protection)
  if (method === "POST" && requestBody) {
    bdPayload.method = "POST";
    bdPayload.body = requestBody;
  }

  try {
    const bdResponse = await fetch(BRIGHTDATA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bdPayload),
    });

    if (!bdResponse.ok) {
      const errText = await bdResponse.text();
      throw new Error(`Bright Data error ${bdResponse.status}: ${errText.slice(0, 200)}`);
    }

    const content = await bdResponse.text();

    return NextResponse.json({
      content,
      status: bdResponse.status,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Bright Data proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape failed" },
      { status: 502 }
    );
  }
}
