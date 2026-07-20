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
exports.EcrStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
class EcrStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.EcrStack = EcrStack;
//# sourceMappingURL=ecr-stack.js.map