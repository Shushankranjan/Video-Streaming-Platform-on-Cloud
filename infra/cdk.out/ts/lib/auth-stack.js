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
exports.AuthStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
class AuthStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.userPool = new cognito.UserPool(this, 'VspUserPool', {
            userPoolName: 'vsp-users',
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            autoVerify: { email: true },
            standardAttributes: {
                email: { required: true, mutable: true },
            },
            passwordPolicy: {
                minLength: 8,
                requireUppercase: true,
                requireDigits: true,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });
        // Hosted UI domain (users visit: https://<prefix>.auth.<region>.amazoncognito.com)
        this.userPool.addDomain('CognitoDomain', {
            cognitoDomain: { domainPrefix: `vsp-auth-${this.account}` },
        });
        this.userPoolClient = this.userPool.addClient('VspWebClient', {
            userPoolClientName: 'vsp-web-client',
            authFlows: {
                userPassword: true,
                userSrp: true,
            },
            oAuth: {
                flows: { authorizationCodeGrant: true },
                scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
                callbackUrls: [
                    'http://localhost:3000/auth/callback', // local dev
                    // Add your production URL here after deployment:
                    // 'https://yourdomain.com/auth/callback',
                ],
                logoutUrls: ['http://localhost:3000'],
            },
            generateSecret: false,
        });
        new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
        new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
        new cdk.CfnOutput(this, 'CognitoDomain', {
            value: `https://vsp-auth-${this.account}.auth.${this.region}.amazoncognito.com`,
        });
    }
}
exports.AuthStack = AuthStack;
//# sourceMappingURL=auth-stack.js.map