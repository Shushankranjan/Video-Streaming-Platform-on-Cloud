import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

interface CdnStackProps extends cdk.StackProps {
  outputBucket: s3.Bucket;
}

export class CdnStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    // Origin Access Control — CloudFront is the only entity that can read from S3
    const oac = new cloudfront.S3OriginAccessControl(this, 'S3Oac', {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(props.outputBucket, {
      originAccessControl: oac,
    });

    // CloudFront distribution — serves HLS manifests and segments from S3.
    // API traffic hits the ALB directly; the frontend uses NEXT_PUBLIC_API_URL to reach it.
    this.distribution = new cloudfront.Distribution(this, 'VspDistribution', {
      comment: 'VSP — HLS delivery from S3',
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // Signed URLs enforced via trusted key groups — add your key group here
        trustedKeyGroups: [],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
    });

    // Grant CloudFront OAC permission to read from the output bucket.
    // Using CfnBucketPolicy (L1) here so the resource lives in CdnStack and
    // does not write back into StorageStack, avoiding a circular dependency.
    new s3.CfnBucketPolicy(this, 'OutputBucketPolicy', {
      bucket: props.outputBucket.bucketName,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 's3:GetObject',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Resource: `arn:aws:s3:::${props.outputBucket.bucketName}/*`,
            Condition: {
              StringEquals: {
                'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
              },
            },
          },
        ],
      },
    });

    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: `https://${this.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
    });
  }
}
