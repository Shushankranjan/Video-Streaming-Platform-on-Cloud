import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export class QueueStack extends cdk.Stack {
  public readonly transcodeQueue: sqs.Queue;
  public readonly transcodeQueueDlq: sqs.Queue;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // Dead-letter queue — catches messages that fail maxReceiveCount times
    this.transcodeQueueDlq = new sqs.Queue(this, 'TranscodeQueueDlq', {
      queueName: 'vsp-transcode-dlq.fifo',
      fifo: true,
      retentionPeriod: cdk.Duration.days(14),
    });

    // Main FIFO queue — each videoId is a message group for deduplication
    this.transcodeQueue = new sqs.Queue(this, 'TranscodeQueue', {
      queueName: 'vsp-transcode.fifo',
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.minutes(10), // must be >= worker processing time
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.transcodeQueueDlq,
        maxReceiveCount: 3,   // retry 3x before sending to DLQ
      },
    });

    new cdk.CfnOutput(this, 'TranscodeQueueUrl', { value: this.transcodeQueue.queueUrl });
    new cdk.CfnOutput(this, 'TranscodeQueueArn', { value: this.transcodeQueue.queueArn });
  }
}
