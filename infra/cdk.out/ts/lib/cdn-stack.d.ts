import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
interface CdnStackProps extends cdk.StackProps {
    outputBucket: s3.Bucket;
    alb: elbv2.ApplicationLoadBalancer;
}
export declare class CdnStack extends cdk.Stack {
    readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: CdnStackProps);
}
export {};
