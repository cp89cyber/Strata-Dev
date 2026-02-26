import { describe, expect, it, vi } from 'vitest';

import { applyGpuRuntimePolicy, shouldDisableGpuAcceleration } from '@main/services/gpuRuntimePolicy';

describe('gpuRuntimePolicy', () => {
  it('disables GPU by default on Linux', () => {
    expect(shouldDisableGpuAcceleration('linux', {})).toBe(true);
  });

  it('does not disable GPU by default on macOS or Windows', () => {
    expect(shouldDisableGpuAcceleration('darwin', {})).toBe(false);
    expect(shouldDisableGpuAcceleration('win32', {})).toBe(false);
  });

  it('disables GPU when STRATA_DISABLE_GPU is set', () => {
    expect(shouldDisableGpuAcceleration('darwin', { STRATA_DISABLE_GPU: '1' })).toBe(true);
    expect(shouldDisableGpuAcceleration('win32', { STRATA_DISABLE_GPU: 'true' })).toBe(true);
  });

  it('does not disable GPU when STRATA_ENABLE_GPU is set', () => {
    expect(shouldDisableGpuAcceleration('linux', { STRATA_ENABLE_GPU: '1' })).toBe(false);
    expect(shouldDisableGpuAcceleration('linux', { STRATA_ENABLE_GPU: 'TRUE' })).toBe(false);
  });

  it('prefers STRATA_ENABLE_GPU when both env vars are set', () => {
    expect(
      shouldDisableGpuAcceleration('linux', {
        STRATA_ENABLE_GPU: 'true',
        STRATA_DISABLE_GPU: 'true'
      })
    ).toBe(false);
  });

  it('applies Chromium GPU-disable switches only when policy disables acceleration', () => {
    const disableHardwareAcceleration = vi.fn();
    const appendSwitch = vi.fn();

    applyGpuRuntimePolicy(
      {
        disableHardwareAcceleration,
        commandLine: { appendSwitch }
      },
      'linux',
      {}
    );

    expect(disableHardwareAcceleration).toHaveBeenCalledTimes(1);
    expect(appendSwitch).toHaveBeenCalledWith('disable-gpu');

    disableHardwareAcceleration.mockReset();
    appendSwitch.mockReset();

    applyGpuRuntimePolicy(
      {
        disableHardwareAcceleration,
        commandLine: { appendSwitch }
      },
      'linux',
      { STRATA_ENABLE_GPU: '1' }
    );

    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(appendSwitch).not.toHaveBeenCalled();
  });
});
