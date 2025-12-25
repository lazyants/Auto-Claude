/**
 * Git Platform Detection Utility
 * ==============================
 *
 * Automatically detects whether a project uses GitHub or GitLab by parsing
 * the git remote URL. Supports both public and self-hosted instances.
 *
 * Examples:
 * - https://github.com/owner/repo.git → GitHub
 * - git@github.com:owner/repo.git → GitHub
 * - https://gitlab.com/owner/repo.git → GitLab
 * - git@git.lazy-ants.de:owner/repo.git → GitLab (self-hosted)
 */

import { execSync } from 'child_process';
import path from 'path';

/**
 * Supported git platforms
 */
export type PlatformType = 'github' | 'gitlab';

/**
 * Git platform information extracted from remote URL
 */
export interface GitPlatform {
  /** Platform type (github or gitlab) */
  type: PlatformType;

  /** Hostname (e.g., 'github.com', 'gitlab.com', 'git.lazy-ants.de') */
  host: string;

  /** Repository owner/user/group */
  owner: string;

  /** Repository name */
  repo: string;

  /** Full repository name (owner/repo) */
  fullName: string;

  /** True if this is GitHub */
  isGitHub: boolean;

  /** True if this is GitLab */
  isGitLab: boolean;

  /** True if this is a self-hosted instance */
  isSelfHosted: boolean;
}

/**
 * Cache of detected platforms by project path
 */
const platformCache = new Map<string, GitPlatform | null>();

/**
 * Clear the platform detection cache
 */
export function clearPlatformCache(): void {
  platformCache.clear();
}

/**
 * Clear cache for a specific project
 */
export function clearProjectPlatformCache(projectPath: string): void {
  const normalizedPath = path.resolve(projectPath);
  platformCache.delete(normalizedPath);
}

/**
 * Parse a git remote URL and extract platform information
 *
 * Supported formats:
 * - HTTPS: https://github.com/owner/repo.git
 * - HTTPS (no .git): https://github.com/owner/repo
 * - SSH: git@github.com:owner/repo.git
 * - SSH (no .git): git@github.com:owner/repo
 *
 * @param remoteUrl - Git remote URL
 * @returns GitPlatform if successfully parsed, null if not a recognized platform
 */
export function parseGitRemoteUrl(remoteUrl: string): GitPlatform | null {
  // Trim whitespace
  const url = remoteUrl.trim();

  // Try HTTPS format: https://host/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    return createPlatform(host, owner, repo);
  }

  // Try SSH format: git@host:owner/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return createPlatform(host, owner, repo);
  }

  // Could not parse
  return null;
}

/**
 * Create a GitPlatform object from parsed components
 */
function createPlatform(host: string, owner: string, repo: string): GitPlatform {
  const normalizedHost = host.toLowerCase();

  // Detect platform type
  const isGitHub = normalizedHost === 'github.com' || normalizedHost.includes('github');
  const isGitLab =
    normalizedHost === 'gitlab.com' ||
    normalizedHost.includes('gitlab') ||
    (!isGitHub && normalizedHost !== 'github.com'); // Default to GitLab for unknown hosts

  // Detect self-hosted (not on public github.com or gitlab.com)
  const isSelfHosted = normalizedHost !== 'github.com' && normalizedHost !== 'gitlab.com';

  return {
    type: isGitHub ? 'github' : 'gitlab',
    host: normalizedHost,
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    isGitHub,
    isGitLab,
    isSelfHosted
  };
}

/**
 * Get the git remote URL for a project
 *
 * @param projectPath - Path to the git repository
 * @param remoteName - Remote name (default: 'origin')
 * @returns Remote URL or null if not found
 */
export function getGitRemoteUrl(
  projectPath: string,
  remoteName: string = 'origin'
): string | null {
  try {
    const remoteUrl = execSync(`git remote get-url ${remoteName}`, {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    return remoteUrl || null;
  } catch {
    // Remote not found or not a git repo
    return null;
  }
}

/**
 * Detect the git platform for a project by analyzing its remote URL
 *
 * This function:
 * 1. Gets the git remote URL (defaults to 'origin')
 * 2. Parses the URL to identify the platform (GitHub or GitLab)
 * 3. Caches the result for performance
 *
 * @param projectPath - Path to the git repository
 * @param options - Detection options
 * @returns GitPlatform if detected, null if not a git repo or unrecognized platform
 *
 * @example
 * const platform = detectGitPlatform('/path/to/project');
 * if (platform?.isGitHub) {
 *   console.log('This is a GitHub project');
 * } else if (platform?.isGitLab) {
 *   console.log(`This is a GitLab project on ${platform.host}`);
 * }
 */
export function detectGitPlatform(
  projectPath: string,
  options: {
    /** Remote name to check (default: 'origin') */
    remoteName?: string;
    /** Force re-detection even if cached */
    forceRefresh?: boolean;
  } = {}
): GitPlatform | null {
  const { remoteName = 'origin', forceRefresh = false } = options;
  const normalizedPath = path.resolve(projectPath);

  // Check cache unless force refresh
  if (!forceRefresh && platformCache.has(normalizedPath)) {
    return platformCache.get(normalizedPath) || null;
  }

  // Get remote URL
  const remoteUrl = getGitRemoteUrl(normalizedPath, remoteName);
  if (!remoteUrl) {
    platformCache.set(normalizedPath, null);
    return null;
  }

  // Parse URL to detect platform
  const platform = parseGitRemoteUrl(remoteUrl);

  // Cache result
  platformCache.set(normalizedPath, platform);

  return platform;
}

/**
 * Check if a project is using GitHub
 *
 * @param projectPath - Path to the git repository
 * @returns true if project uses GitHub, false otherwise
 */
export function isGitHubProject(projectPath: string): boolean {
  const platform = detectGitPlatform(projectPath);
  return platform?.isGitHub ?? false;
}

/**
 * Check if a project is using GitLab
 *
 * @param projectPath - Path to the git repository
 * @returns true if project uses GitLab, false otherwise
 */
export function isGitLabProject(projectPath: string): boolean {
  const platform = detectGitPlatform(projectPath);
  return platform?.isGitLab ?? false;
}

/**
 * Get a user-friendly platform name for display in UI
 *
 * @param platform - Platform type
 * @returns Display name (e.g., "GitHub", "GitLab")
 */
export function getPlatformDisplayName(platform: PlatformType | GitPlatform): string {
  const type = typeof platform === 'string' ? platform : platform.type;

  switch (type) {
    case 'github':
      return 'GitHub';
    case 'gitlab':
      return 'GitLab';
    default:
      return 'Git Platform';
  }
}

/**
 * Get platform-specific CLI command name
 *
 * @param platform - Platform type
 * @returns CLI command name ('gh' for GitHub, 'glab' for GitLab)
 */
export function getPlatformCliName(platform: PlatformType | GitPlatform): string {
  const type = typeof platform === 'string' ? platform : platform.type;

  switch (type) {
    case 'github':
      return 'gh';
    case 'gitlab':
      return 'glab';
    default:
      return 'unknown';
  }
}
