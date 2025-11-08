"use client";

import { useEffect, useState } from "react";
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
}

export default function VideoReviewPage() {
  const [video, setVideo] = useState<SavedVideo | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

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
    setVideoDuration(e.currentTarget.duration);
  };

  // Handle time updates from the video player
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-4">{video.name}</h1>

      {/* Video Player */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800 mb-4">
        <video
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
      />

      {/* Timestamp List */}
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-3">Detected Events</h2>
        <ul className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          {video.timestamps.map((ts, index) => (
            <li
              key={index}
              className={`py-2 border-b border-gray-700 last:border-b-0 ${
                ts.isDangerous ? "text-red-400" : "text-blue-300"
              }`}
            >
              <span className="font-mono">{ts.timestamp}</span> - {ts.description}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
