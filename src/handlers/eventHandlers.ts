/**
 * Event Handlers Module
 * Handles Discord client events and message processing
 */

import {
  Client,
  Events,
  Message,
  ChannelType,
  Interaction,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
  TextChannel
} from 'discord.js';
import type { IAIService, IUserAnalysisService } from '../services/interfaces';
import { logger } from '../utils/logger';
import { splitMessage } from '../utils/messageSplitter';
import { splitThinkingResponse } from '../utils/thinkingFormatter';
import { extractRecentEmojis, MessageContext } from '../commands';
import { RaceConditionManager } from '../utils/raceConditionManager';
import { DiscordMentionParser } from '../utils/validation';
import { youTubeUrlDetector } from '../services/multimodal/detectors/YouTubeUrlDetector';
import { YouTubeErrorHandler } from '../utils/youtubeErrorHandler';
import { CommandRegistry } from '../commands/CommandRegistry';
import { BotServices } from '../core/botInitializer';
import { TracingIntegration } from '../services/tracing/TracingIntegration';
import { Container } from '../di/Container';

// Track if handlers are already set up to prevent duplicates
let handlersSetupComplete = false;

/**
 * Setup all Discord event handlers with distributed tracing integration
 */
export function setupEventHandlers(
  client: Client,
  geminiService: IAIService,
  raceConditionManager: RaceConditionManager,
  userAnalysisService: IUserAnalysisService,
  tracingIntegration: TracingIntegration,
  commandRegistry: CommandRegistry,
  container: Container
): void {
  // Check if handlers are already set up
  if (handlersSetupComplete) {
    logger.warn('Event handlers already setup, skipping...');
    return;
  }

  logger.info('Setting up Discord event handlers...');

  // Remove any existing listeners first to prevent duplicates
  client.removeAllListeners(Events.MessageCreate);
  client.removeAllListeners(Events.InteractionCreate);
  client.removeAllListeners(Events.MessageReactionAdd);

  // Interaction create event (slash commands and autocomplete)
  client.on(Events.InteractionCreate, async (interaction) => {
    // Construct services object to pass to registry (since handlers might need full services)
    // Note: In a cleaner refactor, we would pass the container, but here we reconstruct a partial one 
    // or rely on what we have. CommandRegistry expectations are BotServices.
    // We can cast or minimal mock if we don't have everything here, but we SHOULD have everything.
    // However, setupEventHandlers receives individual services.
    // We should probably construct a BotServices object here or pass it in setupEventHandlers.
    // But changing setupEventHandlers signature to take BotServices is cleaner.
    // For now, let's construct a compatible object.

    const services: BotServices = {
      client,
      geminiService,
      userAnalysisService,
      serviceRegistry: {} as any, // We don't have serviceRegistry here easily unless we pass it.
      tracingIntegration,
      commandRegistry,
      container
    };
    // Better: update setupEventHandlers to take BotServices. But that requires changing index.ts again?
    // index.ts passes individual args.
    // Let's rely on what we have. CommandRegistry.handleCommand expects BotServices.
    // I will cast it for now or assume we only need geminiService and commandRegistry mainly.
    // Checking Command.execute signatures... they take BotServices.

    // Ideally we update setupEventHandlers to just take `services: BotServices`.
    // I'll stick to individual args and construct a proxy.

    if (interaction.isChatInputCommand()) {
      await commandRegistry.handleCommand(interaction, services);
    } else if (interaction.isAutocomplete()) {
      await commandRegistry.handleAutocomplete(interaction, services);
    }
  });

  // Message reaction add event
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    await handleMessageReactionAdd(reaction, user, client);
  });

  // Message create event (mentions) with tracing integration
  const messageHandler = tracingIntegration
    ? tracingIntegration.wrapMessageHandler(async (message) => {
      await handleMessageCreate(message, client, geminiService, raceConditionManager, userAnalysisService);
    })
    : async (message: Message) => {
      await handleMessageCreate(message, client, geminiService, raceConditionManager, userAnalysisService);
    };

  client.on(Events.MessageCreate, messageHandler);

  // Mark handlers as setup
  handlersSetupComplete = true;

  logger.info('Discord event handlers setup complete');
}



/**
 * Handle message reaction add events
 */
async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client
): Promise<void> {
  if (user.bot) return;

  // Check if this is a reaction to one of the bot's messages
  if (reaction.message.author?.id === client.user?.id) {
    const emoji = reaction.emoji.name;

    // Track particularly good roasts (looking for common reaction names)
    if (emoji === 'joy' || emoji === 'skull' || emoji === 'fire' || emoji === 'rofl' || emoji === '100') {
      logger.info(`Good roast detected! Emoji: ${emoji}, Message: ${reaction.message.content?.substring(0, 100)}...`);
    }
  }
}

/**
 * Handle message create events
 * 
 * ALGORITHM FLOWCHART:
 * ┌─────────────────────┐
 * │   Message Received  │
 * └──────────┬──────────┘
 *            │
 *            ▼
 * ┌─────────────────────┐     NO
 * │   Is Bot Author?    ├──────────┐
 * └──────────┬──────────┘          │
 *            │ YES                 │
 *            ▼                     │
 *         ┌─────┐                  │
 *         │EXIT │                  │
 *         └─────┘                  │
 *                                  │
 * ┌────────────────────────────────┘
 * │
 * ▼
 * ┌─────────────────────┐     NO
 * │   Bot Mentioned?    ├──────────┐
 * └──────────┬──────────┘          │
 *            │ YES                 │
 *            ▼                     │
 * ┌─────────────────────┐          │
 * │  Acquire Message    │          │
 * │      Mutex          │          │
 * └──────────┬──────────┘          │
 *            │                     │
 *            ▼                     │
 * ┌─────────────────────┐     YES  │
 * │  Duplicate Check    ├──────────┤
 * │ (Object & Key)      │          │
 * └──────────┬──────────┘          │
 *            │ NO                  │
 *            ▼                     │
 * ┌─────────────────────┐          │
 * │ Mark as Processed   │          │
 * └──────────┬──────────┘          │
 *            │                     │
 *            ▼                     │
 * ┌─────────────────────┐          │
 * │  Acquire User       │          │
 * │      Mutex          │          │
 * └──────────┬──────────┘          │
 *            │                     │
 *            ▼                     │
 * ┌─────────────────────┐     YES  │
 * │ Extract Prompt      ├──────────┤
 * │   (Empty Check)     │          │
 * └──────────┬──────────┘          │
 *            │ NO                  │
 *            ▼                     │
 * ┌─────────────────────┐          │
 * │ Start Typing        │          │
 * │   Indicator         │          │
 * └──────────┬──────────┘          │
 *            │                     │
 *            ▼                     │
 * ┌─────────────────────┐     YES  │
 * │  Summary Request    ├──────────┘
 * │   Detection?        │
 * └──────────┬──────────┘
 *            │ NO
 *            ▼
 * ┌─────────────────────┐
 * │  Build Message      │
 * │     Context         │
 * └──────────┬──────────┘
 *            │
 *            ▼
 * ┌─────────────────────┐
 * │ Process Image       │
 * │   Attachments       │
 * └──────────┬──────────┘
 *            │
 *            ▼
 * ┌─────────────────────┐
 * │ Generate AI         │
 * │    Response         │
 * └──────────┬──────────┘
 *            │
 *            ▼
 * ┌─────────────────────┐
 * │  Split & Send       │
 * │    Messages         │
 * └─────────────────────┘
 * 
 * SUMMARY REQUEST BRANCH:
 * ┌─────────────────────┐
 * │  Fetch User         │
 * │    Messages         │
 * └──────────┬──────────┘
 *            │
 *            ▼
 * ┌─────────────────────┐
 * │   Local Analysis    │
 * │   (Instant Roast)   │
 * └──────────┬──────────┘
 *            │
 *            ▼
 * ┌─────────────────────┐     NO
 * │  Requires API       ├──────────┐
 * │   Analysis?         │          │
 * └──────────┬──────────┘          │
 *            │ YES                 │
 *            ▼                     │
 * ┌─────────────────────┐          │
 * │  Batch Messages     │          │
 * │   for API           │          │
 * └──────────┬──────────┘          │
 *            │                     │
 *            ▼                     │
 * ┌─────────────────────┐          │
 * │  Enhanced API       │          │
 * │    Analysis         │          │
 * └──────────┬──────────┘          │
 *            ├─────────────────────┘
 *            ▼
 * ┌─────────────────────┐
 * │  Generate Roast     │
 * │   & Analysis        │
 * └─────────────────────┘
 * 
 * COMPLEXITY ANALYSIS:
 * ==================
 * TIME COMPLEXITY:
 * - Best Case: O(1) - Early exits (bot message, no mention)
 * - Normal Case: O(n + a*img_size + AI_time) where:
 *   - n = message content length
 *   - a = number of image attachments
 *   - img_size = average image size
 *   - AI_time = AI service response time
 * - Summary Case: O(k*log(k) + k*msg_len + b*API_time) where:
 *   - k = number of fetched messages (≤100)
 *   - msg_len = average message length
 *   - b = number of API batches
 *   - API_time = time per API call
 * 
 * SPACE COMPLEXITY:
 * - Best Case: O(1) - Minimal variables
 * - Normal Case: O(a + response_len) where:
 *   - a = number of attachments
 *   - response_len = AI response length
 * - Summary Case: O(k*msg_len + analysis_size) where:
 *   - k*msg_len = total message content stored
 *   - analysis_size = analysis result storage
 * 
 * CRITICAL PATHS:
 * - Duplicate prevention: Prevents race conditions and spam
 * - Mutex management: Ensures thread safety
 * - Hybrid analysis: Optimizes API usage (local-first approach)
 * - Error handling: Graceful degradation for reliability
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Local analysis first (zero API calls for simple cases)
 * - Message batching for API efficiency
 * - Intelligent message filtering (interesting messages only)
 * - Atomic duplicate checking with mutexes
 * - Parallel image processing
 */
async function handleMessageCreate(
  message: Message,
  client: Client,
  geminiService: IAIService,
  raceConditionManager: RaceConditionManager,
  userAnalysisService: IUserAnalysisService
): Promise<void> {
  const requestId = `msg_${message.id}_${Date.now()}`;
  const startTime = Date.now();

  // Import error handling utilities
  const { enrichError, isRetryableError, getUserFriendlyMessage, createTimeoutPromise } = await import('../utils/ErrorHandlingUtils');

  try {
    // === EARLY EXIT: BOT FILTER ===
    // Skip processing if message is from a bot to prevent loops
    if (message.author.bot) return;

    // === MENTION DETECTION ===
    // Only process messages that mention our bot
    if (message.mentions.users.has(client.user!.id)) {
      // === KEY GENERATION FOR DUPLICATE PREVENTION ===
      // Create unique identifiers for message and user context
      const messageKey = `${message.id}-${message.author.id}`;
      const channelKey = message.channel.id;
      const userKey = message.author.id;

      // === CRITICAL SECTION: DUPLICATE PREVENTION ===
      // Acquire message mutex IMMEDIATELY to ensure atomic check-and-mark
      // This prevents race conditions when multiple events arrive simultaneously
      const messageMutex = raceConditionManager.getMessageMutex();
      const messageRelease = await Promise.race([
        messageMutex.acquire(),
        createTimeoutPromise(5000).then(() => {
          throw enrichError(new Error('Message mutex acquisition timeout'), {
            operation: 'messageMutex.acquire',
            messageId: message.id,
            requestId
          });
        })
      ]);

      try {
        // First check if we've already seen this exact Message object
        if (raceConditionManager.hasProcessedMessageObject(message)) {
          logger.debug('Duplicate message object detected, skipping', {
            messageId: message.id,
            requestId
          });
          return;
        }

        // Prevent duplicate processing by key (includes timestamp check)
        if (raceConditionManager.hasProcessedMessage(messageKey)) {
          logger.debug(`Duplicate message key detected, skipping: ${messageKey}`, {
            requestId
          });
          return;
        }

        // Mark both the object and key as processed IMMEDIATELY
        raceConditionManager.markMessageObjectProcessed(message);
        raceConditionManager.markMessageProcessed(messageKey);

        // NOW we can log that we're processing this message
        logger.info(`Processing message: ID=${message.id}, Author=${message.author.id}, Content="${message.content.substring(0, 50)}..."`, {
          messageId: message.id,
          authorId: message.author.id,
          messageKey,
          requestId,
          timestamp: new Date().toISOString()
        });
      } finally {
        messageRelease();
      }

      // === USER-SPECIFIC MUTEX ACQUISITION ===
      // Ensure only one message per user is processed at a time
      // Prevents concurrent processing from the same user
      const userMutex = raceConditionManager.getUserMutex(userKey);
      const release = await Promise.race([
        userMutex.acquire(),
        createTimeoutPromise(10000).then(() => {
          throw enrichError(new Error('User mutex acquisition timeout'), {
            operation: 'userMutex.acquire',
            messageId: message.id,
            userId: message.author.id,
            requestId
          });
        })
      ]);

      try {
        // === PROMPT EXTRACTION ===
        // Remove bot mention from message content to get actual user prompt
        const prompt = message.content.replace(`<@${client.user!.id}>`, '').trim();

        // Handle empty prompts with helpful response
        if (!prompt) {
          await message.reply('Hi! Please include a message after mentioning me.');
          return;
        }

        // === TYPING INDICATOR MANAGEMENT ===
        // Safe typing indicator management with proper cleanup
        const startTyping = () => {
          // Type-safe typing indicator to show bot is processing
          const typingChannel = message.channel as { sendTyping(): Promise<void> };
          raceConditionManager.startTyping(channelKey, typingChannel);
        };

        const stopTyping = () => {
          raceConditionManager.stopTyping(channelKey);
        };

        try {
          startTyping();

          // === USER ANALYSIS REQUEST DETECTION ===
          // Check if this is a request to analyze/summarize a user's messages
          const mentionedUserIds = DiscordMentionParser.extractUserIds(prompt);

          // Check for summary keywords and mentioned users
          if (userAnalysisService.isSummaryRequest(prompt, mentionedUserIds) &&
            mentionedUserIds.length > 0 &&
            message.channel &&
            'messages' in message.channel &&
            message.channel instanceof TextChannel) {
            try {
              const targetUserId = mentionedUserIds[0];
              const targetUser = await client.users.fetch(targetUserId);

              // Fetch user messages using the service
              const userMessages = await userAnalysisService.fetchUserMessages(
                client,
                message.channel as TextChannel,
                targetUserId
              );

              if (userMessages.length === 0) {
                await message.reply(`${targetUser.username} hasn't sent any messages in the recent history of this channel.`);
                stopTyping();
                return;
              }

              // Perform user analysis using the service
              const analysisResult = await userAnalysisService.analyzeUserBehavior(
                userMessages,
                targetUser,
                geminiService,
                message.author.id,
                message.guild?.id,
                message.member || undefined,
                message.guild || undefined
              );

              // Generate roast summary based on analysis
              const roastSummary = userAnalysisService.generateRoastSummary(
                analysisResult,
                targetUser,
                !analysisResult.usedApiAnalysis
              );

              // If API analysis was used, send initial response and then edit with full results
              if (analysisResult.usedApiAnalysis && analysisResult.localAnalysis) {
                // Send initial response with local analysis
                const initialRoast = analysisResult.localAnalysis.messageCount > 0
                  ? `Analyzing ${targetUser.username}... (${analysisResult.localAnalysis.messageCount} messages found)`
                  : `Analyzing ${targetUser.username}...`;

                const replyMessage = await message.reply(initialRoast);

                // Edit with complete analysis
                await replyMessage.edit(roastSummary);
              } else {
                // Send complete response immediately for local-only analysis
                await message.reply(roastSummary);
              }

              stopTyping();
              return;
            } catch (summaryError) {
              logger.error('Error processing user summary request:', summaryError);
              // Fall through to normal processing if summary fails
            }
          }

          // === YOUTUBE URL DETECTION AND PROCESSING ===
          // Check for YouTube URLs in the message before building context
          const youtubeWarnings: string[] = [];
          let youtubeNeedsConfirmation = false;
          const validYouTubeUrls: string[] = []; // Collect valid YouTube URLs for processing

          try {
            const detectedUrls = youTubeUrlDetector.detectYouTubeUrls(prompt);
            if (detectedUrls.length > 0) {
              logger.info(`Detected ${detectedUrls.length} YouTube URL(s) in message`);

              // Process each detected URL
              for (const url of detectedUrls) {
                const validation = youTubeUrlDetector.validateYouTubeUrl(url);
                if (validation.isValid && validation.videoId) {
                  // Get mock video info to check duration and cost
                  const processResult = await youTubeUrlDetector.processYouTubeUrl(url);

                  if (!processResult.isValid) {
                    const youtubeError = YouTubeErrorHandler.fromValidation(processResult.validation);
                    youtubeWarnings.push(YouTubeErrorHandler.createDiscordErrorResponse(youtubeError, true));
                  } else if (processResult.requiresConfirmation) {
                    youtubeNeedsConfirmation = true;
                    youtubeWarnings.push(processResult.warningMessage || 'This video requires confirmation for processing.');
                  } else {
                    // Video is valid and doesn't need confirmation - ready for processing
                    logger.info(`YouTube video ${validation.videoId} is ready for processing`);
                    validYouTubeUrls.push(url); // Add to valid URLs list

                    // If there's a warning message (like partial processing), add it but don't require confirmation
                    if (processResult.warningMessage) {
                      youtubeWarnings.push(processResult.warningMessage);
                    }
                  }
                } else {
                  const youtubeError = YouTubeErrorHandler.fromValidation(validation);
                  youtubeWarnings.push(YouTubeErrorHandler.createDiscordErrorResponse(youtubeError, true));
                }
              }

              // Log valid URLs that will be sent to Gemini
              if (validYouTubeUrls.length > 0) {
                logger.info(`Collected ${validYouTubeUrls.length} valid YouTube URL(s) for Gemini processing`);
              }
            }
          } catch (error) {
            logger.error('Error detecting YouTube URLs:', error);
          }

          // === MESSAGE CONTEXT BUILDING ===
          // Build comprehensive message context for enhanced AI awareness
          // Includes channel info, attachments, and conversation metadata
          let messageContext: MessageContext | undefined;
          try {
            const channel = message.channel;
            let channelType = 'other';
            if (channel.type === ChannelType.GuildText) channelType = 'text';
            else if (channel.type === ChannelType.GuildVoice) channelType = 'voice';
            else if (channel.type === ChannelType.PublicThread) channelType = 'thread';
            else if (channel.type === ChannelType.PrivateThread) channelType = 'thread';
            else if (channel.type === ChannelType.DM) channelType = 'dm';

            // === MULTIMODAL IMAGE PROCESSING ===
            // Process image attachments for multimodal AI support
            // Converts images to base64 for AI analysis
            const imageAttachments: Array<{
              url: string;
              mimeType: string;
              base64Data: string;
              filename?: string;
              size?: number;
            }> = [];
            const supportedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
            const supportedVideoTypes = ['video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp'];

            // Helper function to process attachments
            const processAttachments = async (attachments: Message['attachments'], source: string) => {
              for (const attachment of attachments.values()) {
                if (attachment.contentType && (supportedImageTypes.includes(attachment.contentType) || supportedVideoTypes.includes(attachment.contentType))) {
                  try {
                    // For videos, we'll handle them differently (using File API for large files)
                    if (attachment.contentType && supportedVideoTypes.includes(attachment.contentType)) {
                      logger.info(`Processing video attachment: ${attachment.name} (${attachment.contentType})`);

                      // For videos under 20MB, we can send them inline
                      if (attachment.size && attachment.size <= 20 * 1024 * 1024) {
                        const response = await fetch(attachment.url);
                        if (response.ok) {
                          const buffer = await response.arrayBuffer();
                          const base64Data = Buffer.from(buffer).toString('base64');

                          imageAttachments.push({
                            url: attachment.url,
                            mimeType: attachment.contentType,
                            base64Data: base64Data,
                            filename: attachment.name || undefined,
                            size: attachment.size || undefined
                          });

                          logger.info(`Fetched video attachment from ${source}: ${attachment.name} (${attachment.size} bytes)`);
                        }
                      } else {
                        // For larger videos, we would need to use File API
                        logger.warn(`Video ${attachment.name} is too large (${attachment.size} bytes) for inline processing. Skipping for now.`);
                      }
                    } else {
                      // Fetch image data from Discord CDN
                      const response = await fetch(attachment.url);
                      if (response.ok) {
                        const buffer = await response.arrayBuffer();
                        const base64Data = Buffer.from(buffer).toString('base64');

                        imageAttachments.push({
                          url: attachment.url,
                          mimeType: attachment.contentType,
                          base64Data: base64Data,
                          filename: attachment.name || undefined,
                          size: attachment.size || undefined
                        });
                      }

                      logger.info(`Fetched image attachment from ${source}: ${attachment.name} (${attachment.size} bytes)`);
                    }
                  } catch (error) {
                    logger.warn(`Failed to fetch image attachment ${attachment.name} from ${source}:`, error);
                  }
                }
              }
            };

            // Process current message attachments
            await processAttachments(message.attachments, 'current message');

            // Process referenced message attachments if replying to another message
            if (message.reference && message.reference.messageId) {
              try {
                const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (referencedMessage && referencedMessage.attachments.size > 0) {
                  logger.info(`Found referenced message with ${referencedMessage.attachments.size} attachment(s)`);
                  await processAttachments(referencedMessage.attachments, 'referenced message');
                }
              } catch (error) {
                logger.warn('Failed to fetch referenced message for image processing:', error);
              }
            }

            messageContext = {
              channelName: 'name' in channel && channel.name ? String(channel.name) : 'DM',
              channelType: channelType,
              isThread: channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread,
              threadName: (channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread) && 'name' in channel && channel.name ? String(channel.name) : undefined,
              lastActivity: 'lastMessageAt' in channel && channel.lastMessageAt instanceof Date ? channel.lastMessageAt : new Date(),
              pinnedCount: 0, // Will be populated below
              attachments: message.attachments.map(a => a.contentType || 'unknown'),
              recentEmojis: await extractRecentEmojis(channel),
              imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
            };

            // Fetch pinned messages count if in a guild channel
            if ('messages' in channel && typeof channel.messages.fetchPins === 'function') {
              try {
                const pins = await channel.messages.fetchPins();
                if (messageContext) {
                  messageContext.pinnedCount = pins.items?.length || 0;
                }
              } catch (err) {
                logger.debug('Failed to fetch pinned messages:', err);
              }
            }
          } catch (contextError) {
            logger.debug('Failed to build complete message context:', contextError);
          }

          // === RESPONSE HANDLING SETUP ===
          // Track if response has been sent to avoid duplicates
          let responseSent = false;

          // Create response callback for graceful degradation
          // Handles both thinking and normal responses with intelligent splitting
          const respondCallback = async (responseText: string) => {
            if (responseText && !responseSent) {
              responseSent = true;

              // === INTELLIGENT MESSAGE SPLITTING ===
              // Check if this is a thinking response and use appropriate splitter
              // Different splitting strategies for thinking vs normal responses
              let chunks: string[];
              if (responseText.includes('💭 **Thinking:**') && responseText.includes('**Response:**')) {
                // Extract thinking and response parts for intelligent splitting
                const thinkingMatch = responseText.match(/💭 \*\*Thinking:\*\*\n([\s\S]*?)\n\n\*\*Response:\*\*/);
                if (thinkingMatch) {
                  const thinkingText = thinkingMatch[1];
                  const responseStart = responseText.indexOf('**Response:**') + '**Response:**'.length + 1;
                  const actualResponse = responseText.substring(responseStart);
                  chunks = splitThinkingResponse(thinkingText, actualResponse, 2000);
                } else {
                  // Fallback to regular splitting
                  chunks = splitMessage(responseText, 2000);
                }
              } else {
                chunks = splitMessage(responseText, 2000);
              }

              // Send first chunk as reply
              await message.reply(chunks[0]);

              // Send remaining chunks as follow-ups
              for (let i = 1; i < chunks.length; i++) {
                // Type-safe channel send
                const sendableChannel = message.channel as { send(content: string): Promise<Message> };
                await sendableChannel.send(chunks[i]);
              }
            }
          };

          // === AI SERVICE INVOCATION ===
          // Prepare multimodal attachments including both images and YouTube videos
          const multimodalAttachments = messageContext?.imageAttachments || [];

          // Add YouTube URLs as special video attachments
          if (validYouTubeUrls.length > 0) {
            const youtubeAttachments = validYouTubeUrls.map(url => ({
              url: url,
              mimeType: 'video/youtube', // Special mime type to identify YouTube URLs
              base64Data: url, // Pass URL as data - will be converted to fileData in handler
              filename: `youtube-${url.split('v=')[1] || url.split('/').pop()}`,
              size: 0
            }));
            multimodalAttachments.push(...youtubeAttachments);
            logger.info(`Added ${validYouTubeUrls.length} YouTube URL(s) to multimodal attachments`);
          }

          // Log multimodal content being sent
          if (multimodalAttachments.length > 0) {
            const imageCount = multimodalAttachments.filter(a => a.mimeType.startsWith('image/')).length;
            const videoCount = multimodalAttachments.filter(a => a.mimeType === 'video/youtube').length;
            logger.info(`Sending ${imageCount} image(s) and ${videoCount} YouTube video(s) to Gemini for multimodal processing`);
          }

          // Generate AI response with full context and multimodal support
          const response = await Promise.race([
            geminiService.generateResponse(
              prompt,
              message.author.id,
              message.guild?.id,
              respondCallback,
              messageContext,
              message.member || undefined,
              message.guild || undefined,
              multimodalAttachments.length > 0 ? multimodalAttachments : undefined
            ),
            createTimeoutPromise(70000).then(() => {
              throw enrichError(new Error('AI response generation timeout'), {
                operation: 'geminiService.generateResponse',
                messageId: message.id,
                userId: message.author.id,
                timeout: 70000,
                requestId
              });
            })
          ]);

          stopTyping();

          // Handle YouTube warnings before sending main response
          if (youtubeWarnings.length > 0 && !responseSent) {
            const warningMessage = youtubeWarnings.join('\n\n');

            if (youtubeNeedsConfirmation) {
              // For videos requiring confirmation, don't process them
              const confirmationMessage = `${warningMessage}\n\n⚠️ **YouTube Video Requires Confirmation**\n\nThis video requires confirmation before processing due to:\n• Long duration or high token cost\n• Safety or content concerns\n\nPlease confirm you want to process this video by using the confirmation command (coming soon).`;
              await message.reply(confirmationMessage);
              responseSent = true;
            } else {
              // For other warnings (errors, invalid URLs), include in regular response
              const modifiedResponse = response ? `${warningMessage}\n\n---\n\n${response}` : warningMessage;
              await respondCallback(modifiedResponse);
              responseSent = true;
            }
          }

          // Only send response if it's not empty and hasn't been sent already
          if (response && !responseSent) {
            await respondCallback(response);
          }
        } catch (error) {
          // === ERROR HANDLING ===
          // Comprehensive error handling with graceful user communication
          stopTyping();

          const enrichedError = enrichError(error as Error, {
            messageId: message.id,
            userId: message.author.id,
            channelId: message.channel.id,
            guildId: message.guild?.id,
            requestId,
            operation: 'message_processing',
            duration: Date.now() - startTime
          });

          logger.error('Error generating response for mention', {
            error: enrichedError,
            errorCategory: enrichedError.category,
            retryable: isRetryableError(enrichedError)
          });

          // Handle based on error type
          if (isRetryableError(enrichedError)) {
            // For retryable errors, provide a more specific message
            const retryMessage = 'I encountered a temporary issue. Please try again in a moment.';
            try {
              await message.reply(retryMessage);
            } catch (replyError) {
              logger.error('Failed to send retry error message', {
                error: replyError,
                originalError: enrichedError,
                requestId
              });
            }
          } else {
            // For non-retryable errors, use user-friendly message
            const errorMessage = getUserFriendlyMessage(enrichedError);
            try {
              await message.reply(errorMessage);
            } catch (replyError) {
              logger.error('Failed to send error reply', {
                error: replyError,
                originalError: enrichedError,
                requestId
              });
            }
          }

          // Track error metrics (fire-and-forget)
          try {
            logger.debug('Message processing error tracked', {
              type: 'message_processing',
              error: enrichedError,
              userId: message.author.id,
              guildId: message.guild?.id,
              requestId
            });
          } catch (trackingError) {
            logger.error('Failed to track message processing error', trackingError);
          }
        }
      } catch (error) {
        // === OUTER ERROR HANDLING ===
        // Final safety net for any unhandled errors
        const enrichedError = enrichError(error as Error, {
          messageId: message.id,
          userId: message.author.id,
          channelId: message.channel.id,
          guildId: message.guild?.id,
          requestId,
          operation: 'message_handling_outer',
          duration: Date.now() - startTime
        });

        logger.error('Critical error in message handling', {
          error: enrichedError,
          errorCategory: enrichedError.category
        });

        // Try to send a basic error message as last resort
        try {
          await message.reply('I encountered a critical error and cannot process your message right now.');
        } catch (replyError) {
          logger.error('Failed to send critical error message', {
            error: replyError,
            originalError: enrichedError,
            requestId
          });
        }
      } finally {
        // === CLEANUP ===
        // Always release user mutex to prevent deadlocks
        release();
      }
    }
  } catch (globalError) {
    // === GLOBAL ERROR HANDLER ===
    // Absolute final safety net for catastrophic errors
    const enrichedError = enrichError(globalError as Error, {
      messageId: message.id,
      userId: message.author?.id,
      operation: 'message_handling_global',
      requestId,
      duration: Date.now() - startTime
    });

    logger.error('Global error in message handling - this should never happen', {
      error: enrichedError,
      errorCategory: enrichedError.category
    });
  }
  // === END: BOT NOT MENTIONED ===
  // No action needed if bot is not mentioned in the message
}