import { spawn } from 'node:child_process';

const mode = process.argv[2];
const vitestArgs = process.argv.slice(3);

if (mode !== 'run' && mode !== 'watch') {
  console.error('Usage: node ./scripts/run-vitest-with-native-rebuild.mjs <run|watch> [vitest args...]');
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let activeChild = null;
let receivedSignal = null;

const signalToExitCode = (signal) => {
  if (signal === 'SIGINT') {
    return 130;
  }

  if (signal === 'SIGTERM') {
    return 143;
  }

  return 1;
};

const forwardSignal = (signal) => {
  receivedSignal ??= signal;

  if (activeChild && !activeChild.killed) {
    activeChild.kill(signal);
  }
};

process.on('SIGINT', () => {
  forwardSignal('SIGINT');
});

process.on('SIGTERM', () => {
  forwardSignal('SIGTERM');
});

const runNpmScript = (scriptName, args = []) =>
  new Promise((resolve) => {
    const commandArgs = ['run', scriptName];
    if (args.length > 0) {
      commandArgs.push('--', ...args);
    }

    const child = spawn(npmCommand, commandArgs, {
      stdio: 'inherit'
    });

    activeChild = child;

    child.once('error', (error) => {
      if (activeChild === child) {
        activeChild = null;
      }

      console.error(`Failed to start npm script "${scriptName}":`, error);
      resolve({ code: 1, signal: null });
    });

    child.once('exit', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }

      resolve({ code, signal });
    });
  });

const getExitCode = (result) => result.code ?? (result.signal ? signalToExitCode(result.signal) : 1);

const main = async () => {
  const rebuildForNodeResult = await runNpmScript('native:rebuild:node');
  const rebuildForNodeExitCode = getExitCode(rebuildForNodeResult);
  if (rebuildForNodeExitCode !== 0) {
    process.exitCode = rebuildForNodeExitCode;
    return;
  }

  const vitestScript = mode === 'run' ? 'test:core' : 'test:core:watch';
  const vitestResult = await runNpmScript(vitestScript, vitestArgs);
  const vitestExitCode = getExitCode(vitestResult);

  // Always attempt to restore Electron-compatible native addons after Vitest exits.
  const restoreForElectronResult = await runNpmScript('native:rebuild:electron');
  const restoreForElectronExitCode = getExitCode(restoreForElectronResult);

  if (vitestExitCode !== 0) {
    process.exitCode = vitestExitCode;
    return;
  }

  if (restoreForElectronExitCode !== 0) {
    process.exitCode = restoreForElectronExitCode;
    return;
  }

  if (receivedSignal) {
    process.exitCode = signalToExitCode(receivedSignal);
    return;
  }

  process.exitCode = 0;
};

main().catch((error) => {
  console.error('Failed to run test workflow with native rebuild guard:', error);
  process.exit(1);
});
