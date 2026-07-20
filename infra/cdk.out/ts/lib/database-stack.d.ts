import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
interface DatabaseStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
}
export declare class DatabaseStack extends cdk.Stack {
    readonly cluster: rds.DatabaseInstance;
    readonly secret: rds.DatabaseInstanceFromSnapshot['secret'];
    readonly dbSg: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props: DatabaseStackProps);
}
export {};
