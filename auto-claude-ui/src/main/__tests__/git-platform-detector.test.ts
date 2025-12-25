/**
 * Tests for git platform detection utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  detectGitPlatform,
  parseGitRemoteUrl,
  getPlatformDisplayName,
  getPlatformCliName,
  clearPlatformCache
} from '../git-platform-detector';

// Mock child_process
vi.mock('child_process');

describe('git-platform-detector', () => {
  beforeEach(() => {
    clearPlatformCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearPlatformCache();
  });

  describe('parseGitRemoteUrl', () => {
    describe('GitHub URLs', () => {
      it('should parse GitHub SSH URL', () => {
        const result = parseGitRemoteUrl('git@github.com:owner/repo.git');
        expect(result).toEqual({
          type: 'github',
          host: 'github.com',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: true,
          isGitLab: false,
          isSelfHosted: false
        });
      });

      it('should parse GitHub HTTPS URL', () => {
        const result = parseGitRemoteUrl('https://github.com/owner/repo.git');
        expect(result).toEqual({
          type: 'github',
          host: 'github.com',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: true,
          isGitLab: false,
          isSelfHosted: false
        });
      });

      it('should parse GitHub URL without .git extension', () => {
        const result = parseGitRemoteUrl('https://github.com/owner/repo');
        expect(result).toEqual({
          type: 'github',
          host: 'github.com',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: true,
          isGitLab: false,
          isSelfHosted: false
        });
      });
    });

    describe('GitLab URLs', () => {
      it('should parse GitLab.com SSH URL', () => {
        const result = parseGitRemoteUrl('git@gitlab.com:owner/repo.git');
        expect(result).toEqual({
          type: 'gitlab',
          host: 'gitlab.com',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: false,
          isGitLab: true,
          isSelfHosted: false
        });
      });

      it('should parse GitLab.com HTTPS URL', () => {
        const result = parseGitRemoteUrl('https://gitlab.com/owner/repo.git');
        expect(result).toEqual({
          type: 'gitlab',
          host: 'gitlab.com',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: false,
          isGitLab: true,
          isSelfHosted: false
        });
      });

      it('should parse self-hosted GitLab SSH URL', () => {
        const result = parseGitRemoteUrl('git@git.lazy-ants.de:owner/repo.git');
        expect(result).toEqual({
          type: 'gitlab',
          host: 'git.lazy-ants.de',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: false,
          isGitLab: true,
          isSelfHosted: true
        });
      });

      it('should parse self-hosted GitLab HTTPS URL', () => {
        const result = parseGitRemoteUrl('https://git.lazy-ants.de/owner/repo.git');
        expect(result).toEqual({
          type: 'gitlab',
          host: 'git.lazy-ants.de',
          owner: 'owner',
          repo: 'repo',
          fullName: 'owner/repo',
          isGitHub: false,
          isGitLab: true,
          isSelfHosted: true
        });
      });

      it('should parse GitLab URL with nested groups', () => {
        const result = parseGitRemoteUrl('git@gitlab.com:group/subgroup/repo.git');
        expect(result).toEqual({
          type: 'gitlab',
          host: 'gitlab.com',
          owner: 'group/subgroup',
          repo: 'repo',
          fullName: 'group/subgroup/repo',
          isGitHub: false,
          isGitLab: true,
          isSelfHosted: false
        });
      });
    });

    describe('Invalid URLs', () => {
      it('should return null for invalid URL', () => {
        expect(parseGitRemoteUrl('invalid-url')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(parseGitRemoteUrl('')).toBeNull();
      });

      it('should return null for non-GitHub/GitLab URL', () => {
        expect(parseGitRemoteUrl('https://bitbucket.org/owner/repo.git')).toBeNull();
      });
    });
  });

  describe('detectGitPlatform', () => {
    it('should detect GitHub from git remote', () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from('git@github.com:owner/repo.git\n'));

      const result = detectGitPlatform('/fake/path');

      expect(execSync).toHaveBeenCalledWith(
        'git config --get remote.origin.url',
        expect.objectContaining({ cwd: '/fake/path' })
      );
      expect(result).toEqual({
        type: 'github',
        host: 'github.com',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: true,
        isGitLab: false,
        isSelfHosted: false
      });
    });

    it('should detect self-hosted GitLab from git remote', () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from('git@git.lazy-ants.de:owner/repo.git\n'));

      const result = detectGitPlatform('/fake/path');

      expect(result).toEqual({
        type: 'gitlab',
        host: 'git.lazy-ants.de',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: false,
        isGitLab: true,
        isSelfHosted: true
      });
    });

    it('should return null when git command fails', () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('Not a git repository');
      });

      const result = detectGitPlatform('/fake/path');

      expect(result).toBeNull();
    });

    it('should return null when remote URL is empty', () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from('\n'));

      const result = detectGitPlatform('/fake/path');

      expect(result).toBeNull();
    });

    it('should cache platform detection results', () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from('git@github.com:owner/repo.git\n'));

      // First call
      const result1 = detectGitPlatform('/fake/path');

      // Second call (should use cache, not call execSync again)
      const result2 = detectGitPlatform('/fake/path');

      expect(execSync).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('should not cache results for different paths', () => {
      vi.mocked(execSync)
        .mockReturnValueOnce(Buffer.from('git@github.com:owner1/repo1.git\n'))
        .mockReturnValueOnce(Buffer.from('git@gitlab.com:owner2/repo2.git\n'));

      const result1 = detectGitPlatform('/path1');
      const result2 = detectGitPlatform('/path2');

      expect(execSync).toHaveBeenCalledTimes(2);
      expect(result1?.type).toBe('github');
      expect(result2?.type).toBe('gitlab');
    });
  });

  describe('getPlatformDisplayName', () => {
    it('should return "GitHub" for github type', () => {
      expect(getPlatformDisplayName('github')).toBe('GitHub');
    });

    it('should return "GitLab" for gitlab type', () => {
      expect(getPlatformDisplayName('gitlab')).toBe('GitLab');
    });

    it('should work with GitPlatform object', () => {
      const platform = {
        type: 'github' as const,
        host: 'github.com',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: true,
        isGitLab: false,
        isSelfHosted: false
      };

      expect(getPlatformDisplayName(platform)).toBe('GitHub');
    });
  });

  describe('getPlatformCliName', () => {
    it('should return "gh" for github type', () => {
      expect(getPlatformCliName('github')).toBe('gh');
    });

    it('should return "glab" for gitlab type', () => {
      expect(getPlatformCliName('gitlab')).toBe('glab');
    });

    it('should work with GitPlatform object', () => {
      const platform = {
        type: 'gitlab' as const,
        host: 'gitlab.com',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        isGitHub: false,
        isGitLab: true,
        isSelfHosted: false
      };

      expect(getPlatformCliName(platform)).toBe('glab');
    });
  });

  describe('clearPlatformCache', () => {
    it('should clear the cache', () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from('git@github.com:owner/repo.git\n'));

      // First call - cache result
      detectGitPlatform('/fake/path');
      expect(execSync).toHaveBeenCalledTimes(1);

      // Clear cache
      clearPlatformCache();

      // Call again - should execute git command again
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from('git@github.com:owner/repo.git\n'));
      detectGitPlatform('/fake/path');

      expect(execSync).toHaveBeenCalledTimes(2);
    });
  });
});
