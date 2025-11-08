import { useState, useRef, useEffect } from "react";
import { X, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Detection } from "./CCTVTile";
import { usePersonDetection } from "@/hooks/usePersonDetection";
import { getCurrentVideo, getNextVideo } from "@/config/videoScheduler";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraId: number;
  detection: Detection | null;
  videoSources?: string[];
}

const CameraModal = ({ isOpen, onClose, cameraId, detection, videoSources }: CameraModalProps) => {
  const [currentVideo, setCurrentVideo] = useState(() => getCurrentVideo(cameraId));
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle video end - get next unique video from scheduler
  const handleVideoEnd = () => {
    const nextVideo = getNextVideo(cameraId);
    setCurrentVideo(nextVideo);
  };

  // Update video when camera changes
  useEffect(() => {
    if (isOpen) {
      setCurrentVideo(getCurrentVideo(cameraId));
    }
  }, [cameraId, isOpen]);

  // Use person detection with TensorFlow.js - DISABLED for performance
  const { detections: personDetections } = usePersonDetection(videoRef, false, 200, 0.2);

  const getCurrentTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-card border-border">
        <DialogHeader className="glass border-b border-border p-4">
          <DialogTitle className="text-foreground font-bold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Camera {cameraId} — Live Feed
          </DialogTitle>
        </DialogHeader>

        <div className="p-4">
          {/* Expanded Video Feed */}
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden scanline film-grain mb-4">
            <video
              ref={videoRef}
              src={currentVideo}
              autoPlay
              muted
              playsInline
              onEnded={handleVideoEnd}
              className="w-full h-full object-cover"
            />

            {/* Timestamp */}
            <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 text-xs font-mono text-foreground/80">
              {getCurrentTime()}
            </div>

            {/* Camera ID */}
            <div className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 text-xs font-semibold text-foreground/80">
              CAM {cameraId}
            </div>

            {/* Person Detection Overlays (Green Boxes) */}
            {personDetections.map((person, index) => {
              const videoElement = videoRef.current;
              if (!videoElement) return null;

              const videoWidth = videoElement.offsetWidth;
              const videoHeight = videoElement.offsetHeight;

              // Convert pixel coordinates to percentages
              const [x, y, width, height] = person.bbox;
              const leftPercent = (x / videoWidth) * 100;
              const topPercent = (y / videoHeight) * 100;
              const widthPercent = (width / videoWidth) * 100;
              const heightPercent = (height / videoHeight) * 100;

              return (
                <div
                  key={`person-${index}`}
                  className="absolute z-20"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    width: `${widthPercent}%`,
                    height: `${heightPercent}%`,
                  }}
                >
                  {/* Green Bounding Box for Person */}
                  <div className="w-full h-full border-2 border-green-500">
                    {/* Label */}
                    <div className="absolute -top-6 left-0 px-2 py-1 text-xs font-bold bg-green-500 text-white">
                      PERSON
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Event Detection Overlay (Red/Orange/Yellow Boxes) */}
            {detection && (
              <div
                className="absolute border-2 border-alert-high pulse-glow z-30"
                style={{
                  left: `${detection.x}%`,
                  top: `${detection.y}%`,
                  width: `${detection.width}%`,
                  height: `${detection.height}%`,
                }}
              >
                <div className="absolute -top-8 left-0 px-3 py-1 bg-alert-high text-background text-sm font-bold">
                  {detection.type} — {detection.confidence}%
                </div>
              </div>
            )}
          </div>

          {/* Timeline Scrubber */}
          <div className="glass rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground font-mono">00:00</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-primary"></div>
              </div>
              <span className="text-xs text-muted-foreground font-mono">05:00</span>
            </div>

            {/* Logged Detections */}
            <div className="mt-4">
              <h4 className="text-xs font-bold text-foreground mb-2">Logged Detections</h4>
              <div className="space-y-2">
                {detection ? (
                  <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                    <span className="text-foreground font-semibold">{detection.type}</span>
                    <span className="text-muted-foreground">{detection.confidence}%</span>
                    <span className="text-muted-foreground font-mono">{detection.timestamp}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No detections logged</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CameraModal;
