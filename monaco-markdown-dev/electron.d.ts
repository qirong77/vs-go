declare namespace monaco  {
  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): void;
    once(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void): void;
    send(channel: string, ...args: any[]): void;
  };
}
