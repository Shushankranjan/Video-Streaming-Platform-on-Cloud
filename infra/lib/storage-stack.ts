import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly ingressBucket: s3.Bucket;
  public readonly outputBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

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

    // Transcoded HLS output — private, served via CloudFront
    this.outputBucket = new s3.Bucket(this, 'OutputBucket', {
      bucketName: `vsp-output-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3 event notification triggers SQS on new ingress objects (wired in QueueStack)
    new cdk.CfnOutput(this, 'IngressBucketName', { value: this.ingressBucket.bucketName });
    new cdk.CfnOutput(this, 'OutputBucketName', { value: this.outputBucket.bucketName });
  }
}
