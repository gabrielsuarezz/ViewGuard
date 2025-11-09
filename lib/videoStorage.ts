// IndexedDB helper for storing video recordings
// Videos are too large for localStorage, so we use IndexedDB

interface SavedVideo {
  id: string;
  name: string;
  url: string; // Blob URL
  blob: Blob; // Raw video data
  thumbnailUrl: string;
  timestamps: {
    timestamp: string;
    description: string;
    isDangerous: boolean;
  }[];
  transcript: string; // Audio transcript from speech recognition
  createdAt: string;
}

const DB_NAME = "VigilanteVideoStorage";
const STORE_NAME = "videos";
const DB_VERSION = 1;

// Initialize/open the database
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

// Save a video to IndexedDB
export async function saveVideoToDB(video: Omit<SavedVideo, "url">): Promise<void> {
  const db = await openDB();
  const url = URL.createObjectURL(video.blob);

  const videoWithURL: SavedVideo = {
    ...video,
    url,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(videoWithURL);

    request.onsuccess = () => {
      console.log("✅ Video saved to IndexedDB:", video.id);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Get all videos from IndexedDB
export async function getAllVideos(): Promise<SavedVideo[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const videos = request.result as SavedVideo[];
      // Recreate blob URLs for existing videos
      const videosWithURLs = videos.map(v => ({
        ...v,
        url: URL.createObjectURL(v.blob),
      }));
      resolve(videosWithURLs);
    };
    request.onerror = () => reject(request.error);
  });
}

// Get a single video by ID
export async function getVideoById(id: string): Promise<SavedVideo | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const video = request.result as SavedVideo | undefined;
      if (video) {
        // Recreate blob URL
        const videoWithURL = {
          ...video,
          url: URL.createObjectURL(video.blob),
        };
        resolve(videoWithURL);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Delete a video by ID
export async function deleteVideo(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("✅ Video deleted from IndexedDB:", id);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Get summary of all videos for the saved-videos page
export async function getVideoSummaries() {
  const videos = await getAllVideos();
  return videos.map(v => ({
    id: v.id,
    name: v.name,
    url: v.url,
    thumbnailUrl: v.thumbnailUrl,
    timestamps: v.timestamps,
  }));
}
