# Phase 1 Detection Algorithm Improvements

## Overview
This document outlines improved heuristic detection algorithms for Phase 1 (browser-only, no API calls).

## Improved Detection Types

### 1. Enhanced Fall Detection
**Current Issues:**
- Only tracks nose (unreliable)
- Fixed threshold doesn't adapt to camera setup
- No state tracking

**Improvements:**
```typescript
// Track center of mass (hip midpoint) instead of nose
const leftHip = keypoints.find(kp => kp.name === "left_hip");
const rightHip = keypoints.find(kp => kp.name === "right_hip");
const hipCenter = {
  x: (leftHip.x + rightHip.x) / 2,
  y: (leftHip.y + rightHip.y) / 2
};

// Calculate person height for dynamic thresholds
const personHeight = calculatePersonHeight(keypoints);
const adaptiveThreshold = personHeight * 0.15; // 15% of person height

// Track acceleration (change in velocity)
const acceleration = currentVelocity - previousVelocity;
if (acceleration > adaptiveThreshold) {
  // Sudden acceleration = fall
}

// Multi-stage state machine
// State: STANDING → FALLING → ON_GROUND
```

### 2. Person on Ground Detection
```typescript
// Check if body has been horizontal for extended period
const bodyAngle = calculateBodyAngle(shoulders, hips);
const isHorizontal = Math.abs(bodyAngle) < 30; // degrees from horizontal

const hipHeight = (leftHip.y + rightHip.y) / 2;
const isLowToGround = hipHeight > (canvasHeight * 0.7); // bottom 30% of frame

if (isHorizontal && isLowToGround && timeInPosition > 5000) {
  // Person has been on ground for 5+ seconds
  triggerEvent("Person on ground - possible medical emergency");
}
```

### 3. Hands Raised Detection (Distress/Robbery)
```typescript
const leftWrist = keypoints.find(kp => kp.name === "left_wrist");
const rightWrist = keypoints.find(kp => kp.name === "right_wrist");
const leftShoulder = keypoints.find(kp => kp.name === "left_shoulder");
const rightShoulder = keypoints.find(kp => kp.name === "right_shoulder");

const leftHandRaised = leftWrist.y < leftShoulder.y - 50;
const rightHandRaised = rightWrist.y < rightShoulder.y - 50;

if (leftHandRaised && rightHandRaised && timeInPosition > 2000) {
  // Both hands above shoulders for 2+ seconds
  triggerEvent("Hands raised - possible distress or robbery");
}
```

### 4. Aggressive Posture Detection
```typescript
// Wide stance detection
const leftAnkle = keypoints.find(kp => kp.name === "left_ankle");
const rightAnkle = keypoints.find(kp => kp.name === "right_ankle");
const stanceWidth = Math.abs(leftAnkle.x - rightAnkle.x);
const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

const isWideStance = stanceWidth > (shoulderWidth * 2);

// Forward lean detection
const noseToHipDistance = nose.y - hipCenter.y;
const isLeaningForward = noseToHipDistance < (personHeight * 0.3);

// Rapid arm movement
const armVelocity = calculateArmVelocity(wrists);

if (isWideStance && (isLeaningForward || armVelocity > threshold)) {
  triggerEvent("Aggressive posture detected - possible confrontation");
}
```

### 5. Unusual Stillness Detection
```typescript
// Track all keypoint movement
const totalMovement = keypoints.reduce((sum, kp, idx) => {
  const prevKp = previousKeypoints[idx];
  const dx = kp.x - prevKp.x;
  const dy = kp.y - prevKp.y;
  return sum + Math.sqrt(dx * dx + dy * dy);
}, 0);

const averageMovement = totalMovement / keypoints.length;

if (averageMovement < 2 && timeStill > 10000 && wasMovingBefore) {
  // Person suddenly stopped moving for 10+ seconds
  triggerEvent("Unusual stillness - possible medical emergency");
}
```

### 6. Crawling Detection
```typescript
const isBodyHorizontal = bodyAngle < 30;
const isHipLow = hipHeight > (canvasHeight * 0.6);
const handsMoving = calculateHandMovement(wrists) > threshold;

if (isBodyHorizontal && isHipLow && handsMoving) {
  triggerEvent("Person crawling - possible injury");
}
```

## Helper Functions

### Calculate Person Height
```typescript
function calculatePersonHeight(keypoints: Keypoint[]): number {
  const nose = keypoints.find(kp => kp.name === "nose");
  const leftAnkle = keypoints.find(kp => kp.name === "left_ankle");
  const rightAnkle = keypoints.find(kp => kp.name === "right_ankle");

  if (!nose || !leftAnkle || !rightAnkle) return 0;

  const ankleY = Math.max(leftAnkle.y, rightAnkle.y);
  return Math.abs(ankleY - nose.y);
}
```

### Calculate Body Angle
```typescript
function calculateBodyAngle(shoulders: Keypoint[], hips: Keypoint[]): number {
  if (shoulders.length < 2 || hips.length < 2) return 0;

  const shoulderCenter = {
    x: (shoulders[0].x + shoulders[1].x) / 2,
    y: (shoulders[0].y + shoulders[1].y) / 2
  };

  const hipCenter = {
    x: (hips[0].x + hips[1].x) / 2,
    y: (hips[0].y + hips[1].y) / 2
  };

  // Angle from vertical (0 = standing upright, 90 = horizontal)
  const dx = hipCenter.x - shoulderCenter.x;
  const dy = hipCenter.y - shoulderCenter.y;
  const angleRadians = Math.atan2(dx, dy);
  const angleDegrees = (angleRadians * 180) / Math.PI;

  return Math.abs(angleDegrees);
}
```

### Calculate Center of Mass
```typescript
function calculateCenterOfMass(keypoints: Keypoint[]): { x: number, y: number } {
  const torsoPoints = keypoints.filter(kp =>
    kp.name?.includes("hip") ||
    kp.name?.includes("shoulder")
  ).filter(kp => kp.score && kp.score > 0.3);

  if (torsoPoints.length === 0) return { x: 0, y: 0 };

  const sumX = torsoPoints.reduce((sum, kp) => sum + kp.x, 0);
  const sumY = torsoPoints.reduce((sum, kp) => sum + kp.y, 0);

  return {
    x: sumX / torsoPoints.length,
    y: sumY / torsoPoints.length
  };
}
```

## Recommended Implementation Priority

1. **Enhanced Fall Detection** (immediate improvement)
2. **Person on Ground** (catches missed falls)
3. **Hands Raised** (easy to implement, high value)
4. **Unusual Stillness** (catches medical emergencies)
5. **Aggressive Posture** (more complex, but valuable)
6. **Crawling Detection** (nice-to-have)

## Testing Tips

- Test with different distances from camera
- Test with different lighting conditions
- Test with different body types/sizes
- Adjust thresholds based on your specific setup
- Log all detections to tune parameters

## Performance Considerations

- All detections run in browser (no API calls)
- MoveNet already provides 17 keypoints at ~10 FPS
- Additional calculations are minimal (< 1ms per frame)
- Total system remains at ~10 FPS detection rate
