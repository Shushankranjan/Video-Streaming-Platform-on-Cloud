import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { DatabaseStack } from './database-stack';
import { CacheStack } from './cache-stack';
import { StorageStack } from './storage-stack';
import { QueueStack } from './queue-stack';
import { AuthStack } from './auth-stack';
interface EcsStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
    apiRepo: ecr.Repository;
    workerRepo: ecr.Repository;
    database: DatabaseStack;
    cache: CacheStack;
    storage: StorageStack;
    queue: QueueStack;
    auth: AuthStack;
}
export declare class EcsStack extends cdk.Stack {
    readonly alb: elbv2.ApplicationLoadBalancer;
    readonly cluster: ecs.Cluster;
    constructor(scope: Construct, id: string, props: EcsStackProps);
}
export {};
