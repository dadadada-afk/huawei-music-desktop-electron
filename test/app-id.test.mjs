import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_USER_MODEL_ID, APP_USER_MODEL_ID_DEV } from '../src/shared/app-id.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the AppUserModelID equals the appId electron-builder stamps on shortcuts', () => {
  assert.equal(APP_USER_MODEL_ID, pkg.build.appId);
});

test('development runs under their own AppUserModelID', () => {
  assert.notEqual(APP_USER_MODEL_ID_DEV, APP_USER_MODEL_ID);
  assert.ok(APP_USER_MODEL_ID_DEV.startsWith(`${APP_USER_MODEL_ID}.`),
    'the dev id must sit under the packaged id so the shell can never confuse the two');
});
