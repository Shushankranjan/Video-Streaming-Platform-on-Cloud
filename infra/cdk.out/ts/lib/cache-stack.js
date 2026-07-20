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
exports.CacheStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const elasticache = __importStar(require("aws-cdk-lib/aws-elasticache"));
class CacheStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Security group — allow inbound 6379 from the VPC
        this.redisSg = new ec2.SecurityGroup(this, 'RedisSg', {
            vpc: props.vpc,
            description: 'VSP ElastiCache Redis security group',
        });
        this.redisSg.addIngressRule(ec2.Peer.ipv4(props.vpc.vpcCidrBlock), ec2.Port.tcp(6379), 'Allow Redis from VPC');
        // Subnet group — isolated subnets
        const subnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
            description: 'VSP Redis subnet group',
            subnetIds: props.vpc.isolatedSubnets.map(s => s.subnetId),
        });
        // Single-node Redis 7 cluster (use replication group for HA in production)
        const redis = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
            cacheNodeType: 'cache.t3.micro',
            engine: 'redis',
            engineVersion: '7.1',
            numCacheNodes: 1,
            cacheSubnetGroupName: subnetGroup.ref,
            vpcSecurityGroupIds: [this.redisSg.securityGroupId],
            autoMinorVersionUpgrade: true,
        });
        this.redisEndpoint = `redis://${redis.attrRedisEndpointAddress}:${redis.attrRedisEndpointPort}`;
        new cdk.CfnOutput(this, 'RedisEndpoint', { value: this.redisEndpoint });
    }
}
exports.CacheStack = CacheStack;
//# sourceMappingURL=cache-stack.js.map