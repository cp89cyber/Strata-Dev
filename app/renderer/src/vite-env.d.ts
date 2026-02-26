/// <reference types="vite/client" />

import type { StrataApi } from '../../preload/index';

declare global {
  interface Window {
    strata: StrataApi;
  }
}

export {};
