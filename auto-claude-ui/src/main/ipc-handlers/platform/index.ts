/**
 * Platform Integration IPC Handlers
 * ==================================
 *
 * Main entry point that registers all platform-related handlers (GitHub/GitLab).
 * Platform detection is automatic - handlers work with both GitHub and GitLab.
 *
 * Handlers are organized into modules by functionality:
 * - repository-handlers: Repository and connection management
 * - issue-handlers: Issue fetching and retrieval
 * - investigation-handlers: AI-powered issue investigation
 * - import-handlers: Bulk issue import
 * - release-handlers: Platform release creation (GitHub/GitLab)
 * - oauth-handlers: Platform CLI OAuth authentication (gh/glab)
 *
 * Note: Function names kept as "Github" for backward compatibility,
 * but they now work with any supported platform.
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from '../../agent';
import { registerRepositoryHandlers } from './repository-handlers';
import { registerIssueHandlers } from './issue-handlers';
import { registerInvestigationHandlers } from './investigation-handlers';
import { registerImportHandlers } from './import-handlers';
import { registerReleaseHandlers } from './release-handlers';
import { registerGithubOAuthHandlers } from './oauth-handlers';

/**
 * Register all platform-related IPC handlers
 * (GitHub and GitLab support - auto-detected per project)
 */
export function registerGithubHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerRepositoryHandlers();
  registerIssueHandlers();
  registerInvestigationHandlers(agentManager, getMainWindow);
  registerImportHandlers(agentManager);
  registerReleaseHandlers();
  registerGithubOAuthHandlers();
}

// Re-export utilities for potential external use
export { getGitHubConfig, githubFetch } from './utils';
export type { GitHubConfig } from './types';
