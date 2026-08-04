import { describe, expect, it } from 'vitest';
import manifest from '../../manifest.json';
import { UACCESS_HOSTS } from '@shared/constants';

/**
 * Guards the extension's blast radius. A stray `<all_urls>`, or a scheme
 * wildcard paired with a host wildcard, would run our content script on every
 * site the user visits.
 */
describe('manifest scope', () => {
  const contentScript = manifest.content_scripts[0]!;

  it('declares exactly one content script', () => {
    expect(manifest.content_scripts).toHaveLength(1);
  });

  it('only matches UAccess hosts', () => {
    for (const pattern of contentScript.matches) {
      const host = new URL(pattern.replace(/\*$/, '')).hostname;
      expect(UACCESS_HOSTS).toContain(host);
    }
  });

  it('covers every known UAccess host', () => {
    const hosts = contentScript.matches.map((p) => new URL(p.replace(/\*$/, '')).hostname);
    expect(hosts.sort()).toEqual([...UACCESS_HOSTS].sort());
  });

  it('never uses a wildcard or all-urls match', () => {
    for (const pattern of [...contentScript.matches, ...manifest.host_permissions]) {
      expect(pattern).not.toBe('<all_urls>');
      expect(pattern).not.toMatch(/^\*:/);
      expect(pattern).not.toMatch(/\/\/\*\//);
    }
  });

  it('is https-only', () => {
    for (const pattern of [...contentScript.matches, ...manifest.host_permissions]) {
      expect(pattern.startsWith('https://')).toBe(true);
    }
  });

  it('runs in subframes, since PeopleSoft renders into an iframe', () => {
    expect(contentScript.all_frames).toBe(true);
  });

  it('requests only the permissions it uses', () => {
    expect(manifest.permissions).toEqual(['storage']);
  });

  it('grants host access to RateMyProfessors for the service worker fetch', () => {
    expect(manifest.host_permissions).toContain('https://www.ratemyprofessors.com/*');
  });
});
