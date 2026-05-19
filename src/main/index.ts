import { app } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import "../app";

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.electron");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
