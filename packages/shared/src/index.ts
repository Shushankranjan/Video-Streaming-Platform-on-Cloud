export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Video {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  originalS3Key: string;
  manifestUrl: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
}

export interface WatchHistory {
  id: string;
  userId: string;
  videoId: string;
  progressSeconds: number;
  watchedAt: string;
}

export interface VideoWithHistory extends Video {
  progressSeconds?: number;
}

export interface PresignedUploadUrl {
  url: string;
  fields: Record<string, string>;
  key: string;
  videoId: string;
}
