/**
 * Platform Adapter Base Interface
 * =================================
 *
 * Defines the contract that all platform adapters (GitHub, GitLab) must implement.
 * This abstraction allows Auto-Claude to work with different git platforms without
 * code duplication.
 *
 * Adapters provide:
 * - CLI detection and authentication
 * - Repository operations
 * - Release management
 * - Organization/group listing
 */

import type { GitPlatform } from '../git-platform-detector';

/**
 * Result of checking if CLI is installed
 */
export interface CliCheckResult {
  /** Whether the CLI tool is installed */
  installed: boolean;
  /** CLI version string if installed */
  version?: string;
}

/**
 * Result of checking authentication status
 */
export interface AuthCheckResult {
  /** Whether user is authenticated */
  authenticated: boolean;
  /** Authenticated username if available */
  username?: string;
}

/**
 * User information from the platform
 */
export interface PlatformUser {
  /** Username/login */
  username: string;
  /** Full name (optional) */
  name?: string;
  /** Avatar URL (optional) */
  avatarUrl?: string;
}

/**
 * Repository information
 */
export interface Repository {
  /** Full name (owner/repo) */
  fullName: string;
  /** Repository description */
  description: string | null;
  /** Whether repository is private */
  isPrivate: boolean;
  /** Repository URL */
  url?: string;
}

/**
 * Options for creating a new repository
 */
export interface CreateRepoOptions {
  /** Repository name */
  name: string;
  /** Repository description */
  description?: string;
  /** Whether repository should be private */
  isPrivate?: boolean;
  /** Local project path to link */
  projectPath: string;
  /** Owner (organization/group) name (optional, defaults to user) */
  owner?: string;
}

/**
 * Result of repository creation
 */
export interface CreateRepoResult {
  /** Full repository name (owner/repo) */
  fullName: string;
  /** Repository URL */
  url: string;
}

/**
 * Options for creating a release
 */
export interface CreateReleaseOptions {
  /** Project path */
  projectPath: string;
  /** Release version */
  version: string;
  /** Tag name (usually v{version}) */
  tagName: string;
  /** Release title */
  title: string;
  /** Release notes/body */
  body: string;
  /** Whether release is a draft */
  draft?: boolean;
  /** Whether release is a pre-release */
  prerelease?: boolean;
}

/**
 * Result of release creation
 */
export interface CreateReleaseResult {
  /** Whether release was successful */
  success: boolean;
  /** Release URL if successful */
  releaseUrl?: string;
  /** Tag name */
  tagName?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of starting authentication flow
 */
export interface AuthStartResult {
  /** Whether auth flow started successfully */
  success: boolean;
  /** Message to display to user */
  message?: string;
  /** Device code for OAuth flow (if applicable) */
  deviceCode?: string;
  /** Auth URL to open in browser */
  authUrl?: string;
  /** Whether browser was opened */
  browserOpened?: boolean;
  /** Fallback URL for manual auth */
  fallbackUrl?: string;
}

/**
 * Organization or group information
 */
export interface Organization {
  /** Organization/group login/name */
  login: string;
  /** Avatar URL (optional) */
  avatarUrl?: string;
}

/**
 * Base interface for platform adapters
 *
 * Each platform (GitHub, GitLab) implements this interface to provide
 * platform-specific functionality while maintaining a consistent API.
 */
export interface PlatformAdapter {
  /**
   * Get the platform information this adapter handles
   */
  getPlatform(): GitPlatform;

  /**
   * Get the platform type ('github' or 'gitlab')
   */
  getPlatformType(): 'github' | 'gitlab';

  /**
   * Get the CLI command name ('gh' or 'glab')
   */
  getCliName(): string;

  // ===========================================
  // CLI Detection and Authentication
  // ===========================================

  /**
   * Check if the platform CLI is installed
   */
  checkCliInstalled(): Promise<CliCheckResult>;

  /**
   * Check if user is authenticated with the platform
   */
  checkAuthentication(): Promise<AuthCheckResult>;

  /**
   * Start the authentication flow
   * Opens browser for OAuth or provides device code
   */
  startAuth(): Promise<AuthStartResult>;

  /**
   * Get the current authentication token
   * @throws Error if not authenticated
   */
  getToken(): Promise<string>;

  /**
   * Get authenticated user information
   * @throws Error if not authenticated
   */
  getUser(): Promise<PlatformUser>;

  // ===========================================
  // Repository Operations
  // ===========================================

  /**
   * List repositories accessible to the authenticated user
   * @param limit - Maximum number of repos to return (default: 100)
   */
  listRepos(limit?: number): Promise<Repository[]>;

  /**
   * Detect repository from git remote
   * @param projectPath - Path to the git repository
   * @returns Repository full name (owner/repo) or null if not found
   */
  detectRepo(projectPath: string): Promise<string | null>;

  /**
   * Get branches for a repository
   * @param repo - Repository full name (owner/repo)
   */
  getBranches(repo: string): Promise<string[]>;

  /**
   * Create a new repository
   */
  createRepo(options: CreateRepoOptions): Promise<CreateRepoResult>;

  /**
   * Add git remote to local repository
   * @param projectPath - Path to local repository
   * @param repoFullName - Full repository name (owner/repo)
   */
  addGitRemote(projectPath: string, repoFullName: string): Promise<{ remoteUrl: string }>;

  // ===========================================
  // Organization/Group Operations
  // ===========================================

  /**
   * List organizations/groups the user belongs to
   */
  listOrganizations(): Promise<Organization[]>;

  // ===========================================
  // Release Operations
  // ===========================================

  /**
   * Get release URL for a tag
   * @param projectPath - Path to the repository
   * @param tagName - Tag name (e.g., 'v1.0.0')
   * @returns Release URL or undefined if not found
   */
  getReleaseUrl(projectPath: string, tagName: string): Promise<string | undefined>;

  /**
   * Create a release
   */
  createRelease(options: CreateReleaseOptions): Promise<CreateReleaseResult>;
}

/**
 * Error thrown by platform adapters
 */
export class PlatformAdapterError extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PlatformAdapterError';
  }
}
