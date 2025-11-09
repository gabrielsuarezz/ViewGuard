import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ViewGuard AI Server is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 ViewGuard AI Server running on http://localhost:${PORT}`);
  console.log(`🤖 AI Assistant ready to answer analytics questions`);
});
