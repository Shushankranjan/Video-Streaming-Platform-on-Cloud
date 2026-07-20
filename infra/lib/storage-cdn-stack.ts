import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

/**
 * StorageCdnStack — owns both S3 buckets AND the CloudFront distribution.
 *
 * Keeping them in one stack eliminates the cross-stack reference cycle that
 * occurred when CdnStack referenced StorageStack's bucket domain name while
 * StorageStack transitively depended on CdnStack's distribution ID.
 */
export class StorageCdnStack extends cdk.Stack {
  public readonly ingressBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // ── S3 Buckets ────────────────────────────────────────────────────────────

    // Raw upload ingress — private, lifecycle rule archives after 30 days
    this.ingressBucket = new s3.Bucket(this, 'IngressBucket', {
      bucketName: `vsp-ingress-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      lifecycleRules: [
        {
          id: 'ArchiveRawUploads',
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Transcoded HLS output — private, served exclusively via CloudFront
    this.outputBucket = new s3.Bucket(this, 'OutputBucket', {
      bucketName: `vsp-output-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── CloudFront + OAC ──────────────────────────────────────────────────────

    const oac = new cloudfront.S3OriginAccessControl(this, 'S3Oac', {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    // CloudFront serves HLS manifests and segments from the output bucket.
    // API traffic hits the ALB directly via NEXT_PUBLIC_API_URL.
    this.distribution = new cloudfront.Distribution(this, 'VspDistribution', {
      comment: 'VSP — HLS delivery from S3',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.outputBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Add your CloudFront key group here to enforce signed URLs:
        trustedKeyGroups: [],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // Grant the CloudFront distribution read access to the output bucket
    this.outputBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
        resources: [this.outputBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          },
        },
      }),
    );

    new cdk.CfnOutput(this, 'IngressBucketName', { value: this.ingressBucket.bucketName });
    new cdk.CfnOutput(this, 'OutputBucketName', { value: this.outputBucket.bucketName });
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
    });
  }
}
