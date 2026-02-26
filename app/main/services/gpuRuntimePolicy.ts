export interface GpuRuntimePolicyEnv {
  [key: string]: string | undefined;
  STRATA_ENABLE_GPU?: string;
  STRATA_DISABLE_GPU?: string;
}

export interface GpuRuntimePolicyApp {
  disableHardwareAcceleration: () => void;
  commandLine: {
    appendSwitch: (switchName: string) => void;
  };
}

const isTruthyEnvFlag = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

export const shouldDisableGpuAcceleration = (
  platform: NodeJS.Platform,
  env: GpuRuntimePolicyEnv
): boolean => {
  if (isTruthyEnvFlag(env.STRATA_ENABLE_GPU)) {
    return false;
  }

  if (isTruthyEnvFlag(env.STRATA_DISABLE_GPU)) {
    return true;
  }

  return platform === 'linux';
};

export const applyGpuRuntimePolicy = (
  electronApp: GpuRuntimePolicyApp,
  platform: NodeJS.Platform,
  env: GpuRuntimePolicyEnv
): void => {
  if (!shouldDisableGpuAcceleration(platform, env)) {
    return;
  }

  electronApp.disableHardwareAcceleration();
  electronApp.commandLine.appendSwitch('disable-gpu');
};
