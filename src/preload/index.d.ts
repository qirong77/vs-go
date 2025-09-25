import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      navigation: {
        toggleNavigationBar: () => void;
        goBack: () => void;
        goForward: () => void;
        refresh: () => void;
        navigateTo: (url: string) => void;
        getCurrentUrl: () => string;
      };
    };
  }
}
