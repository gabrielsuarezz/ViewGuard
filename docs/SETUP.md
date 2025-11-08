# VigilanteAI - Setup Guide

## Quick Start (Phase 1 Only - No API Keys Required)

Phase 1 works immediately without any configuration:

```bash
npm run dev
```

Visit http://localhost:3000/realtime-stream and click "Start Detection".

## Phase 2 Setup (VLM Analysis)

To enable Phase 2 VLM analysis with Google Gemini, follow these steps:

### 1. Get Google Gemini API Key

1. Visit https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy your API key

### 2. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` in your editor

3. Add your Gemini API key:
   ```
   GOOGLE_GENERATIVE_AI_API_KEY=your_actual_api_key_here
   ```

### 3. Restart Development Server

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

### 4. Enable Phase 2 in UI

1. Visit http://localhost:3000/realtime-stream
2. Toggle "Enable Phase 2 (VLM Analysis)" to ON (green)
3. Click "Start Detection"
4. Watch for purple "Phase 2" events in the events panel

### 5. Verify It's Working

Check the browser console for these messages:
- `🚀 Starting Phase 2 VLM analysis (3-second interval)`
- `📸 Sending frame to VLM for analysis...`
- `✅ VLM detected X event(s)`

## Email Alerts Setup (Optional)

To enable email alerts for dangerous events:

### 1. Get Resend API Key

1. Visit https://resend.com/signup
2. Create an account (free tier available)
3. Go to https://resend.com/api-keys
4. Create a new API key
5. Copy your API key

### 2. Configure Email Settings

Add to `.env.local`:

```bash
RESEND_API_KEY=your_resend_api_key_here
ALERT_EMAIL_FROM=alerts@yourdomain.com
ALERT_EMAIL_TO=security@yourdomain.com
```

**Important**: For Resend free tier, you need to verify your sender domain or use their test domain.

### 3. Restart Server and Test

```bash
npm run dev
```

When Phase 2 detects a dangerous event, you'll see:
- `📧 Email alert sent successfully` in console
- Email delivered to configured recipient

## Testing Phase 2

### Test VLM Analysis

1. Enable Phase 2 toggle
2. Start detection
3. Position yourself in camera view
4. Try different scenarios:
   - Standing normally → No dangerous events
   - Lying down → May detect fall/medical emergency
   - Aggressive gestures → May detect violence/threats
5. Check events panel for purple "Phase 2" events

### Test Graceful Degradation

**This is critical for hackathon demos!**

1. **Invalid API Key Test**:
   ```bash
   # In .env.local, set an invalid key
   GOOGLE_GENERATIVE_AI_API_KEY=invalid_key
   ```

2. Restart dev server: `npm run dev`

3. Enable Phase 2 and start detection

4. **Expected behavior**:
   - Yellow warning banner: "Phase 2 Warning: Invalid API key"
   - VLM status shows "Error" (red)
   - **Phase 1 keeps working!** Fall detection continues normally
   - Heuristic events still appear (red-bordered)

5. **Reset**:
   - Add valid API key back
   - Restart server
   - Phase 2 should work again

## Troubleshooting

### Phase 2 Not Activating

**Problem**: Toggle is on but status shows "Inactive"

**Solutions**:
- Check `.env.local` exists and has valid `GOOGLE_GENERATIVE_AI_API_KEY`
- Restart dev server after changing environment variables
- Check browser console for errors

### API Quota Exceeded

**Problem**: "API quota exceeded" error

**Solutions**:
- Free tier has rate limits
- Wait a few minutes before retrying
- Reduce testing frequency
- Consider upgrading API plan for demos

### Email Alerts Not Working

**Problem**: No emails received

**Solutions**:
- Verify `RESEND_API_KEY` is correct
- Check sender domain is verified with Resend
- Look for console warnings: "⚠️ Email alert failed"
- Emails only sent for **dangerous** events (check event.isDangerous)

### Phase 1 Stopped Working

**Problem**: Fall detection not triggering

**Solutions**:
- This should NEVER happen - Phase 1 is independent
- Check browser console for TensorFlow.js errors
- Verify webcam access is granted
- Clear browser cache and reload
- Ensure you're moving rapidly downward while horizontal

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     VigilanteAI                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1 (Browser)          Phase 2 (Server)               │
│  ┌──────────────┐            ┌──────────────┐             │
│  │ TensorFlow.js│            │ Gemini VLM   │             │
│  │ MoveNet      │            │ 1.5 Flash    │             │
│  │ 10 FPS       │            │ 3-sec        │             │
│  │ Heuristic    │            │ interval     │             │
│  └──────┬───────┘            └──────┬───────┘             │
│         │                           │                       │
│         ├─────────┬─────────────────┤                      │
│         │         │                 │                       │
│    Fall Events  Video            VLM Events                │
│    (red)        Frame            (purple)                  │
│                   │                 │                       │
│                   └────────┬────────┘                      │
│                            │                                │
│                    ┌───────▼────────┐                      │
│                    │ Email Alerts   │                      │
│                    │ (optional)     │                      │
│                    └────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Performance Notes

- **Phase 1**: ~10 FPS, <100ms latency
- **Phase 2**: Analyzes every 3 seconds, ~1-2 second API latency
- **Memory**: Stable with cleanup on unmount
- **API Costs**: Gemini Flash is very cheap (~$0.00001 per frame)

## Hackathon Demo Tips

1. **Start with Phase 1 only** for stable demo
2. Enable Phase 2 to show advanced AI capabilities
3. If Phase 2 fails, **emphasize Phase 1 still works** (graceful degradation)
4. Show purple VLM events vs red heuristic events
5. Demonstrate email alerts if configured

## Next Steps

- Add more event types to VLM prompt
- Implement face detection with BlazeFace model
- Add session recording and playback
- Create admin dashboard for event history

## Support

For issues or questions:
- Check `CLAUDE.md` for detailed architecture documentation
- Review browser console for error messages
- Test with Phase 1 only to isolate Phase 2 issues
