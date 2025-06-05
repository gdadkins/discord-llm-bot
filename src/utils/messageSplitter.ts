export function splitMessage(text: string, maxLength: number = 2000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';

  // Try to split on paragraphs first
  const paragraphs = text.split('\n\n');

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed limit
    if (currentChunk.length + paragraph.length + 2 > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If paragraph itself is too long, split on sentences
      if (paragraph.length > maxLength) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];

        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxLength) {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }

            // If sentence itself is too long, hard split
            if (sentence.length > maxLength) {
              const words = sentence.split(' ');
              for (const word of words) {
                if (currentChunk.length + word.length + 1 > maxLength) {
                  chunks.push(currentChunk.trim());
                  currentChunk = word;
                } else {
                  currentChunk += (currentChunk ? ' ' : '') + word;
                }
              }
            } else {
              currentChunk = sentence;
            }
          } else {
            currentChunk += sentence;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
