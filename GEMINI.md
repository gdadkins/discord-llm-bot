# Gemini Project Helper

This file provides context about the `discord-llm-bot` project to help the Gemini assistant understand the codebase and provide better assistance.

## Project Overview

- **Project Name:** `discord-llm-bot`
- **Description:** A Discord bot integrated with the Gemini AI. It's written in TypeScript.
- **Language:** TypeScript
- **Main Entry Point:** `src/index.ts`
- **Never browse any folder higher level than where project files reside in Explorer
- **Always use best practice programming standards
- **Never use emoji in code or output
- **Never change the api model being used for the API call unless allowed because of API free usage availablity
- **When performing tests, use a reasoable timeout to keep it from running forever, and using transpileOnly(or something else) to date*-time*-log_fast.txt for compile errors

## Key Files

- **`package.json`**: Defines scripts, dependencies, and project metadata.
- **`tsconfig.json`**: TypeScript compiler options.
- **`.eslintrc.json`**: ESLint configuration for code linting.
- **`jest.config.js`**: Jest configuration for testing.
- **`Dockerfile`**: Instructions for building the Docker image.
- **`docker-compose.yml`**: Docker Compose configuration for running the bot and its services.

## Scripts

- **`npm run build`**: Compiles TypeScript code to the `dist` directory.
- **`npm run start`**: Starts the bot from the compiled code in the `dist` directory.
- **`npm run dev`**: Starts the bot in development mode using `ts-node` for automatic recompilation.
- **`npm run test`**: Runs all tests.
- **`npm run lint`**: Lints the codebase for style and errors.
- **`npm run format`**: Formats the code using Prettier.

## Project Structure

The project is organized into the following main directories:

- **`src/`**: Contains the main source code.
  - **`commands/`**: Holds the bot's command handlers.
  - **`config/`**: Manages configuration settings.
  - **`core/`**: Includes the core logic of the bot, such as initialization and event handling.
  - **`events/`**: Defines event listeners for Discord events.
  - **`handlers/`**: Contains handlers for different types of messages and interactions.
  - **`services/`**: Implements various services, such as the Gemini API integration.
  - **`types/`**: Provides TypeScript type definitions.
  - **`utils/`**: Offers utility functions used across the application.
- **`tests/`**: Contains all tests, including unit, integration, end-to-end, load, and chaos tests.
- **`docs/`**: Includes detailed documentation about the project's architecture, features, and setup.
- **`scripts/`**: Holds various utility scripts for tasks like load testing and database migration.

## How to Get Started

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Set up environment variables**:
   - Copy `.env.example` to a new `.env` file.
   - Fill in the required values, such as the Discord bot token and Gemini API key.
3. **Run the bot in development mode**:
   ```bash
   npm run dev
   ```

This comprehensive overview should help the Gemini assistant effectively analyze the codebase, understand its structure, and provide accurate and context-aware assistance.
