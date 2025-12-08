export interface MessageContext {
    channelName: string;
    channelType: string;
    isThread: boolean;
    threadName?: string;
    lastActivity: Date;
    pinnedCount: number;
    attachments: string[];
    recentEmojis: string[];
    // Image attachment data for multimodal processing
    imageAttachments?: Array<{
        url: string;
        mimeType: string;
        base64Data: string;
        filename?: string;
        size?: number;
    }>;
}
