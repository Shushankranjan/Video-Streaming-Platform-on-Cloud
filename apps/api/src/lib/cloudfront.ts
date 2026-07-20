/**
 * cloudfront.ts — Generate CloudFront signed URLs for secure HLS delivery.
 *
 * In production (CLOUDFRONT_DOMAIN set):
 *   - Returns a signed CloudFront URL valid for `config.cloudfrontSignedUrlTtlSeconds`.
 *
 * In local dev (CLOUDFRONT_DOMAIN not set):
 *   - Falls back to a plain URL pointing at the local API static file server.
 */

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { config } from './config.js';

/**
 * Build a signed CloudFront URL for an HLS manifest.
 * @param s3Key - The S3 object key, e.g. `videos/<id>/master.m3u8`
 */
export function getSignedStreamUrl(s3Key: string): string {
  if (!config.cloudfrontDomain || !config.cloudfrontKeyPairId || !config.cloudfrontPrivateKey) {
    // Local dev fallback: serve from the static file handler on the API server
    return `${config.apiBaseUrl}/streams/${s3Key}`;
  }

  const url = `${config.cloudfrontDomain}/${s3Key}`;
  const dateLessThan = new Date(
    Date.now() + config.cloudfrontSignedUrlTtlSeconds * 1000,
  ).toISOString();

  return getSignedUrl({
    url,
    keyPairId: config.cloudfrontKeyPairId,
    dateLessThan,
    privateKey: config.cloudfrontPrivateKey,
  });
}
