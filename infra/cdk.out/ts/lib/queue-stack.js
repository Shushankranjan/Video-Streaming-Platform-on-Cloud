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
exports.QueueStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
class QueueStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Dead-letter queue — catches messages that fail maxReceiveCount times
        this.transcodeQueueDlq = new sqs.Queue(this, 'TranscodeQueueDlq', {
            queueName: 'vsp-transcode-dlq.fifo',
            fifo: true,
            retentionPeriod: cdk.Duration.days(14),
        });
        // Main FIFO queue — each videoId is a message group for deduplication
        this.transcodeQueue = new sqs.Queue(this, 'TranscodeQueue', {
            queueName: 'vsp-transcode.fifo',
            fifo: true,
            contentBasedDeduplication: true,
            visibilityTimeout: cdk.Duration.minutes(10), // must be >= worker processing time
            retentionPeriod: cdk.Duration.days(4),
            deadLetterQueue: {
                queue: this.transcodeQueueDlq,
                maxReceiveCount: 3, // retry 3x before sending to DLQ
            },
        });
        new cdk.CfnOutput(this, 'TranscodeQueueUrl', { value: this.transcodeQueue.queueUrl });
        new cdk.CfnOutput(this, 'TranscodeQueueArn', { value: this.transcodeQueue.queueArn });
    }
}
exports.QueueStack = QueueStack;
//# sourceMappingURL=queue-stack.js.map