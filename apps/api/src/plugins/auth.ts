import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../lib/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { userId: string; email: string };
  }
}

export default fp(async function (fastify: FastifyInstance) {
  if (config.useCognito) {
    // ── Production: verify Cognito access tokens via JWKS ──────────────────
    const verifier = CognitoJwtVerifier.create({
      userPoolId: config.cognitoUserPoolId,
      tokenUse: 'access',
      clientId: config.cognitoClientId,
    });

    fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const token = authHeader.slice(7);
      try {
        const payload = await verifier.verify(token);
        // Normalize Cognito claims to the same shape used by local JWT
        (request as any).user = {
          userId: payload.sub,
          email: (payload as any).email ?? '',
        };
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    });
  } else {
    // ── Local dev: symmetric JWT via @fastify/jwt ──────────────────────────
    await fastify.register(jwt, { secret: config.jwtSecret });

    fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    });
  }
});

