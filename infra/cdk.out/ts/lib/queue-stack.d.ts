import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
export declare class QueueStack extends cdk.Stack {
    readonly transcodeQueue: sqs.Queue;
    readonly transcodeQueueDlq: sqs.Queue;
    constructor(scope: Construct, id: string, props: cdk.StackProps);
}
