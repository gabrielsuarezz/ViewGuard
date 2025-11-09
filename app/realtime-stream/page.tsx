"use client";

import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";
import type { Keypoint } from "@tensorflow-models/pose-detection";
import { detectEventsWithVLM } from "./actions";
import { Timeline } from "@/components/Timeline";

// Type definitions for better TypeScript support
interface DetectedEvent {
  timestamp: string;
  description: string;
  isDangerous: boolean;
  confidence: number;
  source: "heuristic" | "vlm"; // Phase 1 (heuristic) or Phase 2 (VLM)
}

interface PoseKeypoint {
  x: number;
  y: number;
  score: number;
  name?: string;
}

export default function RealtimeStreamPage() {
  // Refs for DOM elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs for models and animation frames (persist across renders)
  const poseModelRef = useRef<poseDetection.PoseDetector | null>(null);
  const detectionFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const isDetectingRef = useRef<boolean>(false);
  const isPhase2EnabledRef = useRef<boolean>(false);
  const recordingStartTimeRef = useRef<number>(0); // Track when video recording actually starts

  // Refs for enhanced multi-detection algorithm
  const centerOfMassHistoryRef = useRef<{ x: number; y: number }[]>([]); // Track center of mass for enhanced fall detection
  const lastFallTimeRef = useRef<number>(0); // Track last fall detection time for debounce
  const personOnGroundStartTimeRef = useRef<number>(0); // Track when person first went horizontal
  const handsRaisedStartTimeRef = useRef<number>(0); // Track when hands first raised
  const lastHandsRaisedAlertRef = useRef<number>(0); // Debounce for hands raised alerts
  const lastPersonOnGroundAlertRef = useRef<number>(0); // Debounce for person on ground alerts
  const previousKeypointsRef = useRef<PoseKeypoint[]>([]); // Track previous frame for movement detection
  const headTiltBackStartTimeRef = useRef<number>(0); // Track when head first tilted back
  const lastHeadTiltBackAlertRef = useRef<number>(0); // Debounce for head tilt back alerts

  const HISTORY_LENGTH = 5;
  const FALL_VELOCITY_THRESHOLD = 0.15; // 15% of person height per frame (adaptive)
  const PERSON_ON_GROUND_DURATION = 5000; // 5 seconds horizontal = medical emergency
  const HANDS_RAISED_DURATION = 2000; // 2 seconds hands raised = distress/robbery
  const HEAD_TILT_BACK_DURATION = 3000; // 3 seconds head tilted back = unconscious

  // State management
  const [isInitializing, setIsInitializing] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<DetectedEvent[]>([]);
  const [lastPoseKeypoints, setLastPoseKeypoints] = useState<PoseKeypoint[]>([]);
  const [fallStatus, setFallStatus] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<string>("00:00");

  // Phase 2: VLM Integration state
  const [isPhase2Enabled, setIsPhase2Enabled] = useState(false);
  const [vlmStatus, setVlmStatus] = useState<"inactive" | "analyzing" | "active" | "error">("inactive");
  const [vlmError, setVlmError] = useState<string | null>(null);
  const [lastVlmTime, setLastVlmTime] = useState<string | null>(null);
  const [vlmAlertStatus, setVlmAlertStatus] = useState<string | null>(null); // VLM alert overlay
  const vlmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastVlmAnalysisRef = useRef<number>(0);
  const activeVlmCallsRef = useRef<number>(0); // Track concurrent VLM calls

  // Audio transcript state (Web Speech API)
  const [audioTranscript, setAudioTranscript] = useState<string>("");
  const recognitionRef = useRef<any>(null); // SpeechRecognition instance
  const finalTranscriptRef = useRef<string>(""); // Store only final transcripts for saving

  // Video recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Initialize TensorFlow.js and models
  const initMLModels = async () => {
    try {
      setError(null);
      console.log("🚀 Initializing TensorFlow.js...");
      console.log("Browser:", navigator.userAgent);

      // Set backend with error handling
      console.log("⏳ Waiting for TensorFlow.js to be ready...");
      await tf.ready();
      console.log("✅ TensorFlow.js ready, current backend:", tf.getBackend());

      console.log("⏳ Setting WebGL backend...");
      await tf.setBackend("webgl");
      await tf.env().set("WEBGL_FORCE_F16_TEXTURES", true);

      console.log("✅ TensorFlow.js backend ready:", tf.getBackend());

      // Load MoveNet pose detection model
      console.log("🤖 Loading MoveNet SINGLEPOSE_LIGHTNING model (this may take 10-30 seconds)...");
      const poseModel = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true,
          minPoseScore: 0.3,
        }
      );

      poseModelRef.current = poseModel;
      console.log("✅ MoveNet model loaded successfully - ready to detect!");

      setIsInitializing(false);
    } catch (err) {
      console.error("❌ Model initialization error:", err);
      console.error("Error details:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      setError(`Failed to initialize AI models: ${err instanceof Error ? err.message : String(err)}`);
      setIsInitializing(false);
    }
  };

  // Start webcam
  const startWebcam = async () => {
    try {
      setError(null);
      console.log("📹 Requesting webcam access...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true, // Enable audio recording for saved videos
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Mute video element to prevent audio feedback/echo
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = resolve;
          }
        });
        await videoRef.current.play();
        console.log("✅ Webcam started successfully");
      }
    } catch (err) {
      console.error("❌ Webcam error:", err);
      setError(`Failed to access webcam: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Initialize Web Speech API for audio transcription
  const initSpeechRecognition = () => {
    try {
      // Check for browser support (Chrome/Edge)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.warn("⚠️ Speech Recognition not supported in this browser");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Keep listening
      recognition.interimResults = true; // Get interim results for real-time updates
      recognition.lang = "en-US";

      // Update transcript as speech is detected
      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        // Collect all results (both interim and final)
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interimTranscript += transcript;
          }
        }

        // Accumulate final transcripts in ref (for saving)
        if (finalTranscript) {
          finalTranscriptRef.current += finalTranscript;
          console.log("🎤 Final speech saved:", finalTranscript);
        }

        // Display both final and interim transcripts in UI
        const displayTranscript = finalTranscriptRef.current + interimTranscript;
        setAudioTranscript(displayTranscript);

        if (interimTranscript) {
          console.log("🎤 Interim speech (showing but not saved):", interimTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("⚠️ Speech recognition error:", event.error);
      };

      recognition.onend = () => {
        // Restart if still detecting
        if (isDetectingRef.current) {
          try {
            recognition.start();
            console.log("🔄 Speech recognition restarted");
          } catch (err) {
            console.warn("⚠️ Could not restart speech recognition:", err);
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      console.log("✅ Speech recognition started");
    } catch (err) {
      console.warn("⚠️ Failed to initialize speech recognition:", err);
    }
  };

  // Stop speech recognition
  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
        setAudioTranscript("");
        console.log("⏹️ Speech recognition stopped");
      } catch (err) {
        console.warn("⚠️ Error stopping speech recognition:", err);
      }
    }
  };

  // Start video recording
  const startRecording = () => {
    if (!streamRef.current) {
      console.warn("⚠️ No stream available to record");
      return;
    }

    try {
      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: "video/webm;codecs=vp9",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstart = () => {
        // Capture exact moment recording starts for accurate timestamps
        recordingStartTimeRef.current = Date.now();
        console.log("🎥 Video recording started at:", recordingStartTimeRef.current);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        setRecordedBlob(blob);
        setIsRecording(false);
        console.log("✅ Recording stopped, blob size:", blob.size);
      };

      mediaRecorder.start(100); // Capture data every 100ms
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error("❌ Failed to start recording:", err);
    }
  };

  // Stop video recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      console.log("⏹️ Stopping video recording...");
    }
  };

  // ========== HELPER FUNCTIONS FOR POSE ANALYSIS ==========

  // Calculate person height (nose to ankles)
  const calculatePersonHeight = (keypoints: Keypoint[]): number => {
    const nose = keypoints.find((kp) => kp.name === "nose");
    const leftAnkle = keypoints.find((kp) => kp.name === "left_ankle");
    const rightAnkle = keypoints.find((kp) => kp.name === "right_ankle");

    if (!nose || !leftAnkle || !rightAnkle) return 0;
    if (!nose.score || nose.score < 0.3) return 0;
    if (!leftAnkle.score || !rightAnkle.score || (leftAnkle.score < 0.3 && rightAnkle.score < 0.3)) return 0;

    // Use the ankle with higher confidence
    const ankle = leftAnkle.score && leftAnkle.score > (rightAnkle.score || 0) ? leftAnkle : rightAnkle;
    return Math.abs(ankle.y - nose.y);
  };

  // Calculate center of mass (average of shoulders and hips)
  const calculateCenterOfMass = (keypoints: Keypoint[]): { x: number; y: number } | null => {
    const torsoPoints = keypoints.filter((kp) =>
      (kp.name?.includes("hip") || kp.name?.includes("shoulder")) &&
      kp.score && kp.score > 0.3
    );

    if (torsoPoints.length === 0) return null;

    const sumX = torsoPoints.reduce((sum, kp) => sum + kp.x, 0);
    const sumY = torsoPoints.reduce((sum, kp) => sum + kp.y, 0);

    return {
      x: sumX / torsoPoints.length,
      y: sumY / torsoPoints.length,
    };
  };

  // Calculate body angle (0 = vertical/standing, 90 = horizontal/lying)
  const calculateBodyAngle = (shoulders: Keypoint[], hips: Keypoint[]): number => {
    if (shoulders.length < 2 || hips.length < 2) return 0;

    const shoulderCenter = {
      x: (shoulders[0].x + shoulders[1].x) / 2,
      y: (shoulders[0].y + shoulders[1].y) / 2,
    };

    const hipCenter = {
      x: (hips[0].x + hips[1].x) / 2,
      y: (hips[0].y + hips[1].y) / 2,
    };

    // Calculate angle from vertical
    const dx = hipCenter.x - shoulderCenter.x;
    const dy = hipCenter.y - shoulderCenter.y;
    const angleRadians = Math.atan2(dx, dy);
    const angleDegrees = Math.abs((angleRadians * 180) / Math.PI);

    return angleDegrees;
  };

  // Get keypoint by name with confidence check
  const getKeypoint = (keypoints: Keypoint[], name: string): Keypoint | null => {
    const kp = keypoints.find((k) => k.name === name);
    if (!kp || !kp.score || kp.score < 0.3) return null;
    return kp;
  };

  // ========== END HELPER FUNCTIONS ==========

  // Main detection loop with fall detection heuristic
  const runDetection = async () => {
    if (!videoRef.current || !canvasRef.current || !poseModelRef.current || !isDetectingRef.current) {
      console.log("🛑 Detection loop check failed:", {
        hasVideo: !!videoRef.current,
        hasCanvas: !!canvasRef.current,
        hasModel: !!poseModelRef.current,
        isDetecting: isDetectingRef.current
      });
      return;
    }

    // Throttle to ~10 FPS (100ms) for stability
    const now = performance.now();
    if (now - lastDetectionTimeRef.current < 100) {
      detectionFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }
    lastDetectionTimeRef.current = now;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("❌ Failed to get canvas context");
      detectionFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (video.readyState !== 4) {
      console.log("⏳ Video not ready yet, readyState:", video.readyState);
      detectionFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    // Log first successful frame
    if (!canvas.width || canvas.width === 0) {
      console.log("📐 Setting canvas size:", video.videoWidth, "x", video.videoHeight);
    }

    try {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Estimate poses
      const poses = await poseModelRef.current.estimatePoses(video);

      if (poses.length > 0) {
        const pose = poses[0];
        const keypoints = pose.keypoints as Keypoint[];

        // Update state with keypoints
        setLastPoseKeypoints(
          keypoints.map((kp) => ({
            x: kp.x,
            y: kp.y,
            score: kp.score || 0,
            name: kp.name,
          }))
        );

        // Draw keypoints with labels
        keypoints.forEach((kp) => {
          if (kp.score && kp.score > 0.3) {
            // Draw keypoint dot
            ctx.beginPath();
            ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = kp.score > 0.6 ? "#00ff00" : "#ffff00"; // Green if confident, yellow if less confident
            ctx.fill();
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw label for keypoint
            if (kp.name) {
              // Format the name (e.g., "left_shoulder" -> "Left Shoulder")
              const labelText = kp.name
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

              // Set font
              ctx.font = "12px Arial";
              const textMetrics = ctx.measureText(labelText);

              // Draw semi-transparent background
              ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
              ctx.fillRect(kp.x + 8, kp.y - 6, textMetrics.width + 6, 16);

              // Draw label text
              ctx.fillStyle = "white";
              ctx.fillText(labelText, kp.x + 11, kp.y + 4);
            }
          }
        });

        // ========== MULTI-DETECTION SYSTEM ==========
        // Run all detection algorithms
        detectEnhancedFall(keypoints, canvas.height);
        detectPersonOnGround(keypoints, canvas.height);
        detectHandsRaised(keypoints);
        detectHeadTiltBack(keypoints, canvas.height);
        // ========== END MULTI-DETECTION ==========

        // Store keypoints for next frame comparison
        previousKeypointsRef.current = keypoints.map((kp) => ({
          x: kp.x,
          y: kp.y,
          score: kp.score || 0,
          name: kp.name,
        }));
      }
    } catch (err) {
      console.error("Detection error:", err);
    }

    // Continue loop
    detectionFrameRef.current = requestAnimationFrame(runDetection);
  };

  // ========== DETECTION ALGORITHMS ==========

  // 1. Enhanced Fall Detection (using center of mass)
  const detectEnhancedFall = (keypoints: Keypoint[], canvasHeight: number) => {
    // Calculate center of mass from torso keypoints
    const centerOfMass = calculateCenterOfMass(keypoints);
    if (!centerOfMass) {
      return; // Not enough torso keypoints detected
    }

    // Calculate person height for adaptive threshold
    const personHeight = calculatePersonHeight(keypoints);
    if (personHeight === 0) {
      return; // Can't determine person height
    }

    // Track center of mass position history
    centerOfMassHistoryRef.current.push(centerOfMass);
    if (centerOfMassHistoryRef.current.length > HISTORY_LENGTH) {
      centerOfMassHistoryRef.current.shift();
    }

    // Need at least 2 frames to calculate velocity
    if (centerOfMassHistoryRef.current.length < 2) {
      return;
    }

    // Calculate vertical velocity (positive = falling down)
    const recentHistory = centerOfMassHistoryRef.current.slice(-2);
    const velocityY = recentHistory[1].y - recentHistory[0].y;

    // Adaptive threshold: 15% of person height per frame
    const adaptiveThreshold = personHeight * FALL_VELOCITY_THRESHOLD;

    // Check for rapid downward movement
    if (velocityY > adaptiveThreshold) {
      // Additional check: body should be more horizontal than vertical
      const shoulders = keypoints.filter((kp) =>
        kp.name?.includes("shoulder") && kp.score && kp.score > 0.3
      );
      const hips = keypoints.filter((kp) =>
        kp.name?.includes("hip") && kp.score && kp.score > 0.3
      );

      if (shoulders.length >= 2 && hips.length >= 2) {
        // Calculate body angle
        const bodyAngle = calculateBodyAngle(shoulders, hips);

        // If body angle > 60 degrees from vertical, person is tilted/horizontal
        if (bodyAngle > 60) {
          // Calculate average confidence from all relevant keypoints
          const relevantKeypoints = [...shoulders, ...hips];
          const avgConfidence = relevantKeypoints.reduce((sum, kp) => sum + (kp.score || 0), 0) / relevantKeypoints.length;

          triggerFallEvent(velocityY, avgConfidence, bodyAngle, personHeight);
        }
      }
    } else {
      // No fall detected, clear status
      if (fallStatus) {
        setFallStatus(null);
      }
    }
  };

  // 2. Person on Ground Detection (medical emergency)
  const detectPersonOnGround = (keypoints: Keypoint[], canvasHeight: number) => {
    const shoulders = keypoints.filter((kp) =>
      kp.name?.includes("shoulder") && kp.score && kp.score > 0.3
    );
    const hips = keypoints.filter((kp) =>
      kp.name?.includes("hip") && kp.score && kp.score > 0.3
    );

    if (shoulders.length < 2 || hips.length < 2) {
      // Reset timer if we can't detect body
      personOnGroundStartTimeRef.current = 0;
      return;
    }

    // Calculate body angle
    const bodyAngle = calculateBodyAngle(shoulders, hips);

    // Calculate hip height (average Y position)
    const hipHeight = (hips[0].y + hips[1].y) / 2;

    // Check if person is horizontal and low to ground
    const isHorizontal = bodyAngle > 60; // More than 60 degrees from vertical
    const isLowToGround = hipHeight > (canvasHeight * 0.6); // Bottom 40% of frame

    if (isHorizontal && isLowToGround) {
      const now = Date.now();

      // Start timer if this is the first detection
      if (personOnGroundStartTimeRef.current === 0) {
        personOnGroundStartTimeRef.current = now;
      }

      // Check if person has been on ground for 5+ seconds
      const duration = now - personOnGroundStartTimeRef.current;
      if (duration >= PERSON_ON_GROUND_DURATION) {
        // Debounce: avoid duplicate alerts
        if (now - lastPersonOnGroundAlertRef.current >= 10000) {
          lastPersonOnGroundAlertRef.current = now;
          triggerPersonOnGroundEvent(duration);
        }
      }
    } else {
      // Reset timer if person is no longer on ground
      personOnGroundStartTimeRef.current = 0;
    }
  };

  // 3. Hands Raised Detection (distress/robbery)
  const detectHandsRaised = (keypoints: Keypoint[]) => {
    const leftWrist = getKeypoint(keypoints, "left_wrist");
    const rightWrist = getKeypoint(keypoints, "right_wrist");
    const leftShoulder = getKeypoint(keypoints, "left_shoulder");
    const rightShoulder = getKeypoint(keypoints, "right_shoulder");
    const nose = getKeypoint(keypoints, "nose");

    if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !nose) {
      // Reset timer if we can't detect all necessary keypoints
      handsRaisedStartTimeRef.current = 0;
      return;
    }

    // Check if both hands are raised above shoulders
    const leftHandRaised = leftWrist.y < leftShoulder.y - 30; // 30px above shoulder
    const rightHandRaised = rightWrist.y < rightShoulder.y - 30;

    // Also check if hands are above head (more dramatic)
    const handsAboveHead = leftWrist.y < nose.y && rightWrist.y < nose.y;

    if ((leftHandRaised && rightHandRaised) || handsAboveHead) {
      const now = Date.now();

      // Start timer if this is the first detection
      if (handsRaisedStartTimeRef.current === 0) {
        handsRaisedStartTimeRef.current = now;
      }

      // Check if hands have been raised for 2+ seconds
      const duration = now - handsRaisedStartTimeRef.current;
      if (duration >= HANDS_RAISED_DURATION) {
        // Debounce: avoid duplicate alerts
        if (now - lastHandsRaisedAlertRef.current >= 5000) {
          lastHandsRaisedAlertRef.current = now;
          triggerHandsRaisedEvent(duration, handsAboveHead);
        }
      }
    } else {
      // Reset timer if hands are no longer raised
      handsRaisedStartTimeRef.current = 0;
    }
  };

  // 4. Head Tilted Back Detection (unconscious person)
  const detectHeadTiltBack = (keypoints: Keypoint[], canvasHeight: number) => {
    const nose = getKeypoint(keypoints, "nose");
    const leftEye = getKeypoint(keypoints, "left_eye");
    const rightEye = getKeypoint(keypoints, "right_eye");
    const leftShoulder = getKeypoint(keypoints, "left_shoulder");
    const rightShoulder = getKeypoint(keypoints, "right_shoulder");

    if (!nose || !leftShoulder || !rightShoulder) {
      // Reset timer if we can't detect necessary keypoints
      headTiltBackStartTimeRef.current = 0;
      return;
    }

    // Calculate shoulder center
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;

    // Calculate person height for adaptive threshold
    const personHeight = calculatePersonHeight(keypoints);
    if (personHeight === 0) {
      headTiltBackStartTimeRef.current = 0;
      return;
    }

    // Check if head is tilted back: nose should be ABOVE shoulders (lower Y value)
    // AND the difference should be significant (at least 20% of person height)
    const headTiltThreshold = personHeight * 0.20; // 20% of person height
    const noseAboveShoulders = shoulderCenterY - nose.y; // Positive if nose is above shoulders

    // Additional check: eyes should be even higher than nose if visible
    let eyesConfirmTilt = true;
    if (leftEye && rightEye) {
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      eyesConfirmTilt = eyeCenterY < nose.y; // Eyes above nose = head tilted back
    }

    // Detect head tilted back if nose is significantly above shoulders AND eyes confirm (if visible)
    if (noseAboveShoulders > headTiltThreshold && eyesConfirmTilt) {
      const now = Date.now();

      // Start timer if this is the first detection
      if (headTiltBackStartTimeRef.current === 0) {
        headTiltBackStartTimeRef.current = now;
      }

      // Check if head has been tilted back for 3+ seconds
      const duration = now - headTiltBackStartTimeRef.current;
      if (duration >= HEAD_TILT_BACK_DURATION) {
        // Debounce: avoid duplicate alerts (10 seconds)
        if (now - lastHeadTiltBackAlertRef.current >= 10000) {
          lastHeadTiltBackAlertRef.current = now;
          triggerHeadTiltBackEvent(duration, noseAboveShoulders, personHeight);
        }
      }
    } else {
      // Reset timer if head is no longer tilted back
      headTiltBackStartTimeRef.current = 0;
    }
  };

  // Trigger fall event with dynamic confidence calculation
  const triggerFallEvent = (velocity: number, keypointConfidence: number, bodyAngle: number, personHeight: number) => {
    // Debounce: Avoid duplicate events within 3 seconds using ref (synchronous)
    const now = Date.now();
    if (now - lastFallTimeRef.current < 3000) {
      return; // Too soon, ignore duplicate
    }
    lastFallTimeRef.current = now;

    const currentTime = getElapsedTime();

    // Calculate dynamic confidence based on detection quality
    // Factors: velocity magnitude, keypoint confidence, body angle
    const velocityScore = Math.min(velocity / (personHeight * 0.3), 1.0); // Normalize velocity relative to height
    const angleScore = Math.min((bodyAngle - 60) / 30, 1.0); // Normalize angle (60-90 degrees)
    const finalConfidence = (keypointConfidence * 0.4 + velocityScore * 0.3 + angleScore * 0.3);
    const clampedConfidence = Math.max(0.5, Math.min(0.95, finalConfidence)); // Clamp between 0.5-0.95

    setFallStatus("⚠️ FALL DETECTED");

    const newEvent: DetectedEvent = {
      timestamp: currentTime,
      description: "Sudden fall detected",
      isDangerous: true,
      confidence: clampedConfidence,
      source: "heuristic",
    };

    setEvents((prev) => [...prev, newEvent]);

    // Auto-clear fall status after 2 seconds
    setTimeout(() => setFallStatus(null), 2000);

    console.log("🚨 FALL DETECTED at", currentTime, "| Confidence:", (clampedConfidence * 100).toFixed(1) + "%", "| Velocity:", velocity.toFixed(1) + "px", "| Angle:", bodyAngle.toFixed(1) + "°");

    // --- INSTANT EMAIL NOTIFICATION FOR DANGEROUS EVENTS ---
    // If the event is dangerous, send the email notification
    if (newEvent.isDangerous) {
      console.log("DANGEROUS EVENT: Sending notification...");
      try {
        fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventDescription: newEvent.description,
            timestamp: newEvent.timestamp,
            frameImage: "", // Optional - Phase 1 doesn't capture frame
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log("✅ Notification sent successfully.");
            } else {
              console.warn("⚠️ Notification failed:", data.error);
            }
          })
          .catch((error) => {
            console.error("❌ Failed to send notification:", error);
          });
      } catch (error) {
        console.error("❌ Failed to send notification:", error);
      }
    }
    // --- END OF EMAIL NOTIFICATION CODE ---
  };

  // Trigger person on ground event
  const triggerPersonOnGroundEvent = (duration: number) => {
    const currentTime = getElapsedTime();

    setFallStatus("⚠️ PERSON ON GROUND");

    const newEvent: DetectedEvent = {
      timestamp: currentTime,
      description: `Person on ground for ${Math.round(duration / 1000)}s - possible medical emergency`,
      isDangerous: true,
      confidence: 0.85,
      source: "heuristic",
    };

    setEvents((prev) => [...prev, newEvent]);

    // Auto-clear status after 3 seconds
    setTimeout(() => setFallStatus(null), 3000);

    console.log("🚨 PERSON ON GROUND at", currentTime, "| Duration:", Math.round(duration / 1000) + "s");

    // Send email notification
    if (newEvent.isDangerous) {
      console.log("DANGEROUS EVENT: Sending notification...");
      try {
        fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventDescription: newEvent.description,
            timestamp: newEvent.timestamp,
            frameImage: "",
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log("✅ Notification sent successfully.");
            } else {
              console.warn("⚠️ Notification failed:", data.error);
            }
          })
          .catch((error) => {
            console.error("❌ Failed to send notification:", error);
          });
      } catch (error) {
        console.error("❌ Failed to send notification:", error);
      }
    }
  };

  // Trigger hands raised event
  const triggerHandsRaisedEvent = (duration: number, handsAboveHead: boolean) => {
    const currentTime = getElapsedTime();

    setFallStatus("⚠️ HANDS RAISED");

    const description = handsAboveHead
      ? `Hands raised above head for ${Math.round(duration / 1000)}s - possible distress signal`
      : `Hands raised for ${Math.round(duration / 1000)}s - possible robbery/threat`;

    const newEvent: DetectedEvent = {
      timestamp: currentTime,
      description: description,
      isDangerous: true,
      confidence: handsAboveHead ? 0.80 : 0.75,
      source: "heuristic",
    };

    setEvents((prev) => [...prev, newEvent]);

    // Auto-clear status after 3 seconds
    setTimeout(() => setFallStatus(null), 3000);

    console.log("🚨 HANDS RAISED at", currentTime, "| Duration:", Math.round(duration / 1000) + "s", "| Above head:", handsAboveHead);

    // Send email notification
    if (newEvent.isDangerous) {
      console.log("DANGEROUS EVENT: Sending notification...");
      try {
        fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventDescription: newEvent.description,
            timestamp: newEvent.timestamp,
            frameImage: "",
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log("✅ Notification sent successfully.");
            } else {
              console.warn("⚠️ Notification failed:", data.error);
            }
          })
          .catch((error) => {
            console.error("❌ Failed to send notification:", error);
          });
      } catch (error) {
        console.error("❌ Failed to send notification:", error);
      }
    }
  };

  // Trigger head tilt back event (unconscious person)
  const triggerHeadTiltBackEvent = (duration: number, tiltAmount: number, personHeight: number) => {
    const currentTime = getElapsedTime();

    setFallStatus("⚠️ UNCONSCIOUS - HEAD TILTED BACK");

    // Calculate confidence based on tilt amount and duration
    const tiltScore = Math.min(tiltAmount / (personHeight * 0.4), 1.0); // Normalize tilt
    const durationScore = Math.min(duration / 10000, 1.0); // Normalize duration (max at 10s)
    const confidence = 0.7 + (tiltScore * 0.15) + (durationScore * 0.15); // Base 70% + bonuses
    const clampedConfidence = Math.max(0.70, Math.min(0.95, confidence));

    const newEvent: DetectedEvent = {
      timestamp: currentTime,
      description: `Person unconscious - head tilted back for ${Math.round(duration / 1000)}s - possible medical emergency`,
      isDangerous: true,
      confidence: clampedConfidence,
      source: "heuristic",
    };

    setEvents((prev) => [...prev, newEvent]);

    // Auto-clear status after 3 seconds
    setTimeout(() => setFallStatus(null), 3000);

    console.log("🚨 UNCONSCIOUS DETECTED at", currentTime, "| Duration:", Math.round(duration / 1000) + "s", "| Tilt:", Math.round(tiltAmount) + "px", "| Confidence:", (clampedConfidence * 100).toFixed(1) + "%");

    // Send email notification
    if (newEvent.isDangerous) {
      console.log("DANGEROUS EVENT: Sending notification...");
      try {
        fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            eventDescription: newEvent.description,
            timestamp: newEvent.timestamp,
            frameImage: "",
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              console.log("✅ Notification sent successfully.");
            } else {
              console.warn("⚠️ Notification failed:", data.error);
            }
          })
          .catch((error) => {
            console.error("❌ Failed to send notification:", error);
          });
      } catch (error) {
        console.error("❌ Failed to send notification:", error);
      }
    }
  };

  // Phase 2: Analyze frame with VLM
  const analyzeFrameWithVLM = async () => {
    console.log("🔍 VLM interval fired - checking conditions:", {
      hasCanvas: !!canvasRef.current,
      isPhase2EnabledRef: isPhase2EnabledRef.current,
      isDetectingRef: isDetectingRef.current,
      vlmIntervalExists: !!vlmIntervalRef.current,
      activeCalls: activeVlmCallsRef.current,
    });

    if (!canvasRef.current || !isPhase2EnabledRef.current || !isDetectingRef.current) {
      console.log("❌ VLM check failed - aborting analysis");
      return;
    }

    // Only allow 1 concurrent VLM call to prevent API overload
    if (activeVlmCallsRef.current >= 1) {
      console.log("⏸️ Skipping VLM call - analysis already in progress");
      return;
    }

    try {
      activeVlmCallsRef.current++;
      console.log(`🚀 Starting VLM analysis (${activeVlmCallsRef.current} active call)`);

      setVlmStatus("analyzing");
      setVlmError(null);
      setLastVlmTime(getElapsedTime());

      // Capture current frame as Base64 JPEG with optimizations for speed
      const canvas = canvasRef.current;

      // Optimization: Resize image to reduce payload size (max width 640px)
      const maxWidth = 640;
      let targetWidth = canvas.width;
      let targetHeight = canvas.height;

      if (canvas.width > maxWidth) {
        const scale = maxWidth / canvas.width;
        targetWidth = maxWidth;
        targetHeight = Math.floor(canvas.height * scale);
      }

      // Create a temporary canvas for resizing
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = targetWidth;
      tempCanvas.height = targetHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        // Draw resized image
        tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);

        // Encode with lower quality for faster upload (0.5 vs 0.8)
        const frameBase64 = tempCanvas.toDataURL("image/jpeg", 0.5);

        // Log optimization stats
        console.log(`📊 Image optimized: ${canvas.width}x${canvas.height} → ${targetWidth}x${targetHeight}`);

        // Continue with analysis
        await processVLMAnalysis(frameBase64);
      } else {
        // Fallback to original canvas if temp canvas fails
        const frameBase64 = canvas.toDataURL("image/jpeg", 0.5);
        await processVLMAnalysis(frameBase64);
      }
    } catch (error) {
      console.error("❌ VLM analysis error:", error);
      setVlmError(error instanceof Error ? error.message : "Unknown error");
      setVlmStatus("error");
    } finally {
      // Always decrement counter when analysis completes
      activeVlmCallsRef.current = Math.max(0, activeVlmCallsRef.current - 1);
      console.log(`✅ VLM analysis completed (${activeVlmCallsRef.current} active calls remaining)`);
    }
  };

  // Helper function to process VLM analysis
  const processVLMAnalysis = async (frameBase64: string) => {
    try {
      // Remove data URL prefix for server action
      const base64Image = frameBase64.replace(/^data:image\/jpeg;base64,/, "");

      // Get current time
      const currentTime = getElapsedTime();

      // Call server action with multi-modal data (frame + audio + pose)
      console.log("📸 Sending multi-modal data to VLM for analysis...");
      console.log("   📸 Frame: Optimized JPEG");
      console.log("   🎤 Audio:", audioTranscript || "No speech detected");
      console.log("   🤸 Pose:", lastPoseKeypoints.filter(kp => kp.score > 0.3).length, "keypoints");
      const result = await detectEventsWithVLM(
        base64Image,
        audioTranscript,
        lastPoseKeypoints,
        currentTime
      );

      if (!result.success) {
        console.error("❌ VLM analysis failed:", result.error);

        // Check if it's a rate limit error
        if (result.error?.includes("429") || result.error?.includes("quota") || result.error?.includes("Too Many Requests")) {
          setVlmError("Rate limit exceeded. Reduced to 5-second intervals. Free tier: 250 requests/day.");
          console.warn("⚠️ Rate limit hit - continuing with reduced frequency");
        } else {
          setVlmError(result.error || "VLM analysis failed");
        }

        setVlmStatus("error");
        return;
      }

      // Merge VLM events with existing events
      if (result.events.length > 0) {
        console.log(`✅ VLM detected ${result.events.length} event(s)`);

        const vlmEvents: DetectedEvent[] = result.events.map((event) => ({
          timestamp: event.timestamp,
          description: event.description,
          isDangerous: event.isDangerous,
          confidence: 0.9, // VLM confidence
          source: "vlm" as const,
        }));

        setEvents((prev) => [...prev, ...vlmEvents]);

        // Trigger visual alert for dangerous VLM detections (independent of Phase 1)
        const dangerousVlmEvents = vlmEvents.filter(event => event.isDangerous);
        if (dangerousVlmEvents.length > 0) {
          // Show alert with description from first dangerous event
          setVlmAlertStatus(`⚠️ ${dangerousVlmEvents[0].description.toUpperCase()}`);

          // Auto-clear alert after 3 seconds
          setTimeout(() => setVlmAlertStatus(null), 3000);

          console.log("🚨 VLM DANGER DETECTED:", dangerousVlmEvents[0].description);
        }

        // Trigger email alerts for dangerous events (optional)
        const dangerousEvents = vlmEvents.filter((event) => event.isDangerous);
        if (dangerousEvents.length > 0) {
          dangerousEvents.forEach((event) => {
            // Send email alert asynchronously (fire and forget)
            fetch("/api/send-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                eventDescription: event.description,
                timestamp: event.timestamp,
                frameImage: base64Image,
              }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.success) {
                  console.log("📧 Email alert sent successfully");
                } else {
                  console.warn("⚠️ Email alert failed (service may not be configured):", data.error);
                }
              })
              .catch((err) => {
                console.warn("⚠️ Email alert error:", err);
              });
          });
        }
      }

      setVlmStatus("active");
    } catch (error) {
      console.error("❌ VLM processing error:", error);
      setVlmError(error instanceof Error ? error.message : "Unknown error");
      setVlmStatus("error");
    }
  };

  // Start detection
  const handleStartDetection = async () => {
    console.log("🎬 handleStartDetection called");

    if (!poseModelRef.current) {
      console.error("❌ Models not initialized");
      setError("Models not initialized. Please wait...");
      return;
    }

    console.log("✅ Models are ready, starting detection...");

    isDetectingRef.current = true;
    setIsDetecting(true);
    setStartTime(Date.now());
    setEvents([]);
    setFallStatus(null);
    setAudioTranscript(""); // Reset transcript display
    finalTranscriptRef.current = ""; // Reset final transcript storage
    centerOfMassHistoryRef.current = [];
    lastFallTimeRef.current = 0; // Reset fall detection debounce
    personOnGroundStartTimeRef.current = 0; // Reset person on ground timer
    handsRaisedStartTimeRef.current = 0; // Reset hands raised timer
    lastPersonOnGroundAlertRef.current = 0; // Reset debounce
    lastHandsRaisedAlertRef.current = 0; // Reset debounce

    console.log("📊 State updated: isDetecting=true, startTime=", Date.now());

    // Reset Phase 2 state and sync ref with state
    isPhase2EnabledRef.current = isPhase2Enabled;
    setVlmStatus(isPhase2Enabled ? "active" : "inactive");
    setVlmError(null);
    lastVlmAnalysisRef.current = 0;

    console.log("📹 Starting webcam...");
    await startWebcam();

    console.log("🎤 Starting speech recognition for audio transcription...");
    initSpeechRecognition();

    console.log("🎥 Starting video recording...");
    startRecording();

    console.log("🔄 Starting detection loop...");
    runDetection();

    // Start VLM analysis interval if Phase 2 is enabled
    if (isPhase2Enabled) {
      console.log("🚀 Starting Phase 2 VLM analysis (1.5-second interval for near real-time detection)");
      vlmIntervalRef.current = setInterval(analyzeFrameWithVLM, 1500);
    }

    console.log("✅ Detection started successfully (with audio transcription)");
  };

  // Stop detection
  const handleStopDetection = () => {
    isDetectingRef.current = false;
    setIsDetecting(false);

    // Stop animation frame
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
    }

    // Stop VLM interval
    if (vlmIntervalRef.current) {
      clearInterval(vlmIntervalRef.current);
      vlmIntervalRef.current = null;
      activeVlmCallsRef.current = 0; // Reset active calls counter
      console.log("⏹️ Stopped Phase 2 VLM analysis");
    }

    // Stop speech recognition
    stopSpeechRecognition();

    // Stop video recording
    stopRecording();

    // Stop webcam
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Reset VLM status
    setVlmStatus("inactive");
    setVlmError(null);
    setLastVlmTime(null);

    // Reset recording start time
    recordingStartTimeRef.current = 0;

    // Show save modal after recording stops (wait for blob to be ready)
    // The modal will appear when recordedBlob state is updated by stopRecording
    if (events.length > 0 || isRecording) {
      // Modal will show via useEffect when recordedBlob is set
      console.log("⏳ Waiting for recording to finish, then showing save modal");
    }
  };

  // Get elapsed time
  // Get elapsed time relative to video recording start (for accurate timeline sync)
  const getElapsedTime = (): string => {
    if (!recordingStartTimeRef.current) return "00:00";
    const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Get elapsed time in seconds (for Timeline component)
  const getElapsedSeconds = (): number => {
    if (!recordingStartTimeRef.current) return 0;
    return Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
  };

  // Initialize on mount
  useEffect(() => {
    initMLModels();

    // Cleanup on unmount
    return () => {
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
      }
      if (vlmIntervalRef.current) {
        clearInterval(vlmIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Update elapsed time display every second when detecting
  useEffect(() => {
    if (!isDetecting) {
      setElapsedTime("00:00");
      return;
    }

    // Update immediately
    setElapsedTime(getElapsedTime());

    // Then update every second
    const interval = setInterval(() => {
      setElapsedTime(getElapsedTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [isDetecting, startTime]);

  // Show save modal when recording blob is ready
  useEffect(() => {
    if (recordedBlob && events.length > 0) {
      setShowSaveModal(true);
    }
  }, [recordedBlob, events.length]);

  // Save recording to IndexedDB
  const handleSaveRecording = async (name: string) => {
    if (!recordedBlob) {
      console.error("❌ No recorded blob available");
      return;
    }

    try {
      const { saveVideoToDB } = await import("@/lib/videoStorage");

      const videoData = {
        id: Date.now().toString(),
        name,
        blob: recordedBlob,
        thumbnailUrl: "", // TODO: Generate thumbnail
        timestamps: events.map(e => ({
          timestamp: e.timestamp,
          description: e.description,
          isDangerous: e.isDangerous,
        })),
        transcript: finalTranscriptRef.current || "No speech detected", // Use final transcript from ref
        createdAt: new Date().toISOString(),
      };

      await saveVideoToDB(videoData);
      console.log("✅ Video saved successfully");

      // Close modal and reset state
      setShowSaveModal(false);
      setRecordedBlob(null);
      setEvents([]);
    } catch (err) {
      console.error("❌ Failed to save video:", err);
      alert("Failed to save video. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Real-Time Stream Analysis
          </h1>
          <p className="text-slate-400">
            Two-phase detection: Phase 1 (browser-based fall detection) + Phase 2 (VLM analysis)
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-200">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* VLM Error Display */}
        {vlmError && (
          <div className="mb-4 p-4 bg-yellow-500/20 border border-yellow-500 rounded-lg text-yellow-200">
            <strong>Phase 2 Warning:</strong> {vlmError}
            <p className="text-xs mt-1">Phase 1 detection continues normally</p>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-contain hidden"
                  playsInline
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full object-contain"
                />

                {/* Fall Alert Overlay (Phase 1) */}
                {fallStatus && (
                  <div className="absolute top-4 left-4 right-4 bg-red-600 text-white px-6 py-3 rounded-lg font-bold text-xl text-center animate-pulse">
                    {fallStatus}
                  </div>
                )}

                {/* VLM Alert Overlay (Phase 2) - Independent of Phase 1 */}
                {vlmAlertStatus && (
                  <div className="absolute top-20 left-4 right-4 bg-purple-600 text-white px-6 py-3 rounded-lg font-bold text-xl text-center animate-pulse shadow-lg">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-xs bg-purple-500/50 px-2 py-1 rounded">PHASE 2</span>
                      <span>{vlmAlertStatus}</span>
                    </div>
                  </div>
                )}

                {/* Status Overlay */}
                {!isDetecting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center">
                      {isInitializing ? (
                        <>
                          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
                          <p className="text-white text-lg">Loading AI models...</p>
                        </>
                      ) : (
                        <p className="text-white text-lg">Click "Start Detection" to begin</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline - Directly under video (YouTube style) */}
              {isDetecting && (
                <div className="mt-3 px-2">
                  <Timeline
                    events={events}
                    videoDuration={getElapsedSeconds()}
                    currentTime={getElapsedSeconds()}
                  />
                </div>
              )}

              {/* Controls */}
              <div className="mt-4 space-y-4">
                {/* Start/Stop Button */}
                <div className="flex gap-4">
                  {!isDetecting ? (
                    <button
                      onClick={handleStartDetection}
                      disabled={isInitializing}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      {isInitializing ? "Initializing..." : "Start Detection"}
                    </button>
                  ) : (
                    <button
                      onClick={handleStopDetection}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      Stop Detection
                    </button>
                  )}
                </div>

                {/* Phase 2 Toggle */}
                <div className="bg-slate-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <label htmlFor="phase2-toggle" className="text-white font-semibold cursor-pointer">
                        Enable Phase 2 (VLM Analysis)
                      </label>
                      {vlmStatus === "analyzing" && (
                        <span className="text-blue-400 text-sm animate-pulse">Analyzing...</span>
                      )}
                    </div>
                    <button
                      id="phase2-toggle"
                      onClick={() => {
                        const newState = !isPhase2Enabled;
                        console.log("🔄 Toggle clicked - changing Phase 2 from", isPhase2Enabled, "to", newState);

                        // Update both state (for UI) and ref (for synchronous checks)
                        setIsPhase2Enabled(newState);
                        isPhase2EnabledRef.current = newState;

                        // If toggling during detection, start/stop VLM interval
                        if (isDetecting) {
                          console.log("✅ Detection is running, processing toggle...");
                          if (newState) {
                            // Starting Phase 2 mid-detection
                            console.log("🚀 Enabling Phase 2 during detection");
                            setVlmStatus("active");
                            setVlmError(null);
                            setLastVlmTime(null);
                            lastVlmAnalysisRef.current = 0;
                            vlmIntervalRef.current = setInterval(analyzeFrameWithVLM, 1500);
                            console.log("⏱️ VLM interval created:", vlmIntervalRef.current);
                          } else {
                            // Stopping Phase 2 mid-detection
                            console.log("⏹️ Disabling Phase 2 during detection");
                            if (vlmIntervalRef.current) {
                              clearInterval(vlmIntervalRef.current);
                              vlmIntervalRef.current = null;
                            }
                            activeVlmCallsRef.current = 0; // Reset active calls counter
                            setVlmStatus("inactive");
                            setVlmError(null);
                            setLastVlmTime(null);
                          }
                        } else {
                          // Toggling while not detecting - reset status
                          if (!newState) {
                            setVlmStatus("inactive");
                            setVlmError(null);
                            setLastVlmTime(null);
                          }
                        }
                      }}
                      className={`relative w-14 h-7 rounded-full transition-colors ${
                        isPhase2Enabled ? "bg-green-600" : "bg-slate-500"
                      } cursor-pointer hover:opacity-80`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                          isPhase2Enabled ? "translate-x-7" : ""
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400">Status:</span>
                    {vlmStatus === "inactive" && (
                      <span className="text-slate-400">Inactive</span>
                    )}
                    {vlmStatus === "active" && (
                      <span className="text-green-400">Active</span>
                    )}
                    {vlmStatus === "analyzing" && (
                      <span className="text-blue-400">Analyzing frame...</span>
                    )}
                    {vlmStatus === "error" && (
                      <span className="text-red-400">Error (check console)</span>
                    )}
                  </div>
                  {lastVlmTime && (
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <span className="text-slate-400">Last Analysis:</span>
                      <span className="text-purple-400 font-mono">{lastVlmTime}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    Requires Google Gemini API key. Analyzes frames every 5 seconds (free tier: 250 requests/day limit). Triggers alerts independently of Phase 1.
                  </p>

                  {/* Manual Test Button */}
                  {isDetecting && isPhase2Enabled && (
                    <button
                      onClick={() => {
                        console.log("🧪 Manual VLM test triggered by user");
                        analyzeFrameWithVLM();
                      }}
                      className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2 px-4 rounded transition-colors"
                    >
                      🧪 Test VLM Now (Manual Trigger)
                    </button>
                  )}
                </div>
              </div>

              {/* Stats */}
              {isDetecting && (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="bg-slate-700 rounded-lg p-4">
                      <p className="text-slate-400 text-sm">Elapsed Time</p>
                      <p className="text-white text-2xl font-bold">{elapsedTime}</p>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4">
                      <p className="text-slate-400 text-sm">Events Detected</p>
                      <p className="text-white text-2xl font-bold">{events.length}</p>
                    </div>
                    <div className="bg-slate-700 rounded-lg p-4">
                      <p className="text-slate-400 text-sm">Keypoints</p>
                      <p className="text-white text-2xl font-bold">
                        {lastPoseKeypoints.filter((kp) => kp.score > 0.3).length}
                      </p>
                    </div>
                  </div>

                  {/* Audio Transcription Display */}
                  <div className="mt-4 bg-slate-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-slate-400 text-sm">🎤 Audio Transcript:</span>
                      {recognitionRef.current && (
                        <span className="text-green-400 text-xs animate-pulse">● LISTENING</span>
                      )}
                    </div>
                    <p className="text-white text-sm font-mono">
                      {audioTranscript || "No speech detected..."}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      Multi-modal analysis combines audio + video + pose for 2-3 second response
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Events Panel */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-xl font-bold text-white mb-4">Detected Events</h2>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {events.length === 0 ? (
                  <p className="text-slate-400 text-sm">No events detected yet...</p>
                ) : (
                  events.slice().reverse().map((event, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        event.source === "vlm"
                          ? event.isDangerous
                            ? "bg-purple-500/20 border-purple-500"
                            : "bg-blue-500/20 border-blue-500"
                          : event.isDangerous
                            ? "bg-red-500/20 border-red-500"
                            : "bg-green-500/20 border-green-500"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">
                            {event.timestamp}
                          </span>
                          {event.source === "vlm" && (
                            <span className="text-purple-300 text-xs font-bold px-2 py-0.5 bg-purple-500/30 rounded">
                              Phase 2
                            </span>
                          )}
                        </div>
                        {event.isDangerous && (
                          <span className={`text-xs font-bold ${
                            event.source === "vlm" ? "text-purple-300" : "text-red-400"
                          }`}>
                            DANGER
                          </span>
                        )}
                      </div>
                      <p className="text-slate-200 text-sm mb-2">
                        {event.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-slate-400 text-xs">
                          Confidence: {(event.confidence * 100).toFixed(0)}%
                        </p>
                        <p className="text-slate-500 text-xs">
                          {event.source === "vlm" ? "VLM Analysis" : "Heuristic"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Info Panel */}
            <div className="mt-6 space-y-4">
              <div className="bg-blue-500/20 border border-blue-500 rounded-lg p-4">
                <h3 className="text-blue-300 font-semibold mb-2">Phase 1: Heuristic Detection</h3>
                <ul className="text-sm text-blue-200 space-y-1">
                  <li>• Runs entirely in browser</li>
                  <li>• Zero API dependencies</li>
                  <li>• ~10 FPS detection rate</li>
                  <li>• MoveNet pose estimation</li>
                  <li>• Real-time fall detection</li>
                </ul>
              </div>

              <div className="bg-purple-500/20 border border-purple-500 rounded-lg p-4">
                <h3 className="text-purple-300 font-semibold mb-2">Phase 2: Multi-Modal VLM</h3>
                <ul className="text-sm text-purple-200 space-y-1">
                  <li>• 🎤 Audio (Speech Recognition)</li>
                  <li>• 📸 Video Frame (JPEG)</li>
                  <li>• 🤸 Pose Data (MoveNet)</li>
                  <li>• ⚡ 5-second analysis intervals</li>
                  <li>• 🔄 ~12 requests/minute</li>
                  <li>• Google Gemini 2.5 Flash</li>
                  <li>• Medical emergencies & violence</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Recording Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-4">Save Recording</h2>
            <p className="text-gray-300 mb-4">
              Recording complete! Give your video a name to save it.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const name = formData.get("videoName") as string;
                if (name.trim()) {
                  handleSaveRecording(name.trim());
                }
              }}
            >
              <input
                type="text"
                name="videoName"
                placeholder="Enter video name..."
                className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500 mb-4"
                autoFocus
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveModal(false);
                    setRecordedBlob(null);
                    setEvents([]);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                >
                  Discard
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Video
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
