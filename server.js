import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Resend } from 'resend';

dotenv.config({ path: '.env.local' });

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

// Initialize Resend for email alerts
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Simple AI response generator based on analytics data
const generateAIResponse = (message, analyticsData) => {
  const lowerMessage = message.toLowerCase();

  // Total detections
  if (lowerMessage.includes('how many') && (lowerMessage.includes('detection') || lowerMessage.includes('incident'))) {
    return `I've found a total of **${analyticsData.totalDetections} detections** in the system. This includes ${analyticsData.activeNotifications} active notifications and ${analyticsData.reportedIncidents} reported incidents. Out of these, **${analyticsData.highRiskCount} are high-risk alerts** that require immediate attention.`;
  }

  // High risk alerts
  if (lowerMessage.includes('high risk') || lowerMessage.includes('alert')) {
    const percentage = analyticsData.totalDetections > 0
      ? ((analyticsData.highRiskCount / analyticsData.totalDetections) * 100).toFixed(1)
      : 0;
    return `There are currently **${analyticsData.highRiskCount} high-risk alerts** (${percentage}% of total detections). High-risk alerts include THEFT, FIGHT, and ROBBERY incidents that require immediate security response.`;
  }

  // Camera-related queries
  if (lowerMessage.includes('camera') || lowerMessage.includes('cam')) {
    if (lowerMessage.includes('most') || lowerMessage.includes('top')) {
      return `**Camera ${analyticsData.topCamera.id}** has captured the most detections with **${analyticsData.topCamera.count} incidents**. This camera appears to be monitoring a high-activity area that may require additional security attention.`;
    }

    if (lowerMessage.includes('active') || lowerMessage.includes('online')) {
      return `Currently, **9 out of 13 cameras** are active and monitoring. 4 cameras are offline and may need maintenance.`;
    }

    // Show all camera activity
    const cameraList = Object.entries(analyticsData.detectionsByCamera)
      .sort(([, a], [, b]) => b - a)
      .map(([id, count]) => `Camera ${id}: ${count} incident${count !== 1 ? 's' : ''}`)
      .join(', ');

    return `Here's the breakdown of detections by camera: ${cameraList || 'No detections yet'}. Camera ${analyticsData.topCamera.id} is showing the highest activity.`;
  }

  // Detection types
  if (lowerMessage.includes('type') || lowerMessage.includes('kind')) {
    const typesList = Object.entries(analyticsData.detectionsByType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => `**${type}**: ${count}`)
      .join(', ');

    return `The detection types identified are: ${typesList || 'No detections yet'}. The most common type is ${Object.entries(analyticsData.detectionsByType).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'}.`;
  }

  // Recent detections
  if (lowerMessage.includes('recent') || lowerMessage.includes('latest') || lowerMessage.includes('last')) {
    if (analyticsData.recentDetections.length === 0) {
      return "There are no recent detections to report.";
    }

    const recent = analyticsData.recentDetections.slice(0, 5)
      .map(d => `${d.type} on Camera ${d.cameraId} (${d.confidence}% confidence)`)
      .join(', ');

    return `The 5 most recent detections are: ${recent}. All incidents are being monitored and logged for security review.`;
  }

  // Statistics/summary
  if (lowerMessage.includes('stat') || lowerMessage.includes('summary') || lowerMessage.includes('overview')) {
    const topType = Object.entries(analyticsData.detectionsByType).sort(([, a], [, b]) => b - a)[0];
    return `**ViewGuard System Overview:**

📊 Total Detections: ${analyticsData.totalDetections}
🚨 High Risk Alerts: ${analyticsData.highRiskCount}
📹 Top Camera: Camera ${analyticsData.topCamera.id} (${analyticsData.topCamera.count} incidents)
⚠️ Most Common Threat: ${topType?.[0] || 'N/A'} (${topType?.[1] || 0} incidents)
📝 Active Notifications: ${analyticsData.activeNotifications}
✅ Reported Incidents: ${analyticsData.reportedIncidents}

The system is actively monitoring and all high-priority alerts are being tracked.`;
  }

  // Active vs reported
  if (lowerMessage.includes('report') && !lowerMessage.includes('camera')) {
    return `Out of ${analyticsData.totalDetections} total detections, **${analyticsData.reportedIncidents} have been reported** and ${analyticsData.activeNotifications} are still active notifications awaiting review.`;
  }

  // Default response with suggestions
  return `I can help you with information about your surveillance system. Here are some things you can ask me:

• "How many detections have been found so far?"
• "Which camera has the most detections?"
• "How many high risk alerts are there?"
• "What types of incidents have been detected?"
• "Show me recent detections"
• "Give me a system overview"

What would you like to know?`;
};

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, analyticsData } = req.body;

    if (!message || !analyticsData) {
      return res.status(400).json({ error: 'Message and analytics data are required' });
    }

    console.log('📥 Received chat request:', message);

    // Generate AI response
    const response = generateAIResponse(message, analyticsData);

    console.log('✅ Response generated');

    res.json({
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({
      error: 'Failed to process chat request',
      details: error.message
    });
  }
});

// Gemini VLM Analysis endpoint (Phase 2 detection)
app.post('/api/analyze-vlm', async (req, res) => {
  try {
    const { frameDataUrl, audioTranscript, poseData, timestamp } = req.body;

    if (!frameDataUrl) {
      return res.status(400).json({ error: 'Frame data is required' });
    }

    console.log('🔍 Running VLM analysis for timestamp:', timestamp);

    // Initialize Gemini Flash model for multimodal analysis
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    // Prepare the enhanced prompt with unconscious person priority
    let prompt = `You are an expert AI security system. Analyze the following data sources to quickly identify dangerous events:

`;

    if (audioTranscript) {
      prompt += `AUDIO TRANSCRIPT: "${audioTranscript}"\n\n`;
    }

    if (poseData && poseData.length > 0) {
      prompt += `POSE DATA: ${poseData.length} person(s) detected with keypoint positions\n\n`;
    }

    prompt += `DANGEROUS EVENTS TO DETECT (in priority order):
1. UNCONSCIOUS PERSON - Head tilted back, eyes closed, no movement, collapsed posture
   • Look for: head tilted backward at extreme angle, limp body, unresponsive appearance
   • Pose clues: nose keypoint very high, low shoulder/hip positions, horizontal body
2. Medical emergencies - Seizure, chest pain, difficulty breathing, choking
3. Falls & injuries - Person fallen, lying on ground, bleeding, not moving
4. Violence - Fighting, physical assault, weapons, threatening gestures
5. Distress signals - Screaming "help", panic gestures, fainting, hands raised in surrender
6. Security threats - Shoplifting, vandalism, trespassing, suspicious behavior

INSTRUCTIONS:
- Use ALL data sources together for fast confirmation
- Audio transcript provides instant context (screams, calls for help, threats)
- Pose data shows body positioning:
  • Unconscious: nose keypoint very high Y (head back), horizontal body orientation
  • Fallen: low nose Y position, horizontal shoulder/hip alignment
  • Distress: wrists above shoulders (hands raised), vertical body
- Video frame confirms visual details (facial expression, body posture, environmental context)
- PRIORITY: Unconscious person detection is CRITICAL - if you see head tilted back with limp posture, always flag it
- Respond in <2 seconds by combining evidence from all sources

Provide your analysis in JSON format with the following structure:
{
  "threatDetected": boolean,
  "category": "unconscious" | "medical" | "fall" | "violence" | "distress" | "theft" | "vandalism" | "suspicious" | "none",
  "confidence": number (0-1),
  "description": "Brief description of what you observe",
  "explanation": "Detailed explanation combining all evidence"
}`;

    // Convert base64 data URL to proper format for Gemini
    const base64Data = frameDataUrl.split(',')[1];

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      },
      { text: prompt }
    ]);

    const response = await result.response;
    const text = response.text();

    console.log('✅ VLM analysis complete');

    // Try to parse JSON response
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('⚠️ Failed to parse JSON, using raw response');
      analysis = {
        threatDetected: false,
        category: 'none',
        confidence: 0.5,
        description: text.substring(0, 200),
        explanation: text
      };
    }

    res.json({
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ VLM Analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze frame',
      details: error.message
    });
  }
});

// Email Alert endpoint
app.post('/api/send-alert', async (req, res) => {
  try {
    const { detectionType, description, timestamp, frameDataUrl, cameraId } = req.body;

    if (!detectionType || !description) {
      return res.status(400).json({ error: 'Detection type and description are required' });
    }

    console.log('📧 Sending email alert for:', detectionType);

    const emailFrom = process.env.ALERT_EMAIL_FROM || 'onboarding@resend.dev';
    const emailTo = process.env.ALERT_EMAIL_TO;

    if (!emailTo) {
      return res.status(400).json({ error: 'ALERT_EMAIL_TO not configured in .env.local' });
    }

    // Prepare email HTML
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 8px 8px; }
    .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
    .details { background: white; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .frame-image { max-width: 100%; border-radius: 4px; margin: 15px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚨 ViewGuard Security Alert</h1>
      <p style="margin: 0;">Detection Type: <strong>${detectionType.toUpperCase()}</strong></p>
    </div>
    <div class="content">
      <div class="alert-box">
        <h2 style="margin-top: 0;">⚠️ Incident Detected</h2>
        <p><strong>Description:</strong> ${description}</p>
      </div>

      <div class="details">
        <h3>Incident Details</h3>
        <ul>
          <li><strong>Camera ID:</strong> ${cameraId || 'Webcam'}</li>
          <li><strong>Detection Time:</strong> ${new Date(timestamp).toLocaleString()}</li>
          <li><strong>Detection Type:</strong> ${detectionType}</li>
        </ul>
      </div>

      ${frameDataUrl ? `
      <div>
        <h3>Frame Capture</h3>
        <img src="${frameDataUrl}" alt="Security Frame" class="frame-image" />
      </div>
      ` : ''}

      <div class="footer">
        <p>This is an automated alert from ViewGuard AI Security System</p>
        <p>Generated at ${new Date().toLocaleString()}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const emailResult = await resend.emails.send({
      from: emailFrom,
      to: emailTo,
      subject: `🚨 ViewGuard Alert: ${detectionType.toUpperCase()} Detected`,
      html: htmlContent
    });

    console.log('✅ Email alert sent successfully:', emailResult.id);

    res.json({
      success: true,
      emailId: emailResult.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Email alert error:', error);
    res.status(500).json({
      error: 'Failed to send email alert',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ViewGuard AI Server is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 ViewGuard AI Server running on http://localhost:${PORT}`);
  console.log(`🤖 AI Assistant ready to answer analytics questions`);
  console.log(`🔍 Gemini VLM Analysis endpoint: /api/analyze-vlm`);
  console.log(`📧 Email Alerts endpoint: /api/send-alert`);
});
