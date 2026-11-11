const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TV index.html contains Netflix-style profiles screen and pNext in player timeline', () => {
  const tvHtml = fs.readFileSync(path.join(__dirname, '../public/tv/index.html'), 'utf8');
  assert.ok(tvHtml.includes('id="screen-profiles"'), 'Must have screen-profiles section');
  assert.ok(tvHtml.includes('Qui est-ce ?'), 'Must display "Qui est-ce ?"');
  assert.ok(tvHtml.includes('id="profilesGrid"'), 'Must have profilesGrid');
  assert.ok(tvHtml.includes('id="btnManageProfiles"'), 'Must have btnManageProfiles');
  assert.ok(tvHtml.includes('profiles.js'), 'Must load profiles.js');

  // pNext button inside p-timeline right next to pPlay
  const timelineStart = tvHtml.indexOf('class="p-timeline"');
  assert.ok(timelineStart > 0, 'Must have p-timeline');
  const timelineSnippet = tvHtml.slice(timelineStart, timelineStart + 400);
  assert.ok(timelineSnippet.includes('id="pPlay"'), 'pPlay in timeline');
  assert.ok(timelineSnippet.includes('id="pNext"'), 'pNext must be in timeline next to pPlay');
});

test('Web index.html also contains profiles screen and pNext in player-transport', () => {
  const webHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.ok(webHtml.includes('id="screen-profiles"'));
  assert.ok(webHtml.includes('id="pNext"'));
  assert.ok(webHtml.includes('profiles.js'));
});

test('profiles.js provides household default profiles and custom SVG avatars', () => {
  // Test profiles.js script execution
  const profilesSource = fs.readFileSync(path.join(__dirname, '../public/profiles.js'), 'utf8');
  const windowObj = {};
  const mockStorage = new Map();
  const localStorage = {
    getItem: k => mockStorage.get(k) || null,
    setItem: (k, v) => mockStorage.set(k, String(v))
  };
  const fn = new Function('window', 'localStorage', profilesSource);
  fn(windowObj, localStorage);

  assert.ok(windowObj.PlezyProfiles, 'window.PlezyProfiles must be exported');
  const defaults = windowObj.PlezyProfiles.DEFAULT_PROFILES;
  assert.equal(defaults.length, 0, 'Default profiles start clean/empty for custom user profiles');
  assert.deepEqual(windowObj.PlezyProfiles.getProfiles(), []);

  // SVGs exist for each avatar choice
  assert.ok(windowObj.PlezyProfiles.getAvatarSvg('lounis').includes('ringGlow'));
  assert.ok(windowObj.PlezyProfiles.getAvatarSvg('djey').includes('<svg'));
  assert.ok(windowObj.PlezyProfiles.getAvatarSvg('karine').includes('<svg'));
  assert.ok(windowObj.PlezyProfiles.getAvatarSvg('timeo').includes('<svg'));
});

test('TV navigation handles screen-detail and screen-player navigation correctly', () => {
  const navSource = fs.readFileSync(path.join(__dirname, '../public/tv/navigation.js'), 'utf8');
  assert.ok(navSource.includes('screen-profiles'), 'Handles screen-profiles spatial nav');
  assert.ok(navSource.includes('screen-detail'), 'Handles screen-detail spatial nav');
  assert.ok(navSource.includes('screen-player'), 'Handles screen-player spatial nav');
  assert.ok(navSource.includes('pNext'), 'Handles pNext in player nav');
});
