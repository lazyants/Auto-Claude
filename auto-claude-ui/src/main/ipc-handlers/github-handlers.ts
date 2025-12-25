/**
 * Platform integration IPC handlers (GitHub and GitLab)
 *
 * This file serves as the main entry point for platform-related handlers.
 * All handler implementations have been modularized into the platform/ subdirectory.
 *
 * Module organization:
 * - platform/repository-handlers.ts - Repository and connection management
 * - platform/issue-handlers.ts - Issue fetching and retrieval
 * - platform/investigation-handlers.ts - AI-powered issue investigation
 * - platform/import-handlers.ts - Bulk issue import
 * - platform/release-handlers.ts - Platform release creation
 * - platform/oauth-handlers.ts - Platform OAuth authentication
 * - platform/utils.ts - Shared utility functions
 * - platform/spec-utils.ts - Spec creation utilities
 * - platform/types.ts - TypeScript type definitions
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from '../agent';
import { registerGithubHandlers as registerModularHandlers } from './platform';

/**
 * Register all GitHub-related IPC handlers
 *
 * @param agentManager - Agent manager instance for task creation
 * @param getMainWindow - Function to get the main browser window
 */
export function registerGithubHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerModularHandlers(agentManager, getMainWindow);
}
