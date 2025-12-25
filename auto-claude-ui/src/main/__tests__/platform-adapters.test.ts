/**
 * Tests for platform adapters (GitHub and GitLab)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformAdapterFactory } from '../platform-adapters/factory';
import { GitHubAdapter } from '../platform-adapters/github-adapter';
import { GitLabAdapter } from '../platform-adapters/gitlab-adapter';
import type { GitPlatform } from '../git-platform-detector';
import * as detector from '../git-platform-detector';

// Mock the detector module
vi.mock('../git-platform-detector', async () => {
  const actual = await vi.importActual<typeof detector>('../git-platform-detector');
  return {
    ...actual,
    detectGitPlatform: vi.fn()
  };
});

describe('PlatformAdapterFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAdapter', () => {
    it('should create GitHubAdapter for GitHub platform', () => {
      const platform: GitPlatform = {
        type: 'github',
        host: 'github.com',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: true,
        isGitLab: false,
        isSelfHosted: false
      };

      const adapter = PlatformAdapterFactory.createAdapter(platform);

      expect(adapter).toBeInstanceOf(GitHubAdapter);
      expect(adapter.getPlatform()).toEqual(platform);
      expect(adapter.getPlatformType()).toBe('github');
      expect(adapter.getCliName()).toBe('gh');
    });

    it('should create GitLabAdapter for GitLab platform', () => {
      const platform: GitPlatform = {
        type: 'gitlab',
        host: 'gitlab.com',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: false,
        isGitLab: true,
        isSelfHosted: false
      };

      const adapter = PlatformAdapterFactory.createAdapter(platform);

      expect(adapter).toBeInstanceOf(GitLabAdapter);
      expect(adapter.getPlatform()).toEqual(platform);
      expect(adapter.getPlatformType()).toBe('gitlab');
      expect(adapter.getCliName()).toBe('glab');
    });

    it('should create GitLabAdapter for self-hosted GitLab', () => {
      const platform: GitPlatform = {
        type: 'gitlab',
        host: 'git.lazy-ants.de',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: false,
        isGitLab: true,
        isSelfHosted: true
      };

      const adapter = PlatformAdapterFactory.createAdapter(platform);

      expect(adapter).toBeInstanceOf(GitLabAdapter);
      expect(adapter.getPlatform()).toEqual(platform);
      expect(adapter.getPlatformType()).toBe('gitlab');
    });

    it('should throw error for unsupported platform type', () => {
      const platform = {
        type: 'bitbucket' as any,
        host: 'bitbucket.org',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: false,
        isGitLab: false,
        isSelfHosted: false
      };

      expect(() => PlatformAdapterFactory.createAdapter(platform)).toThrow(
        'Unsupported platform type: bitbucket'
      );
    });
  });

  describe('getAdapter', () => {
    it('should detect platform and create appropriate adapter', async () => {
      const platform: GitPlatform = {
        type: 'github',
        host: 'github.com',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: true,
        isGitLab: false,
        isSelfHosted: false
      };

      vi.mocked(detector.detectGitPlatform).mockReturnValueOnce(platform);

      const adapter = await PlatformAdapterFactory.getAdapter('/fake/path');

      expect(detector.detectGitPlatform).toHaveBeenCalledWith('/fake/path');
      expect(adapter).toBeInstanceOf(GitHubAdapter);
    });

    it('should throw error when platform cannot be detected', async () => {
      vi.mocked(detector.detectGitPlatform).mockReturnValueOnce(null);

      await expect(
        PlatformAdapterFactory.getAdapter('/fake/path')
      ).rejects.toThrow('Could not detect git platform');
    });
  });
});

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  const platform: GitPlatform = {
    type: 'github',
    host: 'github.com',
    owner: 'owner',
    repo: 'repo',
    fullName: 'owner/repo',
    isGitHub: true,
    isGitLab: false,
    isSelfHosted: false
  };

  beforeEach(() => {
    adapter = new GitHubAdapter(platform);
  });

  it('should implement all required adapter methods', () => {
    expect(typeof adapter.getPlatform).toBe('function');
    expect(typeof adapter.getPlatformType).toBe('function');
    expect(typeof adapter.getCliName).toBe('function');
    expect(typeof adapter.checkCliInstalled).toBe('function');
    expect(typeof adapter.checkAuthentication).toBe('function');
    expect(typeof adapter.startAuth).toBe('function');
    expect(typeof adapter.getToken).toBe('function');
    expect(typeof adapter.getUser).toBe('function');
    expect(typeof adapter.listRepos).toBe('function');
    expect(typeof adapter.detectRepo).toBe('function');
    expect(typeof adapter.getBranches).toBe('function');
    expect(typeof adapter.createRepo).toBe('function');
    expect(typeof adapter.addGitRemote).toBe('function');
    expect(typeof adapter.listOrganizations).toBe('function');
    expect(typeof adapter.getReleaseUrl).toBe('function');
    expect(typeof adapter.createRelease).toBe('function');
  });

  it('should return correct platform info', () => {
    expect(adapter.getPlatform()).toEqual(platform);
    expect(adapter.getPlatformType()).toBe('github');
    expect(adapter.getCliName()).toBe('gh');
  });
});

describe('GitLabAdapter', () => {
  let adapter: GitLabAdapter;

  describe('GitLab.com (not self-hosted)', () => {
    const platform: GitPlatform = {
      type: 'gitlab',
      host: 'gitlab.com',
      owner: 'owner',
      repo: 'repo',
      fullName: 'owner/repo',
      isGitHub: false,
      isGitLab: true,
      isSelfHosted: false
    };

    beforeEach(() => {
      adapter = new GitLabAdapter(platform);
    });

    it('should implement all required adapter methods', () => {
      expect(typeof adapter.getPlatform).toBe('function');
      expect(typeof adapter.getPlatformType).toBe('function');
      expect(typeof adapter.getCliName).toBe('function');
      expect(typeof adapter.checkCliInstalled).toBe('function');
      expect(typeof adapter.checkAuthentication).toBe('function');
      expect(typeof adapter.startAuth).toBe('function');
      expect(typeof adapter.getToken).toBe('function');
      expect(typeof adapter.getUser).toBe('function');
      expect(typeof adapter.listRepos).toBe('function');
      expect(typeof adapter.detectRepo).toBe('function');
      expect(typeof adapter.getBranches).toBe('function');
      expect(typeof adapter.createRepo).toBe('function');
      expect(typeof adapter.addGitRemote).toBe('function');
      expect(typeof adapter.listOrganizations).toBe('function');
      expect(typeof adapter.getReleaseUrl).toBe('function');
      expect(typeof adapter.createRelease).toBe('function');
    });

    it('should return correct platform info', () => {
      expect(adapter.getPlatform()).toEqual(platform);
      expect(adapter.getPlatformType()).toBe('gitlab');
      expect(adapter.getCliName()).toBe('glab');
    });
  });

  describe('Self-hosted GitLab', () => {
    const platform: GitPlatform = {
      type: 'gitlab',
      host: 'git.lazy-ants.de',
      owner: 'owner',
      repo: 'repo',
      fullName: 'owner/repo',
      isGitHub: false,
      isGitLab: true,
      isSelfHosted: true
    };

    beforeEach(() => {
      adapter = new GitLabAdapter(platform);
    });

    it('should return correct platform info', () => {
      expect(adapter.getPlatform()).toEqual(platform);
      expect(adapter.getPlatformType()).toBe('gitlab');
      expect(adapter.getCliName()).toBe('glab');
    });

    it('should handle self-hosted host correctly', () => {
      const platformData = adapter.getPlatform();
      expect(platformData.host).toBe('git.lazy-ants.de');
      expect(platformData.isSelfHosted).toBe(true);
    });
  });

  describe('GitLab with nested groups', () => {
    const platform: GitPlatform = {
      type: 'gitlab',
      host: 'gitlab.com',
      owner: 'group/subgroup',
      repo: 'repo',
      fullName: 'group/subgroup/repo',
      isGitHub: false,
      isGitLab: true,
      isSelfHosted: false
    };

    beforeEach(() => {
      adapter = new GitLabAdapter(platform);
    });

    it('should handle nested group paths correctly', () => {
      const platformData = adapter.getPlatform();
      expect(platformData.owner).toBe('group/subgroup');
      expect(platformData.fullName).toBe('group/subgroup/repo');
    });
  });
});

describe('Adapter Interface Compliance', () => {
  const githubPlatform: GitPlatform = {
    type: 'github',
    host: 'github.com',
    owner: 'owner',
    repo: 'repo',
    fullName: 'owner/repo',
    isGitHub: true,
    isGitLab: false,
    isSelfHosted: false
  };

  const gitlabPlatform: GitPlatform = {
    type: 'gitlab',
    host: 'gitlab.com',
    owner: 'owner',
    repo: 'repo',
    fullName: 'owner/repo',
    isGitHub: false,
    isGitLab: true,
    isSelfHosted: false
  };

  const adapters = [
    { name: 'GitHubAdapter', adapter: new GitHubAdapter(githubPlatform) },
    { name: 'GitLabAdapter', adapter: new GitLabAdapter(gitlabPlatform) }
  ];

  adapters.forEach(({ name, adapter }) => {
    describe(`${name} interface compliance`, () => {
      it('should have getPlatform() returning GitPlatform', () => {
        const platform = adapter.getPlatform();
        expect(platform).toBeDefined();
        expect(platform.type).toBeDefined();
        expect(platform.host).toBeDefined();
        expect(platform.owner).toBeDefined();
        expect(platform.repo).toBeDefined();
        expect(platform.fullName).toBeDefined();
      });

      it('should have getPlatformType() returning correct type', () => {
        const type = adapter.getPlatformType();
        expect(['github', 'gitlab']).toContain(type);
      });

      it('should have getCliName() returning correct CLI name', () => {
        const cliName = adapter.getCliName();
        expect(['gh', 'glab']).toContain(cliName);
      });

      it('should have checkCliInstalled() returning Promise<CliCheckResult>', () => {
        const result = adapter.checkCliInstalled();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have checkAuthentication() returning Promise<AuthCheckResult>', () => {
        const result = adapter.checkAuthentication();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have startAuth() returning Promise<AuthStartResult>', () => {
        const result = adapter.startAuth();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have getToken() returning Promise<string>', () => {
        const result = adapter.getToken();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have getUser() returning Promise<PlatformUser>', () => {
        const result = adapter.getUser();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have listRepos() accepting limit parameter', () => {
        const result = adapter.listRepos(10);
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have detectRepo() accepting project path', () => {
        const result = adapter.detectRepo('/fake/path');
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have getBranches() accepting repo name', () => {
        const result = adapter.getBranches('owner/repo');
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have createRepo() accepting options', () => {
        const result = adapter.createRepo({
          name: 'test-repo',
          description: 'Test',
          isPrivate: true,
          projectPath: '/fake/path'
        });
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have addGitRemote() accepting path and repo name', () => {
        const result = adapter.addGitRemote('/fake/path', 'owner/repo');
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have listOrganizations() returning Promise', () => {
        const result = adapter.listOrganizations();
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have getReleaseUrl() accepting path and tag', () => {
        const result = adapter.getReleaseUrl('/fake/path', 'v1.0.0');
        expect(result).toBeInstanceOf(Promise);
      });

      it('should have createRelease() accepting options', () => {
        const result = adapter.createRelease({
          projectPath: '/fake/path',
          version: '1.0.0',
          tagName: 'v1.0.0',
          title: 'v1.0.0',
          body: 'Release notes',
          draft: false,
          prerelease: false
        });
        expect(result).toBeInstanceOf(Promise);
      });
    });
  });
});
