'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../components/auth-provider';
import { VideoWithHistory } from '@vsp/shared';

export default function VideosPage() {
  const { token, user, loading: authLoading, logout } = useAuth();
  const [videos, setVideos] = useState<VideoWithHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch('/api/videos', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to fetch videos');
        const data = await res.json();
        setVideos(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Your Videos</h1>
        <div className="space-x-3">
          <a
            href="/upload"
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Upload Video
          </a>
          <button
            onClick={logout}
            className="inline-block bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            Logout
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading ? (
        <p>Loading videos...</p>
      ) : videos.length === 0 ? (
        <p className="text-gray-600">No videos yet. Upload your first one!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <a
              key={video.id}
              href={`/watch?id=${video.id}`}
              className="block bg-white rounded shadow hover:shadow-lg transition"
            >
              <div className="bg-gray-200 h-40 flex items-center justify-center text-gray-500">
                {video.status === 'ready' ? '▶️' : '⏳'}
              </div>
              <div className="p-4">
                <h2 className="font-semibold text-lg truncate">{video.title}</h2>
                <p className="text-sm text-gray-600 line-clamp-2">{video.description || 'No description'}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span
                    className={`px-2 py-1 rounded ${
                      video.status === 'ready'
                        ? 'bg-green-100 text-green-800'
                        : video.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {video.status}
                  </span>
                  {video.progressSeconds ? (
                    <span className="text-gray-500">{Math.floor(video.progressSeconds / 60)}m watched</span>
                  ) : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
