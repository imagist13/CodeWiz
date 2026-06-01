export interface OpenClawConfig {
    plugins?: {
        allow?: string[];
        entries?: {
            [key: string]: {
                enabled: boolean;
                [key: string]: any;
            };
        };
    };
    channels?: {
        feishu?: {
            enabled: boolean;
            appId: string;
            appSecret?: string;
            domain: string;
            connectionMode: string;
            requireMention: boolean;
            dmPolicy: string;
            groupPolicy: string;
            allowFrom: any[];
            groupAllowFrom: any[];
        };
        [key: string]: any;
    };
}
export declare function readConfig(): Promise<OpenClawConfig>;
export declare function writeConfig(config: OpenClawConfig): Promise<void>;
//# sourceMappingURL=config.d.ts.map