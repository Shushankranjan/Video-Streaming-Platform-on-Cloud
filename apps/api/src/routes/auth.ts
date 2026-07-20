import bcrypt from 'bcryptjs';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { config } from '../lib/config.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/** Cognito token exchange body */
const cognitoCallbackSchema = z.object({
  /** The Cognito access token obtained via the hosted UI / OAuth callback */
  accessToken: z.string(),
  /** Optional: refresh token for session persistence */
  refreshToken: z.string().optional(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // ── Cognito: token callback ──────────────────────────────────────────────
  // POST /auth/callback — called by the frontend after the Cognito hosted UI
  // redirects back with an authorization code. The frontend exchanges the code
  // for tokens client-side (via Amplify or PKCE), then posts the access token
  // here so we can upsert the user record in our own DB.
  fastify.post('/callback', async (request, reply) => {
    if (!config.useCognito) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const body = cognitoCallbackSchema.parse(request.body);

    // Verify the token using the same verifier the auth plugin uses
    const { CognitoJwtVerifier } = await import('aws-jwt-verify');
    const verifier = CognitoJwtVerifier.create({
      userPoolId: config.cognitoUserPoolId,
      tokenUse: 'access',
      clientId: config.cognitoClientId,
    });
    const payload = await verifier.verify(body.accessToken);
    const cognitoSub = payload.sub;
    const email = (payload as any).email ?? '';

    // Upsert the user in our PostgreSQL users table
    await pool.query(
      `INSERT INTO users (cognito_sub, email) VALUES ($1, $2)
       ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email`,
      [cognitoSub, email],
    );

    return { success: true, userId: cognitoSub };
  });

  // ── Local dev: email + password auth ─────────────────────────────────────
  fastify.post('/register', async (request, reply) => {
    if (config.useCognito) {
      return reply.status(501).send({ error: 'Use Cognito hosted UI for registration' });
    }
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0].message });
    }
    const body = parseResult.data;
    const passwordHash = await bcrypt.hash(body.password, 10);

    try {
      const result = await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [body.email, passwordHash],
      );
      const user = result.rows[0];
      const token = fastify.jwt.sign({ userId: user.id, email: user.email });
      return { token, user: { id: user.id, email: user.email } };
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Email already exists' });
      }
      throw err;
    }
  });

  fastify.post('/login', async (request, reply) => {
    if (config.useCognito) {
      return reply.status(501).send({ error: 'Use Cognito hosted UI for login' });
    }
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0].message });
    }
    const body = parseResult.data;
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [body.email],
    );
    const user = result.rows[0];
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const token = fastify.jwt.sign({ userId: user.id, email: user.email });
    return { token, user: { id: user.id, email: user.email } };
  });

  fastify.get('/me', { onRequest: fastify.authenticate }, async (request) => {
    return { user: request.user };
  });
}

