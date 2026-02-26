import { describe, expect, it } from 'vitest';

import { formatNativeModuleRecoveryMessage, parseNativeModuleAbiMismatch } from '@main/services/nativeModuleDiagnostics';

describe('nativeModuleDiagnostics', () => {
  it('parses native module ABI mismatch details', () => {
    const error = new Error(
      [
        "The module '/home/culpen0/Strata-Dev/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
        'was compiled against a different Node.js version using',
        'NODE_MODULE_VERSION 137. This version of Node.js requires',
        'NODE_MODULE_VERSION 130. Please try re-compiling or re-installing',
        'the module (for instance, using `npm rebuild` or `npm install`).'
      ].join('\n')
    );

    expect(parseNativeModuleAbiMismatch(error)).toEqual({
      modulePath: '/home/culpen0/Strata-Dev/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      compiledNodeModuleVersion: 137,
      requiredNodeModuleVersion: 130
    });
  });

  it('returns null when the error is not an ABI mismatch', () => {
    expect(parseNativeModuleAbiMismatch(new Error('Something else failed'))).toBeNull();
  });

  it('formats recovery steps with the Electron rebuild command', () => {
    const message = formatNativeModuleRecoveryMessage({
      modulePath: '/tmp/native-addon.node',
      compiledNodeModuleVersion: 137,
      requiredNodeModuleVersion: 130
    });

    expect(message).toContain('npm run native:rebuild:electron');
    expect(message).toContain('npm run test and npm run test:watch automatically restore Electron-native modules');
  });
});
