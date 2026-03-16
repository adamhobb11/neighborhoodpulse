/**
 * POST /api/briefing
 *
 * Generates an AI-powered briefing for a specific district.
 * Uses Claude API if ANTHROPIC_API_KEY is set, otherwise falls back to local generation.
 */

import { NextResponse } from "next/server";
import { generateAIBriefing } from "@/lib/scoring/briefing";
import type { District, DistrictScores, DistrictRawData } from "@/lib/data/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { district, scores, raw } = body as {
      district: District;
      scores: DistrictScores;
      raw: DistrictRawData;
    };

    if (!district || !scores || !raw) {
      return NextResponse.json(
        { error: "Missing required fields: district, scores, raw" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const briefing = await generateAIBriefing(district, scores, raw, apiKey);

    return NextResponse.json({
      briefing,
      source: apiKey ? "claude-ai" : "local",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Briefing generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate briefing" },
      { status: 500 }
    );
  }
}
