/**
 * Platform OAuth Handlers
 * ========================
 *
 * Platform-agnostic OAuth handlers that work with both GitHub and GitLab.
 * Automatically detects the platform and uses the appropriate adapter.
 *
 * IPC channel names kept as GITHUB_* for backward compatibility, but they
 * now work with any platform.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { PlatformAdapterFactory } from '../../platform-adapters/factory';
import { detectGitPlatform, getPlatformDisplayName } from '../../git-platform-detector';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[Platform OAuth] ${message}`, data);
    } else {
      console.warn(`[Platform OAuth] ${message}`);
    }
  }
}

/**
 * Check if platform CLI is installed
 */
export function registerCheckGhCli(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CHECK_CLI,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{ installed: boolean; version?: string; platform?: string }>> => {
      debugLog('checkCli handler called', { projectPath });
      try {
        // If no project path provided, check for GitHub CLI (default)
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const result = await adapter.checkCliInstalled();
          return {
            success: true,
            data: { ...result, platform: 'GitHub' }
          };
        }

        // Detect platform from project
        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const result = await adapter.checkCliInstalled();

        debugLog(`${platformName} CLI check result:`, result);

        return {
          success: true,
          data: { ...result, platform: platformName }
        };
      } catch (error) {
        debugLog('CLI check error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );
}

/**
 * Check if user is authenticated with platform CLI
 */
export function registerCheckGhAuth(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CHECK_AUTH,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{ authenticated: boolean; username?: string; platform?: string }>> => {
      debugLog('checkAuth handler called', { projectPath });
      try {
        // If no project path provided, check for GitHub (default)
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const result = await adapter.checkAuthentication();
          return {
            success: true,
            data: { ...result, platform: 'GitHub' }
          };
        }

        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const result = await adapter.checkAuthentication();

        debugLog(`${platformName} auth check result:`, result);

        return {
          success: true,
          data: { ...result, platform: platformName }
        };
      } catch (error) {
        debugLog('Auth check error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );
}

/**
 * Start platform OAuth flow
 */
export function registerStartGhAuth(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_START_AUTH,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{
      success: boolean;
      message?: string;
      deviceCode?: string;
      authUrl?: string;
      browserOpened?: boolean;
      fallbackUrl?: string;
      platform?: string;
    }>> => {
      debugLog('startAuth handler called', { projectPath });
      try {
        // If no project path provided, use GitHub (default)
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const result = await adapter.startAuth();
          return {
            success: result.success,
            data: { ...result, platform: 'GitHub' }
          };
        }

        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const result = await adapter.startAuth();

        debugLog(`${platformName} auth result:`, { success: result.success });

        return {
          success: result.success,
          data: { ...result, platform: platformName }
        };
      } catch (error) {
        debugLog('Start auth error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: {
            success: false,
            browserOpened: false,
            fallbackUrl: 'https://github.com/login/device'
          }
        };
      }
    }
  );
}

/**
 * Get the current platform auth token
 */
export function registerGetGhToken(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_TOKEN,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{ token: string; platform?: string }>> => {
      debugLog('getToken handler called', { projectPath });
      try {
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const token = await adapter.getToken();
          return {
            success: true,
            data: { token, platform: 'GitHub' }
          };
        }

        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const token = await adapter.getToken();

        debugLog(`${platformName} token retrieved successfully`);

        return {
          success: true,
          data: { token, platform: platformName }
        };
      } catch (error) {
        debugLog('Get token error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get token'
        };
      }
    }
  );
}

/**
 * Get the authenticated platform user info
 */
export function registerGetGhUser(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_USER,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{ username: string; name?: string; platform?: string }>> => {
      debugLog('getUser handler called', { projectPath });
      try {
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const user = await adapter.getUser();
          return {
            success: true,
            data: { ...user, platform: 'GitHub' }
          };
        }

        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const user = await adapter.getUser();

        debugLog(`${platformName} user:`, { username: user.username });

        return {
          success: true,
          data: { ...user, platform: platformName }
        };
      } catch (error) {
        debugLog('Get user error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get user info'
        };
      }
    }
  );
}

/**
 * List repositories accessible to the authenticated user
 */
export function registerListUserRepos(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_LIST_USER_REPOS,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean; url?: string }>; platform?: string }>> => {
      debugLog('listRepos handler called', { projectPath });
      try {
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const repos = await adapter.listRepos();
          return {
            success: true,
            data: { repos, platform: 'GitHub' }
          };
        }

        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const repos = await adapter.listRepos();

        debugLog(`${platformName} repos found:`, repos.length);

        return {
          success: true,
          data: { repos, platform: platformName }
        };
      } catch (error) {
        debugLog('List repos error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list repositories'
        };
      }
    }
  );
}

/**
 * Detect repository from git remote origin
 */
export function registerDetectGitHubRepo(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_DETECT_REPO,
    async (_event: Electron.IpcMainInvokeEvent, projectPath: string): Promise<IPCResult<string>> => {
      debugLog('detectRepo handler called', { projectPath });
      try {
        const adapter = await PlatformAdapterFactory.getAdapter(projectPath);
        const repo = await adapter.detectRepo(projectPath);

        if (!repo) {
          return {
            success: false,
            error: 'Remote URL is not a recognized repository'
          };
        }

        debugLog('Detected repo:', repo);

        return {
          success: true,
          data: repo
        };
      } catch (error) {
        debugLog('Detect repo error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect repository'
        };
      }
    }
  );
}

/**
 * Get branches from repository
 */
export function registerGetGitHubBranches(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_BRANCHES,
    async (_event: Electron.IpcMainInvokeEvent, repo: string, _token: string, projectPath?: string): Promise<IPCResult<string[]>> => {
      debugLog('getBranches handler called', { repo, projectPath });
      try {
        let adapter;

        if (projectPath) {
          adapter = await PlatformAdapterFactory.getAdapter(projectPath);
        } else {
          // Default to GitHub if no project path
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          adapter = new GitHubAdapter(platform);
        }

        const branches = await adapter.getBranches(repo);

        debugLog('Branches found:', branches.length);

        return {
          success: true,
          data: branches
        };
      } catch (error) {
        debugLog('Get branches error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get branches'
        };
      }
    }
  );
}

/**
 * Create a new repository using platform CLI
 */
export function registerCreateGitHubRepo(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CREATE_REPO,
    async (
      _event: Electron.IpcMainInvokeEvent,
      repoName: string,
      options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }
    ): Promise<IPCResult<{ fullName: string; url: string }>> => {
      debugLog('createRepo handler called', { repoName, options });
      try {
        const adapter = await PlatformAdapterFactory.getAdapter(options.projectPath);
        const result = await adapter.createRepo({
          name: repoName,
          ...options
        });

        debugLog('Created repo:', result);

        return {
          success: true,
          data: result
        };
      } catch (error) {
        debugLog('Create repo error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create repository'
        };
      }
    }
  );
}

/**
 * Add a remote origin to a local git repository
 */
export function registerAddGitRemote(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_ADD_REMOTE,
    async (
      _event: Electron.IpcMainInvokeEvent,
      projectPath: string,
      repoFullName: string
    ): Promise<IPCResult<{ remoteUrl: string }>> => {
      debugLog('addRemote handler called', { projectPath, repoFullName });
      try {
        const adapter = await PlatformAdapterFactory.getAdapter(projectPath);
        const result = await adapter.addGitRemote(projectPath, repoFullName);

        debugLog('Remote added:', result);

        return {
          success: true,
          data: result
        };
      } catch (error) {
        debugLog('Add remote error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add remote'
        };
      }
    }
  );
}

/**
 * List user's organizations/groups
 */
export function registerListGitHubOrgs(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_LIST_ORGS,
    async (_event: Electron.IpcMainInvokeEvent, projectPath?: string): Promise<IPCResult<{ orgs: Array<{ login: string; avatarUrl?: string }>; platform?: string }>> => {
      debugLog('listOrgs handler called', { projectPath });
      try {
        if (!projectPath) {
          const { GitHubAdapter } = require('../../platform-adapters/github-adapter');
          const platform = { type: 'github', host: 'github.com', owner: '', repo: '', fullName: '', isGitHub: true, isGitLab: false, isSelfHosted: false };
          const adapter = new GitHubAdapter(platform);
          const orgs = await adapter.listOrganizations();
          return {
            success: true,
            data: { orgs, platform: 'GitHub' }
          };
        }

        const platform = detectGitPlatform(projectPath);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const adapter = PlatformAdapterFactory.createAdapter(platform);
        const orgs = await adapter.listOrganizations();

        debugLog(`${platformName} orgs found:`, orgs.length);

        return {
          success: true,
          data: { orgs, platform: platformName }
        };
      } catch (error) {
        debugLog('List orgs error:', error);
        // Return success with empty array - user might not have any orgs
        return {
          success: true,
          data: { orgs: [] }
        };
      }
    }
  );
}

/**
 * Register all platform OAuth handlers
 */
export function registerGithubOAuthHandlers(): void {
  debugLog('Registering platform OAuth handlers');
  registerCheckGhCli();
  registerCheckGhAuth();
  registerStartGhAuth();
  registerGetGhToken();
  registerGetGhUser();
  registerListUserRepos();
  registerDetectGitHubRepo();
  registerGetGitHubBranches();
  registerCreateGitHubRepo();
  registerAddGitRemote();
  registerListGitHubOrgs();
  debugLog('Platform OAuth handlers registered');
}
