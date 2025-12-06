# Refactoring Plan: Structure Standardization & Technical Debt Cleanup

This document outlines a comprehensive plan to resolve architectural inconsistencies, clean up technical debt related to the configuration system, and standardize the service layer structure.

## Status Tracking

- [ ] **Phase 1: Service Layer Standardization**
- [ ] **Phase 2: Configuration Bridge Removal**
- [ ] **Phase 3: Legacy Configuration Migration**
- [ ] **Phase 4: Documentation & Artifact Cleanup**

---

## Phase 1: Service Layer Standardization

**Objective:** Organize `src/services/` by enforcing PascalCase naming conventions and grouping related files into domain-specific subdirectories. This reduces clutter and improves discoverability.

**Tasks:**

1.  **Rename Service Files to PascalCase:**
    *   Rename `src/services/analyticsManager.ts` -> `src/services/AnalyticsManager.ts`
    *   Rename `src/services/behaviorAnalyzer.ts` -> `src/services/BehaviorAnalyzer.ts`
    *   Rename `src/services/cacheManager.ts` -> `src/services/CacheManager.ts`
    *   Rename `src/services/commandParser.ts` -> `src/services/CommandParser.ts`
    *   Rename `src/services/contextManager.ts` -> `src/services/ContextManager.ts`
    *   Rename `src/services/conversationManager.ts` -> `src/services/ConversationManager.ts`
    *   Rename `src/services/healthMonitor.ts` -> `src/services/HealthMonitor.ts`
    *   Rename `src/services/helpSystem.ts` -> `src/services/HelpSystem.ts`
    *   Rename `src/services/personalityManager.ts` -> `src/services/PersonalityManager.ts`
    *   Rename `src/services/rateLimiter.ts` -> `src/services/RateLimiter.ts`
    *   Rename `src/services/responseProcessingService.ts` -> `src/services/ResponseProcessingService.ts`
    *   Rename `src/services/retryHandler.ts` -> `src/services/RetryHandler.ts`
    *   Rename `src/services/roastingEngine.ts` -> `src/services/RoastingEngine.ts`
    *   Rename `src/services/systemContextBuilder.ts` -> `src/services/SystemContextBuilder.ts`

2.  **Create Domain Subdirectories:**
    *   Create `src/services/rate-limiting/`
    *   Create `src/services/command-processing/`

3.  **Move Files to Subdirectories:**
    *   Move `src/services/RateLimiter.ts` -> `src/services/rate-limiting/RateLimiter.ts`
    *   Move `src/services/CommandParser.ts` -> `src/services/command-processing/CommandParser.ts`
    *   *Note:* Ensure `AnalyticsManager.ts` is in `src/services/analytics/` (it might already be a facade, check if it needs moving or if it stays as an entry point).
    *   *Note:* Ensure `ContextManager.ts` is in `src/services/context/`.

4.  **Update Exports:**
    *   Update `src/services/index.ts` (or create it if missing/incomplete) to export these services from their new locations.
    *   Update all imports in the codebase to point to the new file paths.
    *   *Tip:* Use `ripgrep` or search to find all occurrences of the old file names.

---

## Phase 2: Configuration Bridge Removal

**Objective:** Remove the intermediate bridge file `src/services/configurationManager.ts` that unnecessarily wraps the new modular configuration system.

**Tasks:**

1.  **Identify Consumers:**
    *   Search for all imports from `src/services/configurationManager` (case-sensitive check needed).
    *   *Search Pattern:* `from.*['"].*services/configurationManager['"]`

2.  **Update Imports:**
    *   Change all identified imports to point directly to `src/services/config/ConfigurationManager`.
    *   Example: `import { ConfigurationManager } from '../services/configurationManager'` -> `import { ConfigurationManager } from '../services/config/ConfigurationManager'`

3.  **Delete Bridge File:**
    *   Delete `src/services/configurationManager.ts`.

4.  **Verify Build:**
    *   Run `npm run build` or `npx tsc --noEmit` to ensure no broken imports remain.

---

## Phase 3: Legacy Configuration Migration

**Objective:** Completely remove the `src/config/` directory by migrating its remaining useful contents and updating all consumers to use the new `ConfigurationManager`.

**Tasks:**

1.  **Migrate Constants:**
    *   Move `src/config/constants.ts` to `src/utils/constants.ts`.
    *   Update all imports of `RATE_LIMITER_CONSTANTS` and others.

2.  **Migrate Feature Configs:**
    *   Analyze `src/commands/uxCommands.ts`. It imports `VideoConfiguration` from `src/config/videoConfig.ts`.
    *   Refactor `uxCommands.ts` to get video configuration from the `ConfigurationManager` (e.g., `configManager.getConfiguration().features.video` or similar).
    *   If the config structure doesn't exist in `ConfigurationManager`, add it to the default config and schema.

3.  **Update Tests:**
    *   Search for all tests importing from `src/config/*` (approx 20 files).
    *   Update them to import `ConfigurationManager` from `src/services/config/ConfigurationManager`.
    *   If tests use `ConfigurationFactory`, refactor them to mock or use `ConfigurationManager`.

4.  **Delete Legacy Directory:**
    *   Once empty of used code, delete the `src/config/` directory.

---

## Phase 4: Documentation & Artifact Cleanup

**Objective:** Clean up non-code artifacts from the source tree to maintain project hygiene.

**Tasks:**

1.  **Move API Contracts:**
    *   Move `src/services/contextManager.api-contract.md` to `docs/API_CONTRACTS/ContextManager_API_Contract.md`.

2.  **Move Other Markdown:**
    *   Scan `src/` for any other `.md` files and move them to `docs/`.

3.  **Final Verification:**
    *   Run `npm run test` to ensure the restructuring didn't break any functionality.
    *   Run `npm run lint` to ensure code style is maintained.
