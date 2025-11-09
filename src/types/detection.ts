import { Keypoint } from '@tensorflow-models/pose-detection';

/**
 * Phase 1 Detection Types - Browser-based heuristic algorithms
 */
export type Phase1DetectionType = 'fall' | 'ground' | 'hands_raised';

export interface Phase1Detection {
  type: Phase1DetectionType;
  timestamp: number; // seconds since recording start
  confidence: number; // 0-1
  description: string;
  keypoints?: Keypoint[];
}

/**
 * Phase 2 Detection Types - VLM-based analysis
 */
export interface Phase2Detection {
  type: 'vlm_detection';
  timestamp: number;
  confidence: number;
  description: string;
  category: string; // e.g., "theft", "vandalism", "violence"
  explanation: string;
}

/**
 * Combined detection event
 */
export type DetectionEvent = Phase1Detection | Phase2Detection;

/**
 * Detection configuration
 */
export interface DetectionConfig {
  phase1Enabled: boolean;
  phase2Enabled: boolean;
  fallDetection: {
    enabled: boolean;
    heightDropThreshold: number; // default: 0.3
    velocityThreshold: number; // default: 0.02
    debounceDuration: number; // milliseconds, default: 3000
  };
  groundDetection: {
    enabled: boolean;
    heightThreshold: number; // default: 0.25
    debounceDuration: number; // milliseconds, default: 5000
  };
  handsRaisedDetection: {
    enabled: boolean;
    shoulderHeightThreshold: number; // default: 1.1
    debounceDuration: number; // milliseconds, default: 5000
  };
  phase2: {
    enabled: boolean;
    checkInterval: number; // milliseconds, default: 5000
    includeAudio: boolean;
    includePoseData: boolean;
  };
}

/**
 * Pose tracking for detection algorithms
 */
export interface PoseData {
  keypoints: Keypoint[];
  timestamp: number;
  personHeight: number; // calculated from keypoints
  centerY: number; // vertical center position
}

/**
 * Recording session data
 */
export interface RecordingSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // seconds
  detections: DetectionEvent[];
  videoBlob?: Blob;
  audioEnabled: boolean;
}

/**
 * Default detection configuration
 */
export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  phase1Enabled: true,
  phase2Enabled: false,
  fallDetection: {
    enabled: true,
    heightDropThreshold: 0.3,
    velocityThreshold: 0.02,
    debounceDuration: 3000,
  },
  groundDetection: {
    enabled: true,
    heightThreshold: 0.25,
    debounceDuration: 5000,
  },
  handsRaisedDetection: {
    enabled: true,
    shoulderHeightThreshold: 1.1,
    debounceDuration: 5000,
  },
  phase2: {
    enabled: false,
    checkInterval: 5000,
    includeAudio: true,
    includePoseData: true,
  },
};
