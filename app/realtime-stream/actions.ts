"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

// Type definitions
interface PoseKeypoint {
  x: number;
  y: number;
  score: number;
  name?: string;
}

interface VLMEvent {
  timestamp: string;
  description: string;
  isDangerous: boolean;
}

interface DetectionResult {
  success: boolean;
  events: VLMEvent[];
  error?: string;
}

/**
 * Server Action: Analyze frame with Google Gemini VLM
 *
 * This function sends multi-modal data (video frame, audio transcript, and pose keypoints)
 * to Gemini 2.5 Flash for advanced event detection. This multi-modal approach achieves
 * 2-3 second response times by turning slow "analysis" into fast "confirmation".
 *
 * @param frameBase64 - Base64-encoded JPEG image (without data URL prefix)
 * @param audioTranscript - Audio transcript from Web Speech API
 * @param poseKeypoints - Current pose keypoints from MoveNet
 * @param currentTime - Current elapsed time (MM:SS format)
 * @returns Detection result with events or error
 */
export async function detectEventsWithVLM(
  frameBase64: string,
  audioTranscript: string,
  poseKeypoints: PoseKeypoint[],
  currentTime: string
): Promise<DetectionResult> {
  try {
    // Validate API key
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      console.error("❌ GOOGLE_GENERATIVE_AI_API_KEY not configured");
      return {
        success: false,
        events: [],
        error: "API key not configured. Please set GOOGLE_GENERATIVE_AI_API_KEY in .env.local",
      };
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use Gemini 2.5 Flash (latest stable model with vision support)
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });

    // Prepare pose data summary (concise JSON format for fast processing)
    const visibleKeypoints = poseKeypoints.filter((kp) => kp.score > 0.3);
    const keypointsJSON = JSON.stringify(
      visibleKeypoints.map((kp) => ({
        name: kp.name,
        x: Math.round(kp.x),
        y: Math.round(kp.y),
        conf: Math.round(kp.score * 100),
      })),
      null,
      0
    );

    // Multi-modal prompt optimized for speed (HawkWatch strategy)
    // This turns "analysis" into "confirmation" by providing structured data
    const prompt = `MULTI-MODAL SECURITY ANALYSIS
You are an expert AI security system. Analyze the following 3 data sources to quickly confirm if a dangerous event is happening:

1️⃣ VIDEO FRAME: A single frame from live surveillance feed (see attached image)

2️⃣ AUDIO TRANSCRIPT: "${audioTranscript || "No speech detected"}"

3️⃣ POSE DATA (JSON): ${keypointsJSON}

DANGEROUS EVENTS TO DETECT:
- Medical emergencies (unconscious, seizure, chest pain, difficulty breathing)
- Falls & injuries (person fallen, lying on ground, bleeding, not moving)
- Violence (fighting, physical assault, weapons, threatening gestures)
- Distress signals (screaming "help", panic gestures, fainting)
- Security threats (shoplifting, vandalism, trespassing, suspicious behavior)

INSTRUCTIONS:
- Use ALL 3 data sources together for fast confirmation
- Audio transcript provides instant context (screams, calls for help, threats)
- Pose data shows body positioning (fallen = horizontal body, low nose position)
- Video frame confirms visual details
- Respond in <2 seconds by combining evidence from all sources

RESPONSE FORMAT (JSON only, no markdown):
{"events":[{"timestamp":"${currentTime}","description":"Brief event description","isDangerous":true}]}

If scene is normal: {"events":[]}

Timestamp: ${currentTime}`;

    // Convert Base64 to proper format for Gemini
    // Remove data URL prefix if present
    const base64Image = frameBase64.replace(/^data:image\/\w+;base64,/, "");

    // Call Gemini API
    console.log("🤖 Calling Gemini 2.5 Flash API (models/gemini-2.5-flash)...");
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    console.log("📥 Raw Gemini response:", text);
    console.log("📊 Response length:", text.length, "characters");

    // Parse JSON response
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate response structure
      if (!parsed.events || !Array.isArray(parsed.events)) {
        throw new Error("Invalid response structure: missing events array");
      }

      // Validate each event
      const validEvents = parsed.events.filter((event: any) => {
        return (
          event &&
          typeof event.timestamp === "string" &&
          typeof event.description === "string" &&
          typeof event.isDangerous === "boolean"
        );
      });

      if (validEvents.length === 0) {
        console.log("ℹ️ VLM analysis complete - no concerning events detected (scene appears normal)");
      } else {
        console.log(`✅ VLM detected ${validEvents.length} event(s):`);
        validEvents.forEach((event: VLMEvent, idx: number) => {
          console.log(`   ${idx + 1}. [${event.isDangerous ? 'DANGER' : 'INFO'}] ${event.description}`);
        });
      }

      return {
        success: true,
        events: validEvents,
      };
    } catch (parseError) {
      console.error("❌ Failed to parse Gemini response:", parseError);
      return {
        success: false,
        events: [],
        error: `Failed to parse VLM response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      };
    }
  } catch (error: any) {
    console.error("❌ Gemini API error:", error);

    // Provide user-friendly error messages
    let errorMessage = "Unknown error occurred";
    if (error?.message?.includes("API_KEY_INVALID")) {
      errorMessage = "Invalid API key. Please check your GOOGLE_GENERATIVE_AI_API_KEY";
    } else if (error?.message?.includes("QUOTA_EXCEEDED")) {
      errorMessage = "API quota exceeded. Please try again later";
    } else if (error?.message?.includes("RATE_LIMIT")) {
      errorMessage = "Rate limit exceeded. Please wait before retrying";
    } else if (error?.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      events: [],
      error: errorMessage,
    };
  }
}
