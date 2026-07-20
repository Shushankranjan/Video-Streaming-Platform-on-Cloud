import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
export declare class EcrStack extends cdk.Stack {
    readonly apiRepo: ecr.Repository;
    readonly workerRepo: ecr.Repository;
    readonly webRepo: ecr.Repository;
    constructor(scope: Construct, id: string, props: cdk.StackProps);
}
