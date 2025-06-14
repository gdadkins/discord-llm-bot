/**
 * Multimodal Content Handler - Main export for backward compatibility
 * 
 * Re-exports the refactored MultimodalContentHandler from the modular structure
 */

// Re-export the main handler from the new modular structure
export { MultimodalContentHandler } from './multimodal/MultimodalContentHandler';

// Legacy import compatibility - this file maintains the old import path
import { MultimodalContentHandler as NewMultimodalContentHandler } from './multimodal/MultimodalContentHandler';

// Default export for backward compatibility
export default NewMultimodalContentHandler;