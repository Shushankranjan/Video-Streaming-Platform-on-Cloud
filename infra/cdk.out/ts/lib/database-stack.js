"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
class DatabaseStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Security group — only allow inbound 5432 from the VPC
        this.dbSg = new ec2.SecurityGroup(this, 'DbSg', {
            vpc: props.vpc,
            description: 'VSP PostgreSQL security group',
        });
        this.dbSg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(5432), 'Allow PostgreSQL from VPC');
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
            multiAz: false, // set to true for production HA
            allocatedStorage: 20,
            maxAllocatedStorage: 100, // storage autoscaling up to 100 GB
            deletionProtection: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            backupRetention: cdk.Duration.days(7),
            credentials: rds.Credentials.fromGeneratedSecret('vspdbadmin'),
        });
        // Publish the secret ARN to SSM for ECS task definitions to reference
        new ssm.StringParameter(this, 'DbSecretArnParam', {
            parameterName: '/vsp/db-secret-arn',
            stringValue: this.cluster.secret.secretArn,
        });
        new cdk.CfnOutput(this, 'DbEndpoint', { value: this.cluster.instanceEndpoint.hostname });
        new cdk.CfnOutput(this, 'DbSecretArn', { value: this.cluster.secret.secretArn });
    }
}
exports.DatabaseStack = DatabaseStack;
//# sourceMappingURL=database-stack.js.map