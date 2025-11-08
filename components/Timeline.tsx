"use client";

// Define the shape of an event object, which we get from our main page
interface TimestampEvent {
  timestamp: string;
  description: string;
  isDangerous: boolean;
}

interface TimelineProps {
  events: TimestampEvent[];
  videoDuration: number; // Total duration in seconds
  currentTime: number;   // Current playback time in seconds
}

// Helper to convert "MM:SS" timestamp to a percentage
const timeToPercentage = (timestamp: string, duration: number) => {
  if (duration === 0) return 0;
  const [minutes, seconds] = timestamp.split(':').map(Number);
  const timeInSeconds = minutes * 60 + seconds;
  return (timeInSeconds / duration) * 100;
};

export function Timeline({ events, videoDuration, currentTime }: TimelineProps) {
  const duration = videoDuration || 1; // Prevent division by zero
  const currentPercentage = Math.min((currentTime / duration) * 100, 100);

  return (
    <div className="w-full">
      {/* Timeline Container - YouTube style */}
      <div className="w-full h-3 bg-gray-700/50 rounded-full relative overflow-hidden cursor-pointer hover:h-4 transition-all group">

        {/* Blue Progress Bar (fills from left to right) */}
        <div
          className="absolute top-0 left-0 h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${currentPercentage}%` }}
        />

        {/* Red Danger Segments (overlays on the timeline) */}
        {events.filter(event => event.isDangerous).map((event, index) => {
          const percentage = timeToPercentage(event.timestamp, duration);

          return (
            <div
              key={`danger-${index}`}
              className="absolute top-0 h-full bg-red-500 transition-all"
              style={{
                left: `${Math.max(0, percentage - 1)}%`,
                width: '2%',
                minWidth: '4px'
              }}
              title={`⚠️ ${event.timestamp}: ${event.description}`}
            />
          );
        })}

        {/* Safe Event Markers (small indicators) */}
        {events.filter(event => !event.isDangerous).map((event, index) => {
          const percentage = timeToPercentage(event.timestamp, duration);

          return (
            <div
              key={`safe-${index}`}
              className="absolute top-0 h-full bg-green-400/70 transition-all"
              style={{
                left: `${percentage}%`,
                width: '1%',
                minWidth: '2px'
              }}
              title={`✓ ${event.timestamp}: ${event.description}`}
            />
          );
        })}

        {/* Current Time Playhead - More visible on hover */}
        <div
          className="absolute top-0 h-full w-1 bg-white shadow-lg group-hover:w-1.5 transition-all"
          style={{ left: `${currentPercentage}%` }}
        />
      </div>

      {/* Time Display */}
      <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
        <span className="font-mono">
          {Math.floor(currentTime / 60).toString().padStart(2, '0')}:
          {(currentTime % 60).toString().padStart(2, '0')}
        </span>
        <span className="font-mono">
          {Math.floor(duration / 60).toString().padStart(2, '0')}:
          {(duration % 60).toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
