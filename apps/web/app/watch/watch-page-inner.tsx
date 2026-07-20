'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Hls from 'hls.js';
import { useAuth } from '../../components/auth-provider';
import { VideoWithHistory } from '@vsp/shared';

export default function WatchPageInner() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get('id');
  const { token, user, loading: authLoading } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<VideoWithHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!videoId || !token) return;
    fetch(`/api/videos/${videoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load video');
        const data = await res.json();
        setVideo(data);
        setProgress(data.progressSeconds || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [videoId, token]);

  useEffect(() => {
    if (!video?.manifestUrl || !videoRef.current) return;
    const videoEl = videoRef.current;
    const startTime = progress;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(video.manifestUrl);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (startTime > 0) {
          videoEl.currentTime = startTime;
        }
        videoEl.play().catch(() => {});
      });
      return () => {
        hls.destroy();
      };
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      videoEl.src = video.manifestUrl;
      if (startTime > 0) videoEl.currentTime = startTime;
      videoEl.play().catch(() => {});
    }
  }, [video?.manifestUrl, progress]);

  useEffect(() => {
    if (!videoId || !token) return;
    const interval = setInterval(() => {
      const videoEl = videoRef.current;
      if (!videoEl || videoEl.paused || videoEl.ended) return;
      const currentTime = Math.floor(videoEl.currentTime);
      setProgress(currentTime);
      fetch(`/api/videos/${videoId}/progress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ progressSeconds: currentTime }),
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [videoId, token]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <span className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Checking your session...
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/';
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <a href="/videos" className="text-blue-600 hover:underline">
          ← Back to videos
        </a>
      </div>

      {loading ? (
        <p>Loading video...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : video ? (
        <>
          <h1 className="text-2xl font-bold mb-4">{video.title}</h1>
          <div className="bg-black rounded overflow-hidden aspect-video">
            {video.status === 'ready' ? (
              <video
                ref={videoRef}
                controls
                className="w-full h-full"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-white">
                <div className="text-center">
                  <p className="text-xl mb-2">Video is {video.status}</p>
                  <p className="text-gray-400">Please check back later.</p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-gray-700">{video.description || 'No description'}</p>
          {video.status === 'ready' && (
            <p className="mt-2 text-sm text-gray-500">
              Progress: {Math.floor(progress / 60)}m {progress % 60}s
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
