# Video Recording System Documentation

## Overview

The VigilanteAI app now has a complete video recording system that captures webcam footage during detection sessions and allows users to save and review their recordings.

## How It Works

### 1. Recording Flow

```
User clicks "Start Detection"
    ↓
Webcam starts
    ↓
MediaRecorder starts capturing video
    ↓
Pose detection runs (events are tracked)
    ↓
User clicks "Stop Detection"
    ↓
MediaRecorder stops, creates video Blob
    ↓
Save Modal appears
    ↓
User names and saves the video
    ↓
Video stored in IndexedDB
    ↓
Available in "Saved Videos" gallery
```

### 2. Architecture Components

#### A. **Video Storage** (`lib/videoStorage.ts`)
- Uses **IndexedDB** for storing video files (localStorage is too small)
- Stores video as Blob objects with metadata
- Functions:
  - `saveVideoToDB(video)` - Saves a new recording
  - `getAllVideos()` - Gets all saved videos
  - `getVideoById(id)` - Gets a specific video
  - `deleteVideo(id)` - Deletes a video
  - `getVideoSummaries()` - Gets video list for gallery

#### B. **Recording Logic** (`app/realtime-stream/page.tsx`)
- **MediaRecorder API** captures the webcam stream
- Recording starts automatically with detection
- Recording stops when user clicks "Stop Detection"
- Codec: `video/webm;codecs=vp9` (widely supported)
- Data captured every 100ms for smooth playback

#### C. **Save Modal** (`app/realtime-stream/page.tsx` lines 1180-1228)
- Appears after recording stops
- User can:
  - Name the video
  - Save to IndexedDB
  - Discard the recording
- Dark-themed modal matching app design

#### D. **Saved Videos Gallery** (`app/saved-videos/page.tsx`)
- Loads all videos from IndexedDB on mount
- Displays grid of video cards
- Shows:
  - Video name
  - Number of detected events
  - Video icon placeholder
- Click to view full video review

#### E. **Video Review Page** (`app/video/[id]/page.tsx`)
- Loads specific video by ID from IndexedDB
- Features:
  - Full video player with controls
  - Timeline component showing detected events
  - List of all events with timestamps
  - Color-coded events (red = dangerous, blue = normal)

## Data Structure

### SavedVideo Object
```typescript
{
  id: string;               // Timestamp-based unique ID
  name: string;             // User-provided name
  blob: Blob;               // Raw video data
  url: string;              // Blob URL for playback
  thumbnailUrl: string;     // (Future: video thumbnail)
  timestamps: {             // Detected events
    timestamp: string;      // "MM:SS" format
    description: string;    // Event description
    isDangerous: boolean;   // Alert level
  }[];
  createdAt: string;        // ISO timestamp
}
```

## User Workflow

### Recording a Session
1. Navigate to `/realtime-stream`
2. Click "Start Detection"
3. Webcam activates, recording begins automatically
4. AI detects events (falls, suspicious activity, etc.)
5. Click "Stop Detection"
6. Save modal appears
7. Enter a name like "Front Door - Nov 8"
8. Click "Save Video"

### Reviewing a Recording
1. Navigate to `/saved-videos`
2. Browse your saved recordings
3. Click on any video card
4. Video player loads with:
   - Full playback controls
   - Timeline with event markers
   - List of all detected events
5. Scrub through timeline to review specific events

### Managing Storage
- Videos are stored in browser's IndexedDB
- Each browser has ~50-500MB limit (varies)
- Consider implementing:
  - Delete functionality (future feature)
  - Export to file (future feature)
  - Cloud backup (future feature)

## Technical Details

### Browser Compatibility
- **MediaRecorder API**: Chrome, Edge, Firefox, Safari 14.1+
- **IndexedDB**: All modern browsers
- **Video Codec**: WebM/VP9 (widely supported)

### Performance Considerations
- Recording runs alongside pose detection with minimal overhead
- Data chunks captured every 100ms balance quality and memory
- IndexedDB is asynchronous (non-blocking)
- Blob URLs created on-demand for playback

### Storage Size Estimates
- 1 minute @ 720p: ~5-10MB
- 5 minutes @ 720p: ~25-50MB
- 10 minutes @ 720p: ~50-100MB

## Future Enhancements

### Planned Features
1. **Thumbnail Generation**
   - Capture first frame as thumbnail
   - Display in gallery grid

2. **Delete Functionality**
   - Remove unwanted recordings
   - Free up storage space

3. **Export Video**
   - Download as .webm file
   - Share recordings externally

4. **Cloud Storage**
   - Upload to AWS S3 / Google Cloud
   - Access from any device

5. **Video Editing**
   - Trim to event timestamps
   - Export highlight clips

6. **Search & Filter**
   - Search by name, date, event type
   - Filter dangerous vs. normal events

## Troubleshooting

### "Recording not saving"
- Check browser console for errors
- Verify IndexedDB is enabled
- Ensure sufficient storage space

### "Videos not appearing in gallery"
- Check IndexedDB in DevTools → Application → IndexedDB → VigilanteVideoStorage
- Verify `getVideoSummaries()` is working
- Check browser console for errors

### "Video won't play"
- Blob URL may have expired (refresh page)
- Browser may not support WebM/VP9
- Try different browser (Chrome recommended)

### "Modal not appearing after stopping"
- Check that events were detected (modal only shows if events.length > 0)
- Verify `recordedBlob` state is set
- Check browser console for errors

## Code References

### Key Files
- `lib/videoStorage.ts` - IndexedDB helper functions
- `app/realtime-stream/page.tsx:69-74` - Recording state
- `app/realtime-stream/page.tsx:217-258` - Recording functions
- `app/realtime-stream/page.tsx:678-679` - Start recording
- `app/realtime-stream/page.tsx:715-716` - Stop recording
- `app/realtime-stream/page.tsx:800-834` - Save function
- `app/realtime-stream/page.tsx:1180-1228` - Save modal UI
- `app/saved-videos/page.tsx` - Gallery page
- `app/video/[id]/page.tsx` - Review page

## Testing Checklist

- [ ] Start detection → recording begins
- [ ] Stop detection → modal appears
- [ ] Save video → appears in gallery
- [ ] Click video in gallery → opens review page
- [ ] Video plays with controls
- [ ] Timeline shows events
- [ ] Events list displays correctly
- [ ] Discard button works
- [ ] Multiple videos can be saved
- [ ] Page refresh preserves videos

## Notes for Developers

- **Never use localStorage for videos** - 5-10MB limit, too small
- **Always cleanup Blob URLs** - Prevents memory leaks
- **IndexedDB is async** - Use async/await patterns
- **Test across browsers** - Safari has different codec support
- **Consider quota** - IndexedDB has storage limits

---

**Last Updated**: November 8, 2025
**Version**: 1.0
