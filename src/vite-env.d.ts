/// <reference types="vite/client" />
import type { XrplDesktopApi } from './shared/types';

declare global {
  interface Window {
    xrplApi?: XrplDesktopApi;
  }
}
