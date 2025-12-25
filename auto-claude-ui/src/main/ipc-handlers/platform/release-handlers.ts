/**
 * Platform Release Creation IPC Handlers
 * =======================================
 *
 * Platform-agnostic release handlers that work with both GitHub and GitLab.
 */

import { ipcMain } from 'electron';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GitCommit, VersionSuggestion } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { changelogService } from '../../changelog-service';
import type { ReleaseOptions } from './types';
import { PlatformAdapterFactory } from '../../platform-adapters/factory';
import { detectGitPlatform, getPlatformDisplayName, getPlatformCliName } from '../../git-platform-detector';

/**
 * Create a release using platform CLI (GitHub or GitLab)
 */
export function registerCreateRelease(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CREATE_RELEASE,
    async (
      _,
      projectId: string,
      version: string,
      releaseNotes: string,
      options?: ReleaseOptions
    ): Promise<IPCResult<{ url: string }>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Detect platform
        const platform = detectGitPlatform(project.path);
        if (!platform) {
          return {
            success: false,
            error: 'Could not detect platform. Make sure the project has a git remote configured.'
          };
        }

        const platformName = getPlatformDisplayName(platform);
        const cliName = getPlatformCliName(platform);

        // Get platform adapter
        const adapter = PlatformAdapterFactory.createAdapter(platform);

        // Check if CLI is installed
        const cliCheck = await adapter.checkCliInstalled();
        if (!cliCheck.installed) {
          return {
            success: false,
            error: `${platformName} CLI (${cliName}) not found. Please install it first.`
          };
        }

        // Check if user is authenticated
        const authCheck = await adapter.checkAuthentication();
        if (!authCheck.authenticated) {
          return {
            success: false,
            error: `Not authenticated with ${platformName}. Run "${cliName} auth login" in terminal first.`
          };
        }

        // Create release
        const tag = version.startsWith('v') ? version : `v${version}`;
        const releaseResult = await adapter.createRelease({
          projectPath: project.path,
          version,
          tagName: tag,
          title: tag,
          body: releaseNotes,
          draft: options?.draft,
          prerelease: options?.prerelease
        });

        if (!releaseResult.success) {
          return {
            success: false,
            error: releaseResult.error || 'Failed to create release'
          };
        }

        return {
          success: true,
          data: { url: releaseResult.releaseUrl || '' }
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to create release';
        return { success: false, error: errorMsg };
      }
    }
  );
}

/**
 * Get the latest git tag in the repository
 */
function getLatestTag(projectPath: string): string | null {
  try {
    const tag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();
    return tag || null;
  } catch {
    return null;
  }
}

/**
 * Get commits since a specific tag (or all commits if no tag)
 */
function getCommitsSinceTag(projectPath: string, tag: string | null): GitCommit[] {
  try {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const format = '%H|%s|%an|%ae|%aI';
    const output = execSync(`git log ${range} --pretty=format:"${format}"`, {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();

    if (!output) return [];

    return output.split('\n').map(line => {
      const [fullHash, subject, authorName, authorEmail, date] = line.split('|');
      return {
        hash: fullHash.substring(0, 7),
        fullHash,
        subject,
        author: authorName,
        authorEmail,
        date
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get current version from package.json
 */
function getCurrentVersion(projectPath: string): string {
  try {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!existsSync(pkgPath)) {
      return '0.0.0';
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Suggest version for release using AI analysis of commits
 */
export function registerSuggestVersion(): void {
  ipcMain.handle(
    IPC_CHANNELS.RELEASE_SUGGEST_VERSION,
    async (_, projectId: string): Promise<IPCResult<VersionSuggestion>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        // Get current version from package.json
        const currentVersion = getCurrentVersion(project.path);

        // Get latest tag
        const latestTag = getLatestTag(project.path);

        // Get commits since last tag
        const commits = getCommitsSinceTag(project.path, latestTag);

        if (commits.length === 0) {
          // No commits since last release, suggest patch bump
          const [major, minor, patch] = currentVersion.split('.').map(Number);
          return {
            success: true,
            data: {
              suggestedVersion: `${major}.${minor}.${patch + 1}`,
              currentVersion,
              bumpType: 'patch',
              reason: 'No new commits since last release',
              commitCount: 0
            }
          };
        }

        // Use AI to analyze commits and suggest version
        const suggestion = await changelogService.suggestVersionFromCommits(
          project.path,
          commits,
          currentVersion
        );

        return {
          success: true,
          data: {
            suggestedVersion: suggestion.version,
            currentVersion,
            bumpType: suggestion.reason.includes('breaking') ? 'major' :
                      suggestion.reason.includes('feature') || suggestion.reason.includes('minor') ? 'minor' : 'patch',
            reason: suggestion.reason,
            commitCount: commits.length
          }
        };
      } catch (_error) {
        // Fallback to patch bump on error
        const currentVersion = getCurrentVersion(project.path);
        const [major, minor, patch] = currentVersion.split('.').map(Number);

        return {
          success: true,
          data: {
            suggestedVersion: `${major}.${minor}.${patch + 1}`,
            currentVersion,
            bumpType: 'patch',
            reason: 'Fallback suggestion (AI analysis unavailable)',
            commitCount: 0
          }
        };
      }
    }
  );
}

/**
 * Register all release-related handlers
 */
export function registerReleaseHandlers(): void {
  registerCreateRelease();
  registerSuggestVersion();
}
