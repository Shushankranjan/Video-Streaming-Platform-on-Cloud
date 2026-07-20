import { FastifyInstance } from 'fastify';
import { pool } from '../db/index.js';

export default async function historyRoutes(fastify: FastifyInstance) {
  // Get watch history
  fastify.get('/', { onRequest: fastify.authenticate }, async (request) => {
    const result = await pool.query(
      `SELECT v.id, v.title, v.description, v.status, v.manifest_url, v.created_at,
              wh.progress_seconds, wh.watched_at
       FROM watch_history wh
       JOIN videos v ON v.id = wh.video_id
       WHERE wh.user_id = $1
       ORDER BY wh.watched_at DESC`,
      [request.user.userId]
    );
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      manifestUrl: row.manifest_url,
      createdAt: row.created_at,
      progressSeconds: row.progress_seconds,
      watchedAt: row.watched_at,
    }));
  });
}
