"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Folder, Video } from "lucide-react";
import { getVideoSummaries } from "@/lib/videoStorage";

// Define the type for our saved video (same as in realtime-stream page)
interface SavedVideo {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  timestamps: {
    timestamp: string;
    description: string;
    isDangerous: boolean;
  }[];
}

export default function SavedVideosPage() {
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load videos from IndexedDB
    const loadVideos = async () => {
      try {
        const videos = await getVideoSummaries();
        setSavedVideos(videos);
      } catch (err) {
        console.error("Failed to load videos:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadVideos();
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6">
        Saved Recordings
      </h1>

      {isLoading ? (
        <p>Loading...</p>
      ) : savedVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-gray-800 rounded-lg border border-gray-700">
          <Folder className="w-16 h-16 text-gray-500 mb-4" />
          <h2 className="text-xl font-semibold">No Videos Saved</h2>
          <p className="text-gray-400">
            Go to the "Live Analysis" page to record and save a new video.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {savedVideos.map((video) => (
            <Link
              href={`/video/${video.id}`}
              key={video.id}
              className="block bg-gray-800 rounded-lg overflow-hidden border border-gray-700 transition-transform hover:scale-105"
            >
              <div className="w-full h-40 bg-gray-700 flex items-center justify-center">
                <Video className="w-12 h-12 text-gray-500" />
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-white truncate">
                  {video.name}
                </h3>
                <p className="text-sm text-gray-400">
                  {video.timestamps.length} events
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
