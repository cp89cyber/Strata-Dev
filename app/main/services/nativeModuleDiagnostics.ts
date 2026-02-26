export interface NativeModuleAbiMismatchInfo {
  modulePath: string;
  compiledNodeModuleVersion: number;
  requiredNodeModuleVersion: number;
}

const ABI_MISMATCH_REGEX =
  /The module ['"](?<modulePath>[^'"]+\.node)['"][\s\S]*?compiled against a different Node\.js version using[\s\S]*?NODE_MODULE_VERSION (?<compiled>\d+)[\s\S]*?This version of Node\.js requires[\s\S]*?NODE_MODULE_VERSION (?<required>\d+)/m;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return '';
};

export const parseNativeModuleAbiMismatch = (error: unknown): NativeModuleAbiMismatchInfo | null => {
  const message = getErrorMessage(error);
  if (!message) {
    return null;
  }

  const match = ABI_MISMATCH_REGEX.exec(message);
  if (!match?.groups) {
    return null;
  }

  const compiledNodeModuleVersion = Number.parseInt(match.groups.compiled, 10);
  const requiredNodeModuleVersion = Number.parseInt(match.groups.required, 10);

  if (Number.isNaN(compiledNodeModuleVersion) || Number.isNaN(requiredNodeModuleVersion)) {
    return null;
  }

  return {
    modulePath: match.groups.modulePath,
    compiledNodeModuleVersion,
    requiredNodeModuleVersion
  };
};

export const formatNativeModuleRecoveryMessage = (info: NativeModuleAbiMismatchInfo): string =>
  [
    `Failed to load native module: ${info.modulePath}`,
    `The module was built for NODE_MODULE_VERSION ${info.compiledNodeModuleVersion}, but this runtime requires NODE_MODULE_VERSION ${info.requiredNodeModuleVersion}.`,
    'Run this command from the project root and launch again:',
    'npm run native:rebuild:electron',
    'Note: npm run test rebuilds better-sqlite3 for your system Node runtime, so launching Electron afterward requires the Electron rebuild step again.'
  ].join('\n\n');
