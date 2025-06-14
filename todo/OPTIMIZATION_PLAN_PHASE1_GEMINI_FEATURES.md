# Phase 1: Gemini API Feature Implementation Plan

## Overview
This phase focuses on implementing missing Gemini API features to enhance the bot's AI capabilities. All tasks are designed for parallel agent execution.

## Timeline: 3-5 Days
- Day 1-2: Core feature implementation (Agents 1-4)
- Day 3: Integration and testing (Agents 5-6)
- Day 4-5: Documentation and validation (Agent 7)

## Agent Task Assignments

### Agent 1: Google Search Grounding Implementation
**Priority**: CRITICAL
**Estimated Time**: 4-6 hours
**Dependencies**: @google/genai 1.5.1 update

**Task Details**:
1. Update package.json:
   - Upgrade @google/genai from 1.4.0 to 1.5.1
   - Run `npm update @google/genai`

2. Modify src/services/gemini.ts:
   - Location: `executeGeminiAPICall` method (around line 800-900)
   - Add tools array construction:
   ```typescript
   // After line 850 (before generateContent call)
   const tools = [];
   if (this.ENABLE_GOOGLE_SEARCH) {
     tools.push({
       googleSearch: {
         dynamicRetrievalConfig: {
           mode: 'MODE_DYNAMIC',
           dynamicThreshold: this.GROUNDING_THRESHOLD
         }
       }
     });
   }
   ```
   - Update generateContent call to include tools
   - Modify response parsing to handle grounding metadata

3. Add grounding metadata extraction:
   - Create new method `extractGroundingMetadata(response)`
   - Parse search results from response.candidates[0].groundingMetadata
   - Include sources in formatted response

4. Update response formatting:
   - Modify `formatResponse` method to include grounding sources
   - Add citation formatting for search results

**Success Criteria**:
- Google Search works when ENABLE_GOOGLE_SEARCH=true
- Sources are properly cited in responses
- No breaking changes to existing functionality

### Agent 2: Code Execution Implementation
**Priority**: HIGH
**Estimated Time**: 3-4 hours
**Dependencies**: None

**Task Details**:
1. Enable code execution in src/services/gemini.ts:
   - Location: Same `executeGeminiAPICall` method
   - Add to tools array:
   ```typescript
   if (this.ENABLE_CODE_EXECUTION) {
     tools.push({
       codeExecution: {}
     });
   }
   ```

2. Create code execution result parser:
   - New method: `parseCodeExecutionResults(response)`
   - Extract executed code and output
   - Format results for Discord display

3. Add safety checks:
   - Implement code output length limits
   - Add execution timeout handling
   - Create sanitization for code output

4. Update response processing:
   - Modify `extractResponseText` to handle code execution parts
   - Add code block formatting for Discord

**Success Criteria**:
- Code execution works for mathematical calculations
- Results are properly formatted in Discord
- Safety limits prevent abuse

### Agent 3: Structured Output/JSON Mode
**Priority**: HIGH
**Estimated Time**: 4-5 hours
**Dependencies**: None

**Task Details**:
1. Implement JSON mode in src/services/gemini.ts:
   - Location: `buildGenerationConfig` method (around line 700)
   - Add conditional response configuration:
   ```typescript
   if (this.ENABLE_STRUCTURED_OUTPUT && options.structuredOutput) {
     config.responseMimeType = 'application/json';
     config.responseSchema = options.structuredOutput.schema;
   }
   ```

2. Create structured output interfaces:
   - File: src/services/interfaces/GeminiInterfaces.ts
   - Add StructuredOutputOptions interface
   - Define common response schemas

3. Add JSON parsing and validation:
   - New method: `parseStructuredResponse(response, schema)`
   - Implement JSON schema validation
   - Add fallback for invalid responses

4. Create command parser using structured output:
   - File: src/services/commandParser.ts
   - Use structured output for command interpretation
   - Return parsed command objects

**Success Criteria**:
- Structured output returns valid JSON
- Schema validation works correctly
- Commands can be reliably parsed

### Agent 4: Enhanced Thinking Mode
**Priority**: MEDIUM
**Estimated Time**: 3-4 hours
**Dependencies**: None

**Task Details**:
1. Fix thinking text extraction in src/services/gemini.ts:
   - Location: `extractResponseText` method (around line 1000)
   - Update parsing logic:
   ```typescript
   if (part.thought === true || part.role === 'model-thinking') {
     if (!thinkingText) thinkingText = '';
     thinkingText += part.text + '\n';
   } else if (part.text && !part.thought) {
     text += part.text;
   }
   ```

2. Add adaptive thinking budget:
   - New method: `calculateThinkingBudget(prompt, complexity)`
   - Implement prompt complexity analysis
   - Scale budget based on task difficulty

3. Create thinking mode formatter:
   - File: src/utils/thinkingFormatter.ts (already exists)
   - Enhance formatting for better readability
   - Add thinking confidence indicators

4. Implement thinking analytics:
   - Track thinking token usage
   - Monitor thinking effectiveness
   - Add metrics for optimization

**Success Criteria**:
- Thinking text properly separated from response
- Adaptive budgets work correctly
- Analytics provide useful insights

### Agent 5: Audio Processing Preparation
**Priority**: MEDIUM
**Estimated Time**: 5-6 hours
**Dependencies**: Agents 1-4 completion

**Task Details**:
1. Add audio MIME types to src/services/multimodalContentHandler.ts:
   - Location: DEFAULT_CONFIG constant (line 27)
   - Add audio types:
   ```typescript
   'audio/mp3', 'audio/mpeg', 'audio/wav',
   'audio/ogg', 'audio/webm', 'audio/flac'
   ```

2. Implement audio processing methods:
   - New method: `processAudioAttachment(attachment)`
   - Add audio validation
   - Implement base64 encoding for audio

3. Create audio utilities:
   - File: src/utils/audioProcessor.ts (new)
   - Audio duration detection
   - Format conversion if needed
   - Size optimization

4. Update Gemini content builder:
   - Modify `convertToGeminiParts` method
   - Add audio part creation
   - Handle audio metadata

**Success Criteria**:
- Audio files recognized and processed
- Proper validation prevents unsupported formats
- Ready for API support when available

### Agent 6: Integration Testing Suite
**Priority**: HIGH
**Estimated Time**: 4-5 hours
**Dependencies**: Agents 1-5 completion

**Task Details**:
1. Create feature flag tests:
   - File: tests/unit/services/gemini.features.test.ts (new)
   - Test each feature toggle independently
   - Verify no interference between features

2. Add integration tests:
   - Test Google Search with real queries
   - Test code execution with math problems
   - Test structured output with schemas
   - Test thinking mode with complex prompts

3. Create performance benchmarks:
   - Measure response time with features enabled
   - Track token usage per feature
   - Monitor memory impact

4. Build feature validation suite:
   - Automated checks for each feature
   - Error scenario testing
   - Rate limit impact assessment

**Success Criteria**:
- All features have comprehensive tests
- No performance regressions
- Error cases handled gracefully

### Agent 7: Documentation and Examples
**Priority**: MEDIUM
**Estimated Time**: 3-4 hours
**Dependencies**: Agent 6 completion

**Task Details**:
1. Update configuration documentation:
   - File: docs/GEMINI_FEATURES_GUIDE.md (new)
   - Document each feature flag
   - Provide configuration examples
   - Include troubleshooting guide

2. Create usage examples:
   - Google Search grounding examples
   - Code execution demonstrations
   - Structured output schemas
   - Thinking mode scenarios

3. Update .env.example:
   - Add new feature flags with descriptions
   - Provide recommended settings
   - Include performance considerations

4. Create migration guide:
   - File: docs/GEMINI_UPGRADE_GUIDE.md (new)
   - Step-by-step upgrade instructions
   - Breaking change notifications
   - Rollback procedures

**Success Criteria**:
- Clear documentation for all features
- Working examples for each capability
- Smooth upgrade path documented

## Coordination Protocol

### Daily Sync Points
- Morning: Task assignment confirmation
- Midday: Progress check and blocker resolution
- Evening: Integration testing and handoffs

### Communication Channels
- Use TODO system for task tracking
- File PR comments for code reviews
- Update OPTIMIZATION_PROGRESS.md daily

### Quality Gates
1. Each feature must pass unit tests
2. Integration tests must cover happy path and edge cases
3. Documentation must be complete before feature release
4. Performance benchmarks must show no regression

## Risk Mitigation

### Potential Risks
1. **API Breaking Changes**: Keep old implementation as fallback
2. **Rate Limit Impact**: Implement progressive rollout
3. **Integration Conflicts**: Use feature flags for isolation
4. **Performance Degradation**: Monitor metrics continuously

### Rollback Plan
1. All features behind feature flags
2. Previous version tagged in git
3. Database migrations reversible
4. Configuration rollback documented

## Success Metrics
- All 4 major Gemini features implemented
- Zero breaking changes to existing functionality
- Performance within 10% of baseline
- 90%+ test coverage for new code
- Complete documentation and examples