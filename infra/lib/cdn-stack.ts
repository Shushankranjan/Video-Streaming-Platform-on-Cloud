import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

interface CdnStackProps extends cdk.StackProps {
  outputBucket: s3.Bucket;
  alb: elbv2.ApplicationLoadBalancer;
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

    this.distribution = new cloudfront.Distribution(this, 'VspDistribution', {
      comment: 'VSP — HLS delivery + API proxy',
      defaultBehavior: {
        // Default: proxy to the API (ALB)
        origin: new origins.LoadBalancerV2Origin(props.alb, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,   // API responses must not be cached
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
      additionalBehaviors: {
        // HLS manifests and segments — serve from S3 via OAC
        'videos/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          // Signed URLs are enforced via trusted key groups (configure below)
          trustedKeyGroups: [],  // TODO: add key group with your CloudFront public key
        },
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,  // US, Canada, Europe
    });

    // Grant CloudFront OAC read access to the output S3 bucket
    new s3.CfnBucketPolicy(this, 'OutputBucketPolicy', {
      bucket: props.outputBucket.bucketName,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 's3:GetObject',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Resource: props.outputBucket.arnForObjects('*'),
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
