/**
 * Platform Adapter Factory
 * =========================
 *
 * Creates the appropriate platform adapter (GitHub or GitLab) based on the
 * detected git platform for a project.
 *
 * Usage:
 *   const adapter = await PlatformAdapterFactory.getAdapter(projectPath);
 *   const user = await adapter.getUser();
 */

import { detectGitPlatform, type GitPlatform } from '../git-platform-detector';
import type { PlatformAdapter } from './base-adapter';

/**
 * Factory for creating platform adapters
 *
 * Automatically detects the platform from the project's git remote
 * and returns the appropriate adapter.
 */
export class PlatformAdapterFactory {
  /**
   * Create a platform adapter for a project
   *
   * @param projectPath - Path to the project directory
   * @returns Platform adapter instance
   * @throws Error if platform cannot be detected or is unsupported
   */
  static async getAdapter(projectPath: string): Promise<PlatformAdapter> {
    const platform = detectGitPlatform(projectPath);

    if (!platform) {
      throw new Error(
        'Could not detect git platform. Make sure the project has a git remote configured.'
      );
    }

    return PlatformAdapterFactory.createAdapter(platform);
  }

  /**
   * Create a platform adapter for a specific platform
   *
   * @param platform - Git platform information
   * @returns Platform adapter instance
   * @throws Error if platform type is unsupported
   */
  static createAdapter(platform: GitPlatform): PlatformAdapter {
    switch (platform.type) {
      case 'github':
        // Lazy load to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GitHubAdapter } = require('./github-adapter');
        return new GitHubAdapter(platform);

      case 'gitlab':
        // Lazy load to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { GitLabAdapter } = require('./gitlab-adapter');
        return new GitLabAdapter(platform);

      default:
        throw new Error(`Unsupported platform type: ${platform.type}`);
    }
  }

  /**
   * Get adapter for a specific platform type without detection
   *
   * @param platformType - Platform type ('github' or 'gitlab')
   * @param host - Platform host (e.g., 'github.com', 'gitlab.com', 'git.company.com')
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Platform adapter instance
   */
  static createAdapterForType(
    platformType: 'github' | 'gitlab',
    host: string,
    owner: string,
    repo: string
  ): PlatformAdapter {
    const platform: GitPlatform = {
      type: platformType,
      host,
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      isGitHub: platformType === 'github',
      isGitLab: platformType === 'gitlab',
      isSelfHosted: host !== 'github.com' && host !== 'gitlab.com'
    };

    return PlatformAdapterFactory.createAdapter(platform);
  }
}

/**
 * Convenience function to get an adapter for a project
 *
 * @param projectPath - Path to the project directory
 * @returns Platform adapter instance
 */
export async function getAdapterForProject(projectPath: string): Promise<PlatformAdapter> {
  return PlatformAdapterFactory.getAdapter(projectPath);
}
