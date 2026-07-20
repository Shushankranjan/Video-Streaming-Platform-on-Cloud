import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import { Construct } from 'constructs';
import { DatabaseStack } from './database-stack';
import { CacheStack } from './cache-stack';
import { StorageCdnStack } from './storage-cdn-stack';
import { QueueStack } from './queue-stack';
import { AuthStack } from './auth-stack';

interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  apiRepo: ecr.Repository;
  workerRepo: ecr.Repository;
  database: DatabaseStack;
  cache: CacheStack;
  storage: StorageCdnStack;
  queue: QueueStack;
  auth: AuthStack;
}

export class EcsStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    // ── ECS Cluster ──────────────────────────────────────────────────────────
    this.cluster = new ecs.Cluster(this, 'VspCluster', {
      vpc: props.vpc,
      clusterName: 'vsp-cluster',
      containerInsights: true,
    });

    // ── IAM Task Role (shared by API + worker) ────────────────────────────────
    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    props.storage.ingressBucket.grantReadWrite(taskRole);
    props.storage.outputBucket.grantReadWrite(taskRole);
    props.queue.transcodeQueue.grantConsumeMessages(taskRole);
    props.queue.transcodeQueue.grantSendMessages(taskRole);
    props.database.cluster.secret!.grantRead(taskRole);

    // ── CloudWatch Log Groups ─────────────────────────────────────────────────
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/vsp/api',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: '/vsp/worker',
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── ALB ───────────────────────────────────────────────────────────────────
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
    });

    // ── API Fargate Service ───────────────────────────────────────────────────
    const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      taskRole,
    });

    const apiContainer = apiTaskDef.addContainer('ApiContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.apiRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: apiLogGroup, streamPrefix: 'api' }),
      environment: {
        NODE_ENV: 'production',
        USE_LOCAL_STORAGE: 'false',
        USE_SQS: 'true',
        USE_COGNITO: 'true',
        S3_REGION: this.region,
        S3_INGRESS_BUCKET: props.storage.ingressBucket.bucketName,
        S3_OUTPUT_BUCKET: props.storage.outputBucket.bucketName,
        SQS_QUEUE_URL: props.queue.transcodeQueue.queueUrl,
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: props.auth.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.auth.userPoolClient.userPoolClientId,
        REDIS_URL: props.cache.redisEndpoint,
        PORT: '3001',
      },
      secrets: {
        // DATABASE_URL is injected from Secrets Manager at container start
        DATABASE_URL: ecs.Secret.fromSecretsManager(props.database.cluster.secret!, 'dbURL'),
      },
      portMappings: [{ containerPort: 3001 }],
    });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster: this.cluster,
      taskDefinition: apiTaskDef,
      desiredCount: 2,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Allow ALB to reach the API on port 3001
    const apiSg = apiService.connections.securityGroups[0];
    apiSg.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(3001),
    );
    // ALB listener → target group → API service
    const listener = this.alb.addListener('HttpListener', { port: 80 });
    listener.addTargets('ApiTarget', {
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [apiService],
      healthCheck: { path: '/health', interval: cdk.Duration.seconds(30) },
    });

    // ── FFmpeg Worker Fargate Service ─────────────────────────────────────────
    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      cpu: 2048,          // transcoding is CPU-intensive
      memoryLimitMiB: 4096,
      taskRole,
    });

    workerTaskDef.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.workerRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ logGroup: workerLogGroup, streamPrefix: 'worker' }),
      environment: {
        NODE_ENV: 'production',
        USE_LOCAL_STORAGE: 'false',
        USE_SQS: 'true',
        S3_REGION: this.region,
        S3_INGRESS_BUCKET: props.storage.ingressBucket.bucketName,
        S3_OUTPUT_BUCKET: props.storage.outputBucket.bucketName,
        SQS_QUEUE_URL: props.queue.transcodeQueue.queueUrl,
        SQS_REGION: this.region,
        // API base URL so the worker can call the webhook
        API_BASE_URL: `http://${this.alb.loadBalancerDnsName}`,
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(props.database.cluster.secret!, 'dbURL'),
      },
    });

    const workerService = new ecs.FargateService(this, 'WorkerService', {
      cluster: this.cluster,
      taskDefinition: workerTaskDef,
      desiredCount: 1,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Auto-scale worker based on SQS queue depth
    const scaling = workerService.autoScaleTaskCount({ minCapacity: 0, maxCapacity: 10 });
    scaling.scaleOnMetric('SqsScaling', {
      metric: props.queue.transcodeQueue.metricApproximateNumberOfMessagesVisible(),
      scalingSteps: [
        { upper: 0, change: -1 },
        { lower: 1, change: +1 },
        { lower: 5, change: +3 },
      ],
      adjustmentType: appscaling.AdjustmentType.CHANGE_IN_CAPACITY,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.alb.loadBalancerDnsName });
  }
}
