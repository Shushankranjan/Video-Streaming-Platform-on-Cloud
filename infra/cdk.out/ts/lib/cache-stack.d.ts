import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
interface CacheStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
}
export declare class CacheStack extends cdk.Stack {
    readonly redisEndpoint: string;
    readonly redisSg: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props: CacheStackProps);
}
export {};
