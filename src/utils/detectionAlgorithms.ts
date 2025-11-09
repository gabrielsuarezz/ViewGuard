import { Keypoint } from '@tensorflow-models/pose-detection';
import { Phase1Detection, PoseData } from '@/types/detection';

/**
 * Calculate Euclidean distance between two keypoints
 */
const getDistance = (a: Keypoint, b: Keypoint): number => {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
};

/**
 * Calculate person height from keypoints
 */
export const calculatePersonHeight = (keypoints: Keypoint[]): number => {
  const nose = keypoints.find((kp) => kp.name === 'nose');
  const leftAnkle = keypoints.find((kp) => kp.name === 'left_ankle');
  const rightAnkle = keypoints.find((kp) => kp.name === 'right_ankle');

  if (!nose) return 0;

  // Use the lowest ankle point
  const ankle = leftAnkle && rightAnkle
    ? leftAnkle.y > rightAnkle.y
      ? leftAnkle
      : rightAnkle
    : leftAnkle || rightAnkle;

  if (!ankle) return 0;

  return getDistance(nose, ankle);
};

/**
 * Calculate vertical center position of person
 */
export const calculateCenterY = (keypoints: Keypoint[]): number => {
  const validKeypoints = keypoints.filter((kp) => kp.score && kp.score > 0.3);
  if (validKeypoints.length === 0) return 0;

  const sumY = validKeypoints.reduce((sum, kp) => sum + kp.y, 0);
  return sumY / validKeypoints.length;
};

/**
 * Fall Detection Algorithm
 * Detects sudden drops in vertical position
 */
export class FallDetector {
  private previousPoseData: PoseData | null = null;
  private lastDetectionTime: number = 0;
  private heightDropThreshold: number;
  private velocityThreshold: number;
  private debounceDuration: number;

  constructor(
    heightDropThreshold = 0.3,
    velocityThreshold = 0.02,
    debounceDuration = 3000
  ) {
    this.heightDropThreshold = heightDropThreshold;
    this.velocityThreshold = velocityThreshold;
    this.debounceDuration = debounceDuration;
  }

  detect(poseData: PoseData, currentTime: number): Phase1Detection | null {
    // Debounce check (convert debounceDuration from ms to seconds)
    if (currentTime - this.lastDetectionTime < this.debounceDuration / 1000) {
      this.previousPoseData = poseData;
      return null;
    }

    if (!this.previousPoseData) {
      this.previousPoseData = poseData;
      return null;
    }

    const timeDelta = poseData.timestamp - this.previousPoseData.timestamp;
    if (timeDelta === 0) {
      this.previousPoseData = poseData;
      return null;
    }

    // Calculate vertical velocity
    const centerYDrop = poseData.centerY - this.previousPoseData.centerY;
    const velocity = centerYDrop / timeDelta;

    // Calculate height drop ratio
    const heightDrop = poseData.centerY - this.previousPoseData.centerY;
    const heightDropRatio =
      this.previousPoseData.personHeight > 0
        ? heightDrop / this.previousPoseData.personHeight
        : 0;

    // Detect fall: significant height drop and high downward velocity
    if (
      heightDropRatio > this.heightDropThreshold &&
      velocity > this.velocityThreshold
    ) {
      this.lastDetectionTime = currentTime;
      this.previousPoseData = poseData;

      return {
        type: 'fall',
        timestamp: currentTime,
        confidence: Math.min(heightDropRatio, 1),
        description: `Fall detected - ${(heightDropRatio * 100).toFixed(0)}% height drop`,
        keypoints: poseData.keypoints,
      };
    }

    this.previousPoseData = poseData;
    return null;
  }

  reset() {
    this.previousPoseData = null;
    this.lastDetectionTime = 0;
  }
}

/**
 * Person on Ground Detection Algorithm
 * Detects when someone is lying on the ground
 */
export class GroundDetector {
  private lastDetectionTime: number = 0;
  private heightThreshold: number;
  private debounceDuration: number;

  constructor(heightThreshold = 0.25, debounceDuration = 5000) {
    this.heightThreshold = heightThreshold;
    this.debounceDuration = debounceDuration;
  }

  detect(poseData: PoseData, currentTime: number): Phase1Detection | null {
    // Debounce check (convert debounceDuration from ms to seconds)
    if (currentTime - this.lastDetectionTime < this.debounceDuration / 1000) {
      return null;
    }

    const nose = poseData.keypoints.find((kp) => kp.name === 'nose');
    const leftShoulder = poseData.keypoints.find((kp) => kp.name === 'left_shoulder');
    const rightShoulder = poseData.keypoints.find((kp) => kp.name === 'right_shoulder');

    if (!nose || !leftShoulder || !rightShoulder) {
      return null;
    }

    // Check if shoulders are roughly at nose level (horizontal orientation)
    const shoulderNoseDistance =
      Math.abs(leftShoulder.y - nose.y) + Math.abs(rightShoulder.y - nose.y);
    const avgShoulderDistance = shoulderNoseDistance / 2;

    // Normalized by person height
    const normalizedDistance =
      poseData.personHeight > 0 ? avgShoulderDistance / poseData.personHeight : 1;

    // Person on ground if shoulders are very close to nose level
    if (normalizedDistance < this.heightThreshold) {
      this.lastDetectionTime = currentTime;

      return {
        type: 'ground',
        timestamp: currentTime,
        confidence: 1 - normalizedDistance,
        description: 'Person detected on ground',
        keypoints: poseData.keypoints,
      };
    }

    return null;
  }

  reset() {
    this.lastDetectionTime = 0;
  }
}

/**
 * Hands Raised Detection Algorithm
 * Detects when both hands are raised above shoulders
 */
export class HandsRaisedDetector {
  private lastDetectionTime: number = 0;
  private shoulderHeightThreshold: number;
  private debounceDuration: number;

  constructor(shoulderHeightThreshold = 1.1, debounceDuration = 5000) {
    this.shoulderHeightThreshold = shoulderHeightThreshold;
    this.debounceDuration = debounceDuration;
  }

  detect(poseData: PoseData, currentTime: number): Phase1Detection | null {
    // Debounce check (convert debounceDuration from ms to seconds)
    if (currentTime - this.lastDetectionTime < this.debounceDuration / 1000) {
      return null;
    }

    const leftWrist = poseData.keypoints.find((kp) => kp.name === 'left_wrist');
    const rightWrist = poseData.keypoints.find((kp) => kp.name === 'right_wrist');
    const leftShoulder = poseData.keypoints.find((kp) => kp.name === 'left_shoulder');
    const rightShoulder = poseData.keypoints.find((kp) => kp.name === 'right_shoulder');

    // Need at least one wrist and corresponding shoulder
    if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) {
      return null;
    }

    // Check if wrists have sufficient confidence
    if (
      (leftWrist.score && leftWrist.score < 0.3) ||
      (rightWrist.score && rightWrist.score < 0.3)
    ) {
      return null;
    }

    // Calculate average shoulder Y position
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    // Check if both wrists are above shoulders
    const leftWristAboveShoulder = leftWrist.y < avgShoulderY;
    const rightWristAboveShoulder = rightWrist.y < avgShoulderY;

    if (leftWristAboveShoulder && rightWristAboveShoulder) {
      // Calculate how far above shoulders
      const leftHeight = avgShoulderY - leftWrist.y;
      const rightHeight = avgShoulderY - rightWrist.y;
      const avgHeight = (leftHeight + rightHeight) / 2;

      // Normalized by shoulder width for scale invariance
      const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
      const normalizedHeight = shoulderWidth > 0 ? avgHeight / shoulderWidth : 0;

      // Detect if hands are significantly raised
      if (normalizedHeight > this.shoulderHeightThreshold) {
        this.lastDetectionTime = currentTime;

        return {
          type: 'hands_raised',
          timestamp: currentTime,
          confidence: Math.min(normalizedHeight / 2, 1),
          description: 'Hands raised above head detected',
          keypoints: poseData.keypoints,
        };
      }
    }

    return null;
  }

  reset() {
    this.lastDetectionTime = 0;
  }
}

/**
 * Unconscious Person Detection Algorithm
 * Detects when head is tilted back for extended period (possible unconsciousness)
 */
export class UnconsciousDetector {
  private headTiltStartTime: number = 0;
  private lastDetectionTime: number = 0;
  private tiltThreshold: number;
  private debounceDuration: number;

  constructor(tiltThreshold = 0.20, debounceDuration = 10000) {
    this.tiltThreshold = tiltThreshold; // 20% of person height
    this.debounceDuration = debounceDuration;
  }

  detect(poseData: PoseData, currentTime: number): Phase1Detection | null {
    // Debounce check (convert debounceDuration from ms to seconds)
    if (currentTime - this.lastDetectionTime < this.debounceDuration / 1000) {
      return null;
    }

    const nose = poseData.keypoints.find((kp) => kp.name === 'nose');
    const leftEye = poseData.keypoints.find((kp) => kp.name === 'left_eye');
    const rightEye = poseData.keypoints.find((kp) => kp.name === 'right_eye');
    const leftShoulder = poseData.keypoints.find((kp) => kp.name === 'left_shoulder');
    const rightShoulder = poseData.keypoints.find((kp) => kp.name === 'right_shoulder');

    if (!nose || !leftShoulder || !rightShoulder) {
      this.headTiltStartTime = 0;
      return null;
    }

    // Calculate shoulder center
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;

    // Check if head is tilted back: nose should be ABOVE shoulders (lower Y value)
    const headTiltThresholdPx = poseData.personHeight * this.tiltThreshold;
    const noseAboveShoulders = shoulderCenterY - nose.y; // Positive if nose above shoulders

    // Additional check: eyes should be higher than nose if visible
    let eyesConfirmTilt = true;
    if (leftEye && rightEye && leftEye.score && rightEye.score &&
        leftEye.score > 0.3 && rightEye.score > 0.3) {
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      eyesConfirmTilt = eyeCenterY < nose.y; // Eyes above nose = head tilted back
    }

    // Detect head tilted back
    if (noseAboveShoulders > headTiltThresholdPx && eyesConfirmTilt) {
      const now = Date.now();

      // Start timer if first detection
      if (this.headTiltStartTime === 0) {
        this.headTiltStartTime = now;
      }

      // Check if head has been tilted back for 3+ seconds
      const duration = now - this.headTiltStartTime;
      if (duration >= 3000) {
        this.lastDetectionTime = currentTime;
        this.headTiltStartTime = 0; // Reset for next detection

        const tiltScore = Math.min(noseAboveShoulders / (poseData.personHeight * 0.4), 1.0);
        const durationScore = Math.min(duration / 10000, 1.0);
        const confidence = 0.7 + (tiltScore * 0.15) + (durationScore * 0.15);

        return {
          type: 'ground', // Using 'ground' type for unconscious
          timestamp: currentTime,
          confidence: Math.max(0.70, Math.min(0.95, confidence)),
          description: `Person unconscious - head tilted back for ${Math.round(duration / 1000)}s - possible medical emergency`,
          keypoints: poseData.keypoints,
        };
      }
    } else {
      // Reset timer if head no longer tilted back
      this.headTiltStartTime = 0;
    }

    return null;
  }

  reset() {
    this.headTiltStartTime = 0;
    this.lastDetectionTime = 0;
  }
}

/**
 * Main detection manager that runs all Phase 1 algorithms
 */
export class Phase1DetectionManager {
  private fallDetector: FallDetector;
  private groundDetector: GroundDetector;
  private handsRaisedDetector: HandsRaisedDetector;
  private unconsciousDetector: UnconsciousDetector;

  constructor(config?: {
    fallDetection?: { heightDropThreshold?: number; velocityThreshold?: number; debounceDuration?: number };
    groundDetection?: { heightThreshold?: number; debounceDuration?: number };
    handsRaisedDetection?: { shoulderHeightThreshold?: number; debounceDuration?: number };
    unconsciousDetection?: { tiltThreshold?: number; debounceDuration?: number };
  }) {
    this.fallDetector = new FallDetector(
      config?.fallDetection?.heightDropThreshold,
      config?.fallDetection?.velocityThreshold,
      config?.fallDetection?.debounceDuration
    );
    this.groundDetector = new GroundDetector(
      config?.groundDetection?.heightThreshold,
      config?.groundDetection?.debounceDuration
    );
    this.handsRaisedDetector = new HandsRaisedDetector(
      config?.handsRaisedDetection?.shoulderHeightThreshold,
      config?.handsRaisedDetection?.debounceDuration
    );
    this.unconsciousDetector = new UnconsciousDetector(
      config?.unconsciousDetection?.tiltThreshold,
      config?.unconsciousDetection?.debounceDuration
    );
  }

  /**
   * Run all detection algorithms on current pose data
   */
  detectAll(keypoints: Keypoint[], currentTime: number): Phase1Detection[] {
    const poseData: PoseData = {
      keypoints,
      timestamp: currentTime,
      personHeight: calculatePersonHeight(keypoints),
      centerY: calculateCenterY(keypoints),
    };

    const detections: Phase1Detection[] = [];

    const fallDetection = this.fallDetector.detect(poseData, currentTime);
    if (fallDetection) detections.push(fallDetection);

    const groundDetection = this.groundDetector.detect(poseData, currentTime);
    if (groundDetection) detections.push(groundDetection);

    const handsRaisedDetection = this.handsRaisedDetector.detect(poseData, currentTime);
    if (handsRaisedDetection) detections.push(handsRaisedDetection);

    const unconsciousDetection = this.unconsciousDetector.detect(poseData, currentTime);
    if (unconsciousDetection) detections.push(unconsciousDetection);

    return detections;
  }

  /**
   * Reset all detectors
   */
  reset() {
    this.fallDetector.reset();
    this.groundDetector.reset();
    this.handsRaisedDetector.reset();
    this.unconsciousDetector.reset();
  }
}
