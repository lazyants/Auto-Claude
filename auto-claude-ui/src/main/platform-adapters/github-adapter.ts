/**
 * GitHub Platform Adapter
 * ========================
 *
 * Implements platform operations for GitHub using the `gh` CLI.
 * Wraps existing GitHub functionality into the platform adapter interface.
 */

import { execSync, execFileSync, spawn } from 'child_process';
import { shell } from 'electron';
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
 * GitHub platform adapter using `gh` CLI
 */
export class GitHubAdapter implements PlatformAdapter {
  constructor(private platform: GitPlatform) {}

  getPlatform(): GitPlatform {
    return this.platform;
  }

  getPlatformType(): 'github' | 'gitlab' {
    return 'github';
  }

  getCliName(): string {
    return 'gh';
  }

  // ===========================================
  // CLI Detection and Authentication
  // ===========================================

  async checkCliInstalled(): Promise<CliCheckResult> {
    try {
      const checkCmd = process.platform === 'win32' ? 'where gh' : 'which gh';
      execSync(checkCmd, { encoding: 'utf-8', stdio: 'pipe' });

      // Get version
      const versionOutput = execSync('gh --version', { encoding: 'utf-8', stdio: 'pipe' });
      const version = versionOutput.trim().split('\n')[0];

      return { installed: true, version };
    } catch {
      return { installed: false };
    }
  }

  async checkAuthentication(): Promise<AuthCheckResult> {
    try {
      execSync('gh auth status', { encoding: 'utf-8', stdio: 'pipe' });

      // Get username if authenticated
      try {
        const username = execSync('gh api user --jq .login', {
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
        const args = ['auth', 'login', '--web', '--scopes', 'repo'];
        const ghProcess = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });

        let output = '';
        let errorOutput = '';
        let deviceCodeExtracted = false;
        let extractedDeviceCode: string | null = null;
        let extractedAuthUrl = 'https://github.com/login/device';
        let browserOpenedSuccessfully = false;
        let extractionInProgress = false;

        const tryExtractAndOpenBrowser = async () => {
          if (deviceCodeExtracted || extractionInProgress) return;
          extractionInProgress = true;

          const combinedOutput = `${output}\n${errorOutput}`;
          const deviceCodeMatch = combinedOutput.match(
            /(?:one-time code|verification code|code):\s*([A-Z0-9]{4}[-\s][A-Z0-9]{4})/i
          );
          const urlMatch = combinedOutput.match(/https:\/\/github\.com\/login\/device/i);

          if (deviceCodeMatch) {
            deviceCodeExtracted = true;
            extractedDeviceCode = deviceCodeMatch[1].replace(' ', '-');
            if (urlMatch) extractedAuthUrl = urlMatch[0];

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

        ghProcess.stdout?.on('data', (data) => {
          output += data.toString();
          void tryExtractAndOpenBrowser();
        });

        ghProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString();
          void tryExtractAndOpenBrowser();
        });

        ghProcess.on('close', (code) => {
          if (code === 0) {
            resolve({
              success: true,
              message: browserOpenedSuccessfully
                ? 'Successfully authenticated with GitHub'
                : 'Authentication successful. Browser could not be opened automatically.',
              deviceCode: extractedDeviceCode || undefined,
              authUrl: extractedAuthUrl,
              browserOpened: browserOpenedSuccessfully,
              fallbackUrl: !browserOpenedSuccessfully ? extractedAuthUrl : undefined
            });
          } else {
            resolve({
              success: false,
              message: 'Authentication failed. Please visit the URL manually to complete authentication.',
              deviceCode: extractedDeviceCode || undefined,
              authUrl: extractedAuthUrl,
              browserOpened: browserOpenedSuccessfully,
              fallbackUrl: extractedAuthUrl
            });
          }
        });

        ghProcess.on('error', (error) => {
          resolve({
            success: false,
            message: 'Failed to start GitHub CLI. Please visit the URL manually to authenticate.',
            browserOpened: false,
            fallbackUrl: 'https://github.com/login/device'
          });
        });
      } catch (error) {
        resolve({
          success: false,
          message: 'An unexpected error occurred. Please visit the URL manually to authenticate.',
          browserOpened: false,
          fallbackUrl: 'https://github.com/login/device'
        });
      }
    });
  }

  async getToken(): Promise<string> {
    try {
      const token = execSync('gh auth token', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      if (!token) {
        throw new PlatformAdapterError('No token found. Please authenticate first.', 'github');
      }

      return token;
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to get GitHub token',
        'github',
        error instanceof Error ? error : undefined
      );
    }
  }

  async getUser(): Promise<PlatformUser> {
    try {
      const userJson = execSync('gh api user', {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      const user = JSON.parse(userJson);
      return {
        username: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      };
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to get GitHub user info',
        'github',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===========================================
  // Repository Operations
  // ===========================================

  async listRepos(limit: number = 100): Promise<Repository[]> {
    try {
      const output = execSync(
        `gh repo list --limit ${limit} --json nameWithOwner,description,isPrivate`,
        {
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );

      const repos = JSON.parse(output);
      return repos.map((repo: { nameWithOwner: string; description: string | null; isPrivate: boolean }) => ({
        fullName: repo.nameWithOwner,
        description: repo.description,
        isPrivate: repo.isPrivate,
        url: `https://github.com/${repo.nameWithOwner}`
      }));
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to list GitHub repositories',
        'github',
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

      // Parse GitHub repo from URL
      const match = remoteUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  async getBranches(repo: string): Promise<string[]> {
    try {
      // Validate repo format
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
        throw new Error('Invalid repository format. Expected: owner/repo');
      }

      const apiEndpoint = `repos/${repo}/branches`;
      const output = execFileSync(
        'gh',
        ['api', apiEndpoint, '--paginate', '--jq', '.[].name'],
        {
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );

      return output.trim().split('\n').filter(b => b.length > 0);
    } catch (error) {
      throw new PlatformAdapterError(
        `Failed to get branches for ${repo}`,
        'github',
        error instanceof Error ? error : undefined
      );
    }
  }

  async createRepo(options: CreateRepoOptions): Promise<CreateRepoResult> {
    try {
      // Validate repo name
      if (!/^[A-Za-z0-9_.-]+$/.test(options.name)) {
        throw new Error(
          'Invalid repository name. Use only letters, numbers, hyphens, underscores, and periods.'
        );
      }

      // Get authenticated username
      const username = execSync('gh api user --jq .login', {
        encoding: 'utf-8',
        stdio: 'pipe'
      }).trim();

      const owner = options.owner || username;
      const isOrgRepo = owner !== username;
      const repoFullName = isOrgRepo ? `${owner}/${options.name}` : options.name;

      // Build gh repo create command
      const args = ['repo', 'create', repoFullName, '--source', options.projectPath];

      if (options.isPrivate) {
        args.push('--private');
      } else {
        args.push('--public');
      }

      if (options.description) {
        args.push('--description', options.description);
      }

      args.push('--push');

      execFileSync('gh', args, {
        encoding: 'utf-8',
        cwd: options.projectPath,
        stdio: 'pipe'
      });

      const fullName = `${owner}/${options.name}`;
      const url = `https://github.com/${fullName}`;

      return { fullName, url };
    } catch (error) {
      throw new PlatformAdapterError(
        'Failed to create GitHub repository',
        'github',
        error instanceof Error ? error : undefined
      );
    }
  }

  async addGitRemote(projectPath: string, repoFullName: string): Promise<{ remoteUrl: string }> {
    try {
      // Validate repo format
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
        throw new Error('Invalid repository format. Expected: owner/repo');
      }

      const remoteUrl = `https://github.com/${repoFullName}.git`;

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
        'github',
        error instanceof Error ? error : undefined
      );
    }
  }

  // ===========================================
  // Organization Operations
  // ===========================================

  async listOrganizations(): Promise<Organization[]> {
    try {
      const output = execSync('gh api user/orgs --jq \'.[] | {login: .login, avatarUrl: .avatar_url}\'', {
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
      // Return empty array if user has no orgs or API call fails
      return [];
    }
  }

  // ===========================================
  // Release Operations
  // ===========================================

  async getReleaseUrl(projectPath: string, tagName: string): Promise<string | undefined> {
    try {
      const result = execSync(`gh release view ${tagName} --json url -q .url 2>/dev/null`, {
        cwd: projectPath,
        encoding: 'utf-8'
      }).trim();

      return result || undefined;
    } catch {
      return undefined;
    }
  }

  async createRelease(options: CreateReleaseOptions): Promise<CreateReleaseResult> {
    try {
      const args = [
        'release',
        'create',
        options.tagName,
        '--title',
        options.title,
        '--notes',
        options.body
      ];

      if (options.draft) {
        args.push('--draft');
      }
      if (options.prerelease) {
        args.push('--prerelease');
      }

      const result = await new Promise<string>((resolve, reject) => {
        const child = spawn('gh', args, {
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
            reject(new Error(stderr || `gh exited with code ${code}`));
          }
        });

        child.on('error', reject);
      });

      // Get release URL
      let releaseUrl = result;
      if (!releaseUrl.startsWith('http')) {
        releaseUrl = await this.getReleaseUrl(options.projectPath, options.tagName) || '';
      }

      return {
        success: true,
        releaseUrl: releaseUrl || undefined,
        tagName: options.tagName
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
