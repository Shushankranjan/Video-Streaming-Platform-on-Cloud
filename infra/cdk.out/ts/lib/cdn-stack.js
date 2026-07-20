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
exports.CdnStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
class CdnStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Origin Access Control — CloudFront is the only entity that can read from S3
        const oac = new cloudfront.S3OriginAccessControl(this, 'S3Oac', {
            signing: cloudfront.Signing.SIGV4_ALWAYS,
        });
        const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(props.outputBucket, {
            originAccessControl: oac,
        });
        this.distribution = new cloudfront.Distribution(this, 'VspDistribution', {
            comment: 'VSP — HLS delivery + API proxy',
            defaultBehavior: {
                // Default: proxy to the API (ALB)
                origin: new origins.LoadBalancerV2Origin(props.alb, {
                    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // API responses must not be cached
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
            },
            additionalBehaviors: {
                // HLS manifests and segments — serve from S3 via OAC
                'videos/*': {
                    origin: s3Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    // Signed URLs are enforced via trusted key groups (configure below)
                    trustedKeyGroups: [], // TODO: add key group with your CloudFront public key
                },
            },
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
        });
        // Grant CloudFront OAC read access to the output S3 bucket
        props.outputBucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
            actions: ['s3:GetObject'],
            principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
            resources: [props.outputBucket.arnForObjects('*')],
            conditions: {
                StringEquals: {
                    'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
                },
            },
        }));
        new cdk.CfnOutput(this, 'CloudFrontDomain', {
            value: `https://${this.distribution.distributionDomainName}`,
        });
        new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
            value: this.distribution.distributionId,
        });
    }
}
exports.CdnStack = CdnStack;
//# sourceMappingURL=cdn-stack.js.map