/**
 * Formats thinking mode responses to ensure they split nicely for Discord
 * Prioritizes keeping the actual response visible even if thinking gets truncated
 */

export function formatThinkingResponse(
  thinkingText: string, 
  responseText: string, 
  maxLength: number = 2000,
  thinkingMetadata?: {
    confidence?: number;
    complexity?: 'low' | 'medium' | 'high';
    tokenCount?: number;
  }
): string {
  // Enhanced header with metadata if available
  let thinkingHeader = '💭 **Thinking Process**';
  
  if (thinkingMetadata) {
    const parts: string[] = [];
    
    // Confidence indicator with improved visual representation
    if (thinkingMetadata.confidence !== undefined) {
      const confidencePercent = Math.round(thinkingMetadata.confidence * 100);
      const confidenceEmoji = confidencePercent >= 80 ? '🟢' : confidencePercent >= 60 ? '🟡' : '🔴';
      parts.push(`${confidenceEmoji} ${confidencePercent}% confidence`);
    }
    
    // Complexity indicator with better emoji mapping
    if (thinkingMetadata.complexity) {
      const complexityEmoji = {
        low: '📊',
        medium: '📈', 
        high: '📉'
      };
      const complexityLabel = {
        low: 'Simple',
        medium: 'Moderate',
        high: 'Complex'
      };
      parts.push(`${complexityEmoji[thinkingMetadata.complexity]} ${complexityLabel[thinkingMetadata.complexity]} task`);
    }
    
    // Token count with formatting
    if (thinkingMetadata.tokenCount) {
      const formattedTokens = thinkingMetadata.tokenCount.toLocaleString();
      parts.push(`🔢 ${formattedTokens} tokens`);
    }
    
    if (parts.length > 0) {
      thinkingHeader += ` (${parts.join(', ')})`;
    }
  }
  
  thinkingHeader += '\n';
  const responseHeader = '\n\n📝 **Response:**\n';
  
  // Process thinking text for better structure
  const structuredThinking = structureThinkingText(thinkingText);
  
  // Calculate available space
  const headerLength = thinkingHeader.length + responseHeader.length;
  const availableSpace = maxLength - headerLength - 50; // 50 chars buffer
  
  // If the full response fits, return it as is
  const fullText = `${thinkingHeader}${structuredThinking}${responseHeader}${responseText}`;
  if (fullText.length <= maxLength) {
    return fullText;
  }
  
  // Prioritize the actual response over thinking
  // Ensure at least 500 chars for the response
  const minResponseLength = Math.min(500, responseText.length);
  const maxThinkingLength = availableSpace - minResponseLength;
  
  // Truncate thinking if needed
  let truncatedThinking = structuredThinking;
  if (structuredThinking.length > maxThinkingLength) {
    truncatedThinking = structuredThinking.substring(0, maxThinkingLength - 25) + '\n... (truncated)';
  }
  
  // Build the formatted response
  let formatted = `${thinkingHeader}${truncatedThinking}${responseHeader}`;
  
  // Add as much of the response as will fit
  const remainingSpace = maxLength - formatted.length - 20; // buffer
  if (responseText.length > remainingSpace) {
    formatted += responseText.substring(0, remainingSpace) + '... (continued)';
  } else {
    formatted += responseText;
  }
  
  return formatted;
}

/**
 * Structures thinking text with better formatting and section headers
 */
function structureThinkingText(thinkingText: string): string {
  // Check if thinking text already has structure
  if (thinkingText.includes('\n\n') || thinkingText.includes('- ') || thinkingText.includes('**')) {
    return thinkingText; // Already structured
  }
  
  // Split into sentences for analysis
  const sentences = thinkingText.match(/[^.!?]+[.!?]+/g) || [thinkingText];
  
  // Look for thinking patterns and add structure
  const structured: string[] = [];
  let currentSection = '';
  let currentSectionType = '';
  
  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    const lowerTrimmed = trimmed.toLowerCase();
    
    // Detect different thinking phases with expanded patterns
    if (lowerTrimmed.match(/^(first|initially|to start|let me|i'll begin|starting with)/i)) {
      if (currentSection && currentSectionType !== 'initial') {
        structured.push(currentSection);
      }
      currentSection = '🔍 **Initial Analysis:**\n' + trimmed;
      currentSectionType = 'initial';
    } else if (lowerTrimmed.match(/^(next|then|after that|secondly|additionally)/i) && !currentSectionType) {
      if (currentSection) structured.push(currentSection);
      currentSection = '🔄 **Next Steps:**\n' + trimmed;
      currentSectionType = 'steps';
    } else if (lowerTrimmed.match(/^(however|but|although|on the other hand|that said|alternatively)/i)) {
      if (currentSection) structured.push(currentSection);
      currentSection = '🤔 **Considerations:**\n' + trimmed;
      currentSectionType = 'considerations';
    } else if (lowerTrimmed.match(/^(i notice|i see|looking at|observing|it appears)/i)) {
      if (currentSection && currentSectionType !== 'observation') {
        structured.push(currentSection);
      }
      currentSection = '👁️ **Observations:**\n' + trimmed;
      currentSectionType = 'observation';
    } else if (lowerTrimmed.match(/^(therefore|thus|so|in conclusion|finally|to summarize)/i)) {
      if (currentSection) structured.push(currentSection);
      currentSection = '✅ **Conclusion:**\n' + trimmed;
      currentSectionType = 'conclusion';
    } else if (lowerTrimmed.match(/^(i need to|i should|i will|i'll|let me|i must)/i)) {
      if (currentSection && currentSectionType !== 'approach') {
        structured.push(currentSection);
      }
      currentSection = '📋 **Approach:**\n' + trimmed;
      currentSectionType = 'approach';
    } else if (lowerTrimmed.match(/^(the problem|the issue|the challenge|difficulty)/i)) {
      if (currentSection) structured.push(currentSection);
      currentSection = '⚠️ **Problem Identification:**\n' + trimmed;
      currentSectionType = 'problem';
    } else {
      // Add to current section
      if (!currentSection) {
        // Start with a default section if no pattern matched yet
        currentSection = '💭 **Thinking:**\n' + trimmed;
        currentSectionType = 'default';
      } else {
        currentSection += ' ' + trimmed;
      }
    }
  });
  
  if (currentSection) structured.push(currentSection);
  
  // If no structure was detected, add a basic header
  if (structured.length === 0) {
    return '💭 **Analysis:**\n' + thinkingText;
  }
  
  return structured.join('\n\n');
}

/**
 * Splits a thinking mode response intelligently across multiple messages
 * Keeps thinking and response sections together when possible
 */
export function splitThinkingResponse(
  thinkingText: string,
  responseText: string,
  maxLength: number = 2000
): string[] {
  const thinkingHeader = '💭 **Thinking:**\n';
  const responseHeader = '**Response:**\n';
  
  // First, try to fit everything in one message
  const fullText = `${thinkingHeader}${thinkingText}\n\n${responseHeader}${responseText}`;
  if (fullText.length <= maxLength) {
    return [fullText];
  }
  
  const messages: string[] = [];
  
  // If thinking alone is too long, split it across messages
  if (thinkingHeader.length + thinkingText.length > maxLength) {
    // First message: start of thinking
    const firstChunkLength = maxLength - thinkingHeader.length - 20;
    messages.push(thinkingHeader + thinkingText.substring(0, firstChunkLength) + '...');
    
    // Remaining thinking in subsequent messages
    let remainingThinking = thinkingText.substring(firstChunkLength);
    while (remainingThinking.length > 0) {
      const chunkLength = Math.min(remainingThinking.length, maxLength - 30);
      const chunk = remainingThinking.substring(0, chunkLength);
      remainingThinking = remainingThinking.substring(chunkLength);
      
      if (remainingThinking.length > 0) {
        messages.push('...' + chunk + '...');
      } else {
        // Last thinking chunk, add response header
        messages.push('...' + chunk + '\n\n' + responseHeader + responseText.substring(0, maxLength - chunk.length - responseHeader.length - 10));
        responseText = responseText.substring(maxLength - chunk.length - responseHeader.length - 10);
      }
    }
  } else {
    // Thinking fits in one message, but not with response
    messages.push(`${thinkingHeader}${thinkingText}\n\n${responseHeader}${responseText.substring(0, maxLength - fullText.length + responseText.length - 20)}...`);
    responseText = responseText.substring(maxLength - fullText.length + responseText.length - 20);
  }
  
  // Add remaining response text
  while (responseText.length > 0) {
    const chunk = responseText.substring(0, maxLength - 10);
    responseText = responseText.substring(chunk.length);
    
    if (messages.length > 0 && chunk.length > 0) {
      messages.push('...' + chunk + (responseText.length > 0 ? '...' : ''));
    }
  }
  
  return messages.filter(m => m.trim().length > 0);
}