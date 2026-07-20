import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export class EcrStack extends cdk.Stack {
  public readonly apiRepo: ecr.Repository;
  public readonly workerRepo: ecr.Repository;
  public readonly webRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.apiRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: 'vsp/api',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    this.workerRepo = new ecr.Repository(this, 'WorkerRepo', {
      repositoryName: 'vsp/worker',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    this.webRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: 'vsp/web',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    new cdk.CfnOutput(this, 'ApiRepoUri', { value: this.apiRepo.repositoryUri });
    new cdk.CfnOutput(this, 'WorkerRepoUri', { value: this.workerRepo.repositoryUri });
    new cdk.CfnOutput(this, 'WebRepoUri', { value: this.webRepo.repositoryUri });
  }
}
