/**
 * GitLab Platform Adapter
 * ========================
 *
 * Implements platform operations for GitLab using the `glab` CLI.
 * Supports both gitlab.com and self-hosted GitLab instances.
 *
 * Key differences from GitHub:
 * - Requires --hostname flag for self-hosted instances
 * - Uses project IDs (numeric) for API calls
 * - Release notes must be in a file, not inline
 * - Token stored in YAML config file per host
 * - Groups instead of organizations
 */

import { execSync, execFileSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { shell } from 'electron';
import { load as loadYaml } from 'js-yaml';
import type { GitPlatform } from '../git-platform-detector';
import type {
  PlatformAdapter,
  CliCheckResult,
  AuthCheckResult,
  PlatformUser,
  Repository,
  CreateRepoOptions,
  CreateRepoResult,
  CreateReleaseOptions,
  CreateReleaseResult,
  AuthStartResult,
  Organization
} from './base-adapter';
import { PlatformAdapterError } from './base-adapter';

/**
 * Cache for project IDs (fullPath → numeric ID)
 */
const projectIdCache = new Map<string, number>();

/**
 * GitLab platform adapter using `glab` CLI
 */
export class GitLabAdapter implements PlatformAdapter {
  constructor(private platform: GitPlatform) {}

  getPlatform(): GitPlatform {
    return this.platform;
  }

  getPlatformType(): 'github' | 'gitlab' {
    return 'gitlab';
  }

  getCliName(): string {
    return 'glab';
  }

  /**
   * Get the hostname for this GitLab instance
   */
  private getHost(): string {
    return this.platform.host;
  }

  /**
   * Get --hostname flag if this is a self-hosted instance
   */
  private getHostnameArgs(): string[] {
    if (this.platform.isSelfHosted) {
      return ['--hostname', this.getHost()];
    }
    return [];
  }

  /**
   * Get project ID for a repository
   * GitLab uses numeric project IDs for API calls
   */
  private async getProjectId(fullPath: string): Promise<number> {
    // Check cache
    if (projectIdCache.has(fullPath)) {
      return projectIdCache.get(fullPath)!;
    }

    try {
      // URL-encode the full path (owner/repo)
      const encodedPath = encodeURIComponent(fullPath);

      const args = ['api', `projects/${encodedPath}`, '--jq', '.id'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const output = execFileSync('glab', args, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const projectId = parseInt(output.trim(), 10);

      // Cache the result
      projectIdCache.set(fullPath, projectId);

      return projectId;
    } catch (error) {
      throw new PlatformAdapterError(
        `Failed to get project ID for ${fullPath}`,
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===========================================
  // CLI Detection and Authentication
  // ===========================================

  async checkCliInstalled(): Promise<CliCheckResult> {
    try {
      const checkCmd = process.platform === 'win32' ? 'where glab' : 'which glab';
      execSync(checkCmd, { encoding: 'utf-8', stdio: 'pipe' });

      // Get version
      const versionOutput = execSync('glab --version', { encoding: 'utf-8', stdio: 'pipe' });
      const version = versionOutput.trim().split('\n')[0];

      return { installed: true, version };
    } catch {
      return { installed: false };
    }
  }

  async checkAuthentication(): Promise<AuthCheckResult> {
    try {
      const args = ['auth', 'status'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      execFileSync('glab', args, { encoding: 'utf-8', stdio: 'pipe' });

      // Get username if authenticated
      try {
        const userArgs = ['api', '/user', '--jq', '.username'];
        if (this.platform.isSelfHosted) {
          userArgs.push(...this.getHostnameArgs());
        }

        const username = execFileSync('glab', userArgs, {
          encoding: 'utf-8',
          stdio: 'pipe'
        }).trim();

        return { authenticated: true, username };
      } catch {
        return { authenticated: true };
      }
    } catch {
      return { authenticated: false };
    }
  }

  async startAuth(): Promise<AuthStartResult> {
    return new Promise((resolve) => {
      try {
        const args = ['auth', 'login'];
        if (this.platform.isSelfHosted) {
          args.push(...this.getHostnameArgs());
        }

        const glabProcess = spawn('glab', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let output = '';
        let errorOutput = '';
        let authUrlExtracted = false;
        let extractedAuthUrl = `https://${this.getHost()}/oauth/authorize`;
        let browserOpenedSuccessfully = false;
        let extractionInProgress = false;

        const tryExtractAndOpenBrowser = async () => {
          if (authUrlExtracted || extractionInProgress) return;
          extractionInProgress = true;

          const combinedOutput = `${output}\n${errorOutput}`;

          // Look for auth URL in output
          const urlPattern = new RegExp(`https://${this.getHost().replace(/\./g, '\\.')}/[^\\s]+`, 'i');
          const urlMatch = combinedOutput.match(urlPattern);

          if (urlMatch) {
            authUrlExtracted = true;
            extractedAuthUrl = urlMatch[0];

            try {
              await shell.openExternal(extractedAuthUrl);
              browserOpenedSuccessfully = true;
            } catch {
              browserOpenedSuccessfully = false;
            }

            extractionInProgress = false;
          } else {
            extractionInProgress = false;
          }
        };

        glabProcess.stdout?.on('data', (data) => {
          output += data.toString();
          void tryExtractAndOpenBrowser();
        });

        glabProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString();
          void tryExtractAndOpenBrowser();
        });

        glabProcess.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              message: browserOpenedSuccessfully
                ? 'Successfully authenticated with GitLab'
                : 'Authentication successful. Browser could not be opened automatically.',
              authUrl: extractedAuthUrl,
              browserOpened: browserOpenedSuccessfully,
              fallbackUrl: !browserOpenedSuccessfully ? extractedAuthUrl : undefined
            });
          } else {
            resolve({
              success: false,
              message: 'Authentication failed. Please visit the URL manually to complete authentication.',
              authUrl: extractedAuthUrl,
              browserOpened: browserOpenedSuccessfully,
              fallbackUrl: extractedAuthUrl
            });
          }
        });

        glabProcess.on('error', (error) => {
          resolve({
            success: false,
            message: 'Failed to start GitLab CLI. Please visit the URL manually to authenticate.',
            browserOpened: false,
            fallbackUrl: `https://${this.getHost()}/oauth/authorize`
          });
        });
      } catch (error) {
        resolve({
          success: false,
          message: 'An unexpected error occurred. Please visit the URL manually to authenticate.',
          browserOpened: false,
          fallbackUrl: `https://${this.getHost()}/oauth/authorize`
        });
      }
    });
  }

  async getToken(): Promise<string> {
    try {
      // GitLab CLI stores tokens in ~/.config/glab-cli/config.yml
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        throw new Error('Could not determine home directory');
      }

      const configPath = join(homeDir, '.config', 'glab-cli', 'config.yml');

      if (!existsSync(configPath)) {
        throw new PlatformAdapterError('GitLab config file not found. Please authenticate first.', 'gitlab');
      }

      const configContent = readFileSync(configPath, 'utf-8');
      const config = loadYaml(configContent) as any;

      // Get token for this host
      const hostConfig = config?.hosts?.[this.getHost()];
      if (!hostConfig?.token) {
        throw new PlatformAdapterError(
          `No token found for ${this.getHost()}. Please authenticate first.`,
          'gitlab'
        );
      }

      return hostConfig.token;
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to get GitLab token',
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getUser(): Promise<PlatformUser> {
    try {
      const args = ['api', '/user'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const userJson = execFileSync('glab', args, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const user = JSON.parse(userJson);
      return {
        username: user.username,
        name: user.name,
        avatarUrl: user.avatar_url
      };
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to get GitLab user info',
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===========================================
  // Repository Operations
  // ===========================================

  async listRepos(limit: number = 100): Promise<Repository[]> {
    try {
      const args = ['repo', 'list'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const output = execFileSync('glab', args, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      // Parse glab repo list output (format: owner/repo)
      const lines = output.trim().split('\n').filter(line => line.trim());
      const repos: Repository[] = [];

      for (const line of lines.slice(0, limit)) {
        const fullName = line.trim();
        if (fullName && fullName.includes('/')) {
          repos.push({
            fullName,
            description: null,
            isPrivate: false, // glab repo list doesn't provide this info easily
            url: `https://${this.getHost()}/${fullName}`
          });
        }
      }

      return repos;
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to list GitLab repositories',
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  async detectRepo(projectPath: string): Promise<string | null> {
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        encoding: 'utf-8',
        cwd: projectPath,
        stdio: 'pipe'
      }).trim();

      // Parse GitLab repo from URL
      // Match: git@host:owner/repo.git or https://host/owner/repo.git
      const hostEscaped = this.getHost().replace(/\./g, '\\.');
      const sshMatch = remoteUrl.match(new RegExp(`git@${hostEscaped}:([^/]+\\/[^/]+?)(?:\\.git)?$`));
      const httpsMatch = remoteUrl.match(new RegExp(`https?://${hostEscaped}/([^/]+\\/[^/]+?)(?:\\.git)?$`));

      return sshMatch?.[1] || httpsMatch?.[1] || null;
    } catch {
      return null;
    }
  }

  async getBranches(repo: string): Promise<string[]> {
    try {
      // Get project ID
      const projectId = await this.getProjectId(repo);

      const args = ['api', `projects/${projectId}/repository/branches`, '--jq', '.[].name'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const output = execFileSync('glab', args, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      return output.trim().split('\n').filter(b => b.length > 0);
    } catch (error) {
      throw new PlatformAdapterError(
        `Failed to get branches for ${repo}`,
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createRepo(options: CreateRepoOptions): Promise<CreateRepoResult> {
    try {
      const args = ['repo', 'create', options.name, '--source', options.projectPath];

      if (options.isPrivate) {
        args.push('--private');
      } else {
        args.push('--public');
      }

      if (options.description) {
        args.push('--description', options.description);
      }

      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      execFileSync('glab', args, {
        encoding: 'utf-8',
        cwd: options.projectPath,
        stdio: 'pipe'
      });

      // Get user to determine full name
      const user = await this.getUser();
      const owner = options.owner || user.username;
      const fullName = `${owner}/${options.name}`;
      const url = `https://${this.getHost()}/${fullName}`;

      return { fullName, url };
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to create GitLab repository',
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  async addGitRemote(projectPath: string, repoFullName: string): Promise<{ remoteUrl: string }> {
    try {
      const remoteUrl = `https://${this.getHost()}/${repoFullName}.git`;

      // Remove origin if exists
      try {
        execSync('git remote get-url origin', {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        execSync('git remote remove origin', {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
      } catch {
        // No origin exists
      }

      // Add remote
      execFileSync('git', ['remote', 'add', 'origin', remoteUrl], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      return { remoteUrl };
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to add git remote',
        'gitlab',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===========================================
  // Organization/Group Operations
  // ===========================================

  async listOrganizations(): Promise<Organization[]> {
    try {
      const args = ['api', '/groups', '--jq', '.[] | {login: .path, avatarUrl: .avatar_url}'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const output = execFileSync('glab', args, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const orgs: Organization[] = [];
      const lines = output.trim().split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const org = JSON.parse(line);
          orgs.push({
            login: org.login,
            avatarUrl: org.avatarUrl
          });
        } catch {
          // Skip invalid JSON lines
        }
      }

      return orgs;
    } catch {
      // Return empty array if user has no groups or API call fails
      return [];
    }
  }

  // ===========================================
  // Release Operations
  // ===========================================

  async getReleaseUrl(projectPath: string, tagName: string): Promise<string | undefined> {
    try {
      // Get repo full name first
      const repo = await this.detectRepo(projectPath);
      if (!repo) return undefined;

      // Get project ID
      const projectId = await this.getProjectId(repo);

      const args = ['api', `projects/${projectId}/releases/${tagName}`, '--jq', '.\'_links\'.self'];
      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const result = execFileSync('glab', args, {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      return result || undefined;
    } catch {
      return undefined;
    }
  }

  async createRelease(options: CreateReleaseOptions): Promise<CreateReleaseResult> {
    let notesFile: string | undefined;

    try {
      // Write release notes to temp file (glab requires --notes-file)
      notesFile = join(tmpdir(), `glab-release-notes-${Date.now()}.md`);
      writeFileSync(notesFile, options.body, 'utf-8');

      const args = [
        'release',
        'create',
        options.tagName,
        '--notes-file',
        notesFile
      ];

      if (this.platform.isSelfHosted) {
        args.push(...this.getHostnameArgs());
      }

      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn('glab', args, {
          cwd: options.projectPath,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        child.on('exit', (code) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(stderr || `glab exited with code ${code}`));
          }
        });

        child.on('error', reject);
      });

      // Get release URL
      const releaseUrl = await this.getReleaseUrl(options.projectPath, options.tagName);

      return {
        success: true,
        releaseUrl,
        tagName: options.tagName
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      // Clean up temp file
      if (notesFile && existsSync(notesFile)) {
        try {
          unlinkSync(notesFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
