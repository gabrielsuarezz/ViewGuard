"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { getVideoById } from "@/lib/videoStorage";

// Define the types (ideally these would be in a shared types file)
interface TimestampEvent {
  timestamp: string;
  description: string;
  isDangerous: boolean;
}

interface SavedVideo {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  timestamps: TimestampEvent[];
  transcript: string;
}

export default function VideoReviewPage() {
  const [video, setVideo] = useState<SavedVideo | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const params = useParams();
  const { id } = params;

  useEffect(() => {
    const loadVideo = async () => {
      if (id) {
        try {
          const foundVideo = await getVideoById(id as string);
          if (foundVideo) {
            setVideo(foundVideo);
          }
        } catch (err) {
          console.error("Failed to load video:", err);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadVideo();
  }, [id]);

  // Force duration update if video ref is available but duration is 0
  useEffect(() => {
    const checkDuration = () => {
      if (videoRef.current && videoDuration === 0 && videoRef.current.duration) {
        console.log("🔄 Updating video duration from ref:", videoRef.current.duration);
        setVideoDuration(videoRef.current.duration);
      }
    };

    // Check after a short delay to ensure metadata is loaded
    const timer = setTimeout(checkDuration, 500);
    return () => clearTimeout(timer);
  }, [video, videoDuration]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-400">Loading video...</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-400">Video not found</p>
      </div>
    );
  }

  // Handle setting duration once the video metadata is loaded
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const duration = e.currentTarget.duration;
    console.log("📹 Video metadata loaded. Duration:", duration, "seconds");
    setVideoDuration(duration);
  };

  // Handle time updates from the video player
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  // Handle seeking from timeline
  const handleSeek = (timeInSeconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeInSeconds;
    }
  };

  // Handle clicking on an event to seek to that timestamp
  const handleEventClick = (timestamp: string) => {
    // Parse "MM:SS" to seconds
    const [minutes, seconds] = timestamp.split(':').map(Number);
    const timeInSeconds = minutes * 60 + seconds;
    // Seek 1 second before the event to see it happen
    const seekTime = Math.max(0, timeInSeconds - 1);
    handleSeek(seekTime);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-4">{video.name}</h1>

      {/* Video Player */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800 mb-4">
        <video
          ref={videoRef}
          src={video.url}
          controls
          className="w-full h-full"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>

      {/* Timeline */}
      <Timeline
        events={video.timestamps}
        videoDuration={videoDuration}
        currentTime={currentTime}
        onSeek={handleSeek}
      />

      {/* Detected Events */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Detected Events</h2>
        <div className="space-y-3">
          {video.timestamps.length === 0 ? (
            <p className="text-gray-400 text-sm">No events detected</p>
          ) : (
            video.timestamps.map((event, index) => (
              <div
                key={index}
                onClick={() => handleEventClick(event.timestamp)}
                className={`p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${
                  event.isDangerous
                    ? "bg-red-500/20 border-red-500 hover:bg-red-500/30"
                    : "bg-blue-500/20 border-blue-500 hover:bg-blue-500/30"
                }`}
                title={`Click to jump to ${event.timestamp}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-white font-semibold font-mono">
                    {event.timestamp}
                  </span>
                  {event.isDangerous && (
                    <span className="text-red-300 text-xs font-bold">⚠️ DANGER</span>
                  )}
                </div>
                <p className="text-gray-200 text-sm">{event.description}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audio Transcript */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-3">Audio Transcript</h2>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <p className="text-gray-300 whitespace-pre-wrap">
            {video.transcript || "No speech detected"}
          </p>
        </div>
      </div>
    </div>
  );
}
