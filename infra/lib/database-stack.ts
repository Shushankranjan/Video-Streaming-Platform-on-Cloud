import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class DatabaseStack extends cdk.Stack {
  public readonly cluster: rds.DatabaseInstance;
  public readonly secret: rds.DatabaseInstanceFromSnapshot['secret'];
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Security group — only allow inbound 5432 from the VPC
    this.dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: props.vpc,
      description: 'VSP PostgreSQL security group',
    });
    this.dbSg.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from VPC',
    );

    // RDS PostgreSQL 16 — Multi-AZ for HA in production
    this.cluster = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.dbSg],
      databaseName: 'vsp',
      multiAz: false,                      // set to true for production HA
      allocatedStorage: 20,
      maxAllocatedStorage: 100,            // storage autoscaling up to 100 GB
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      backupRetention: cdk.Duration.days(7),
      credentials: rds.Credentials.fromGeneratedSecret('vspdbadmin'),
    });

    // Publish the secret ARN to SSM for ECS task definitions to reference
    new ssm.StringParameter(this, 'DbSecretArnParam', {
      parameterName: '/vsp/db-secret-arn',
      stringValue: this.cluster.secret!.secretArn,
    });

    new cdk.CfnOutput(this, 'DbEndpoint', { value: this.cluster.instanceEndpoint.hostname });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.cluster.secret!.secretArn });
  }
}
