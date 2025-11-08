# Phase 2 Testing Guide

## What Was Fixed
React state timing issue - `isPhase2Enabled` state wasn't updating fast enough for the VLM interval callback. Now using `isPhase2EnabledRef` for synchronous checks (same pattern as `isDetectingRef`).

## Test Steps

### Test 1: Enable Phase 2 During Detection
1. Open http://localhost:3000/realtime-stream
2. Open browser console (F12)
3. Click **"Start Detection"**
4. Wait for green skeleton to appear
5. Toggle **"Enable Phase 2 (VLM Analysis)"** to ON (green)

**Expected console logs (should appear immediately):**
```
🔄 Toggle clicked - changing Phase 2 from false to true
✅ Detection is running, processing toggle...
🚀 Enabling Phase 2 during detection
⏱️ VLM interval created: <interval_id>
```

**Expected console logs (every 3 seconds):**
```
🔍 VLM interval fired - checking conditions: {hasCanvas: true, isPhase2EnabledRef: true, isDetectingRef: true, vlmIntervalExists: true}
📸 Sending frame to VLM for analysis...
🤖 Calling Gemini 1.5 Flash API...
📥 Raw Gemini response: {...}
✅ VLM detected X event(s)
```

### Test 2: Start Detection with Phase 2 Pre-Enabled
1. Refresh page
2. Toggle **"Enable Phase 2"** to ON (while detection is NOT running)
3. Click **"Start Detection"**

**Expected behavior:**
- VLM should start automatically after 3 seconds
- Same console logs as Test 1 should appear

### Test 3: Visual Confirmation
Once VLM is running, you should see:
- **VLM Status**: Shows "Active" (green text)
- **Purple events** in the events panel (if Gemini detects anything)
- Events will have:
  - Purple border (instead of red)
  - "Phase 2" badge
  - "VLM Analysis" source label
  - Higher confidence (90% vs 85%)

### Test 4: Graceful Degradation
1. Enable Phase 2
2. Watch for any errors in console
3. If Gemini API fails, you should see:
  - Yellow warning banner at top
  - "Phase 1 detection continues normally" message
  - Green skeleton still working
  - Fall detection still triggering red events

## Troubleshooting

### If you see: "❌ VLM check failed - aborting analysis"
The debug log will show which condition failed:
- `hasCanvas: false` → Canvas not rendering (check if detection started)
- `isPhase2EnabledRef: false` → Toggle not actually enabled (click it again)
- `isDetectingRef: false` → Detection stopped (click Start Detection)

### If you see: "API key not configured"
Check `.env.local` has:
```
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyDCOcMBslmm7KYgQdOOVxiDZPTU655T9ck
```
Then restart dev server: `npm run dev`

### If you see: "Invalid API key"
The API key in `.env.local` may be incorrect or expired.
Get a new one at: https://aistudio.google.com/app/apikey

## Success Criteria ✅

You'll know it's working when:
- [ ] Console shows "🔍 VLM interval fired" every 3 seconds
- [ ] Console shows "📸 Sending frame to VLM"
- [ ] Console shows "🤖 Calling Gemini 1.5 Flash API"
- [ ] VLM Status shows "Active" (green)
- [ ] Purple events appear in the panel (when something is detected)
- [ ] Both red (Phase 1) and purple (Phase 2) events can coexist
- [ ] Toggle can be switched ON/OFF during detection smoothly

## What Changed in the Code

**Before (broken):**
```typescript
// analyzeFrameWithVLM checked state (asynchronous)
if (!isPhase2Enabled || !isDetecting) return;
```

**After (fixed):**
```typescript
// Now checks refs (synchronous)
if (!isPhase2EnabledRef.current || !isDetectingRef.current) return;
```

This matches the pattern used for the detection loop and solves the React state timing issue.
