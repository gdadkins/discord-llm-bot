# Refactoring Plan: Configuration Management System

This document outlines the step-by-step plan to resolve the architectural inconsistency in the Discord LLM Bot's configuration system. The goal is to migrate from the deprecated `ConfigurationFactory` to the robust, JSON-backed `ConfigurationManager`.

## Status Tracking

- [ ] **Section 1: Verification of Target Component**
- [ ] **Section 2: Refactor Bot Initializer**
- [ ] **Section 3: Interface Standardization & Cleanup**
- [ ] **Section 4: Final Validation**

---

## Section 1: Verification of Target Component

**Objective:** Confirm that `src/services/config/ConfigurationManager.ts` functions correctly, initializes a configuration file, and returns a valid `BotConfiguration` object before we integrate it into the core core.

**Tasks:**
1.  Create a verification script `scripts/verify-config-manager.ts`.
2.  The script should:
    *   Import `ConfigurationManager` from `../src/services/config/ConfigurationManager`.
    *   Instantiate the manager.
    *   Call `initialize()`.
    *   Retrieve the configuration using `getConfiguration()`.
    *   Log the configuration to the console to verify its structure.
    *   Check if `data/bot-config.json` was created.
3.  Run the script using `npx ts-node scripts/verify-config-manager.ts`.

**Agent Prompt:**
```text
I need to verify the functionality of the robust ConfigurationManager before integrating it. 

1. Create a script named `scripts/verify-config-manager.ts`.
2. In this script:
   - Import `ConfigurationManager` from `src/services/config/ConfigurationManager.ts`.
   - Instantiate it: `const manager = new ConfigurationManager();`.
   - Run `await manager.initialize();`.
   - Log "Manager initialized.".
   - Get the config: `const config = manager.getConfiguration();`.
   - Log the `config` object (JSON stringified).
   - Verify that the `config` object has the required top-level keys: `discord`, `gemini`, `rateLimiting`, `features`.
3. Execute this script using `npx ts-node scripts/verify-config-manager.ts` and show me the output.
4. If successful, mark "Section 1" as complete in `REFACTOR_PLAN_CONFIGURATION.md`.
```

---

## Section 2: Refactor Bot Initializer

**Objective:** Modify the bot's startup sequence in `src/core/botInitializer.ts` to use the `ConfigurationManager` instead of the deprecated `ConfigurationFactory`.

**Tasks:**
1.  Modify `src/core/botInitializer.ts`.
2.  Remove usage of `ConfigurationFactory.createBotConfiguration()`.
3.  Instantiate `ConfigurationManager` (from `src/services/config/ConfigurationManager`).
4.  Initialize the manager (`await manager.initialize()`).
5.  Retrieve the configuration object (`manager.getConfiguration()`) to pass to `ServiceFactory`.
6.  **Crucial:** Ensure that the `ConfigurationManager` instance itself is registered in the `ServiceRegistry` so other services can access it (replacing any old config service).

**Agent Prompt:**
```text
I am refactoring the bot initialization to use the correct ConfigurationManager.

1. Read `src/core/botInitializer.ts`.
2. Update the imports:
   - Remove `ConfigurationFactory`.
   - Add `ConfigurationManager` from `../src/services/config/ConfigurationManager`.
3. Inside `initializeBotServices`:
   - Replace the `ConfigurationFactory.createBotConfiguration()` call.
   - Instead, instantiate `const configManager = new ConfigurationManager();`.
   - Await `configManager.initialize()`.
   - Get the config object: `const config = configManager.getConfiguration();`.
4. The `serviceFactory.createServices(config)` call requires the config object, which we now have.
5. **Important:** The `configManager` instance needs to be available to the system. 
   - Check if `ServiceFactory` or `ServiceRegistry` expects a configuration service.
   - If `ServiceRegistry` has a slot for 'configuration', ensure we register this `configManager` instance there, or ensure `ServiceFactory` creates one internally that we should use instead.
   - *Note:* If `ServiceFactory` creates its own services, we might need to verify if it creates a *new* ConfigurationManager or if we should inject the one we just initialized. 
   - *Action:* If `ServiceFactory` creates services based on the config object, we might just need to pass `config`. However, to support hot-reloading, services usually need the *Manager*, not just the static *Config object*.
   - *Refinement:* Check `src/services/interfaces/serviceFactory.ts` first. If it doesn't support injecting the manager, just pass the config object for now, but add a TODO to refactor ServiceFactory for dependency injection of the Manager.
6. Run `npm test` to ensure no build errors or basic logic breaks.
7. Mark "Section 2" as complete in `REFACTOR_PLAN_CONFIGURATION.md`.
```

---

## Section 3: Interface Standardization & Cleanup

**Objective:** Ensure the new `ConfigurationManager` implements the standard `IConfigurationService` interface and address the duplicate file issues to prevent future confusion.

**Tasks:**
1.  Read `src/services/interfaces/ConfigurationInterfaces.ts` (or similar) to find `IConfigurationService` definition.
2.  Update `src/services/config/ConfigurationManager.ts` to explicitly `implements IConfigurationService`. Implement any missing properties/methods (like `getName()`, `getVersion()`, `getHealthStatus()`).
3.  **Deprecation:** Modify `src/config/ConfigurationManager.ts` (the "Singleton" wrapper) to add a `@deprecated` TSDoc tag and a runtime warning log, pointing developers to `src/services/config/ConfigurationManager`.

**Agent Prompt:**
```text
We need to standardize the interfaces and clean up duplicates.

1. Read `src/services/interfaces/ConfigurationInterfaces.ts` (or search for `interface IConfigurationService`).
2. Read `src/services/config/ConfigurationManager.ts`.
3. Modify `src/services/config/ConfigurationManager.ts` to `implements IConfigurationService`.
   - You may need to add methods like `getName()`, `getVersion()`, or `getHealthStatus()` if they are missing. Use the implementation in `src/config/ConfigurationManager.ts` as a reference/copy source if needed.
4. Add a `@deprecated` tag and a `console.warn` to `src/config/ConfigurationManager.ts` (the one wrapping the Factory) indicating it is deprecated in favor of the service-based manager.
5. Verify the code compiles: `npx tsc --noEmit`.
6. Mark "Section 3" as complete in `REFACTOR_PLAN_CONFIGURATION.md`.
```

---

## Section 4: Final Validation

**Objective:** comprehensive testing to ensure the bot starts up correctly and the configuration system is working as expected.

**Tasks:**
1.  Delete any existing `data/bot-config.json` (backup if needed) to test fresh generation.
2.  Run the bot in a "dry run" mode or just start it and kill it after 10 seconds.
3.  Verify `data/bot-config.json` is recreated.
4.  Check `logs/` for any errors related to configuration.

**Agent Prompt:**
```text
Perform final validation of the configuration refactor.

1. Delete `data/bot-config.json` if it exists.
2. Run the bot using `npm run dev` (or the appropriate start command). 
   - *Note:* Since this is an interactive session, run it as a background process or with a timeout `timeout 10s npm run dev` if available, or just start it, wait for "Ready" logs, and then stop it.
3. Check if `data/bot-config.json` was generated.
4. Read the logs (console output) and look for "ConfigurationManager initialized successfully".
5. If the bot started and the config file exists, mark "Section 4" as complete in `REFACTOR_PLAN_CONFIGURATION.md`.
```
