import { useEffect, useRef, useState } from 'react';

export interface TimelineEvent {
  timestamp: number; // in seconds
  type: 'fall' | 'ground' | 'hands_raised' | 'vlm_detection';
  label: string;
  confidence?: number;
}

interface TimelineProps {
  duration: number; // total video duration in seconds
  currentTime: number; // current playback time in seconds
  events: TimelineEvent[];
  onSeek: (time: number) => void;
}

export const Timeline = ({ duration, currentTime, events, onSeek }: TimelineProps) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getEventColor = (type: TimelineEvent['type']): string => {
    switch (type) {
      case 'fall':
        return 'bg-red-500';
      case 'ground':
        return 'bg-orange-500';
      case 'hands_raised':
        return 'bg-yellow-500';
      case 'vlm_detection':
        return 'bg-purple-500';
      default:
        return 'bg-blue-500';
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    onSeek(Math.max(0, Math.min(newTime, duration)));
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    onSeek(Math.max(0, Math.min(newTime, duration)));
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isDragging]);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Timeline bar */}
      <div
        ref={timelineRef}
        className="relative h-12 bg-gray-800/50 rounded-lg cursor-pointer border border-gray-700 overflow-hidden"
        onClick={handleTimelineClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
      >
        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-full bg-primary/30 transition-all duration-100"
          style={{ width: `${progressPercentage}%` }}
        />

        {/* Current time indicator */}
        <div
          className="absolute top-0 h-full w-1 bg-primary shadow-lg shadow-primary/50"
          style={{ left: `${progressPercentage}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full shadow-lg shadow-primary/50" />
        </div>

        {/* Event markers */}
        {events.map((event, index) => {
          const eventPercentage = (event.timestamp / duration) * 100;
          return (
            <div
              key={`${event.type}-${event.timestamp}-${index}`}
              className="absolute top-0 bottom-0 group"
              style={{ left: `${eventPercentage}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(event.timestamp);
              }}
            >
              {/* Marker line */}
              <div className={`h-full w-1 ${getEventColor(event.type)} opacity-70 hover:opacity-100 transition-opacity`} />

              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs">
                  <div className="font-semibold text-primary">{event.label}</div>
                  <div className="text-gray-400">{formatTime(event.timestamp)}</div>
                  {event.confidence && (
                    <div className="text-gray-400">
                      {(event.confidence * 100).toFixed(0)}% confidence
                    </div>
                  )}
                </div>
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                  <div className="border-4 border-transparent border-t-gray-700" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Time display */}
      <div className="flex justify-between items-center text-sm text-gray-400 px-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Event legend */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-gray-400 px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-sm" />
            <span>Fall Detection</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-orange-500 rounded-sm" />
            <span>Person on Ground</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-yellow-500 rounded-sm" />
            <span>Hands Raised</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-purple-500 rounded-sm" />
            <span>VLM Detection</span>
          </div>
        </div>
      )}
    </div>
  );
};
