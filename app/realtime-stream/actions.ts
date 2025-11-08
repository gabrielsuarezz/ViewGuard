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
 * This function sends a video frame and pose keypoints to Gemini 1.5 Flash
 * for advanced event detection (medical emergencies, fights, distress, etc.)
 *
 * @param frameBase64 - Base64-encoded JPEG image (without data URL prefix)
 * @param poseKeypoints - Current pose keypoints from MoveNet
 * @param currentTime - Current elapsed time (MM:SS format)
 * @returns Detection result with events or error
 */
export async function detectEventsWithVLM(
  frameBase64: string,
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

    // Prepare pose data summary
    const visibleKeypoints = poseKeypoints.filter((kp) => kp.score > 0.3);
    const keypointsSummary = visibleKeypoints
      .map((kp) => `${kp.name}: (${kp.x.toFixed(0)}, ${kp.y.toFixed(0)}) [confidence: ${(kp.score * 100).toFixed(0)}%]`)
      .join("\n");

    // Security expert prompt (based on HawkWatch reference)
    const prompt = `You are a security expert analyzing surveillance footage. Identify concerning situations in these categories:

1. Medical emergencies (unconsciousness, chest pain, seizures, difficulty breathing)
2. Falls and injuries (person falling, lying on ground, visible injuries, bleeding)
3. Distress signals (calls for help, panic, distress gestures, fainting)
4. Violence or threats (fighting, physical altercations, weapons, threatening behavior)
5. Suspicious activities (shoplifting, vandalism, trespassing, unusual behavior)

Current timestamp: ${currentTime}

Pose keypoint data from the frame:
${keypointsSummary}

Analyze this frame and determine if any concerning events are occurring. Consider:
- Body positioning and orientation
- Movement patterns from keypoint data
- Overall scene context
- Potential emergencies or dangerous situations

Respond ONLY with valid JSON in this exact format (no additional text):
{
  "events": [
    {
      "timestamp": "${currentTime}",
      "description": "Brief description of event (max 100 characters)",
      "isDangerous": true or false
    }
  ]
}

If no concerning events are detected, return: {"events": []}`;

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
