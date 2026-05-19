import Store from "electron-store";
import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const schema = {
  browserList: {
    type: "array",
    default: [],
    items: {
      type: "object",
      additionalProperties: true,
    },
  },
  fileAccessHistory: {
    type: "object",
    default: {},
    additionalProperties: { type: "number" },
  },
  browserHistory: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        title: { type: "string" },
        visitTime: { type: "number" },
      },
    },
  },
  savedCookies: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        domain: { type: "string" },
        name: { type: "string" },
        value: { type: "string" },
        path: { type: "string" },
        secure: { type: "boolean" },
        httpOnly: { type: "boolean" },
        expirationDate: { type: "number" },
        sameSite: { type: "string" },
        saveTime: { type: "number" },
        saveTimeDisplay: { type: "string" },
      },
    },
  },
  savedCookiesByUrl: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        cookieString: { type: "string" },
        saveTime: { type: "number" },
        saveTimeDisplay: { type: "string" },
      },
    },
  },
  savedNotes: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        domain: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        createTime: { type: "number" },
        updateTime: { type: "number" },
        createTimeDisplay: { type: "string" },
        updateTimeDisplay: { type: "string" },
      },
    },
  },
  singleNote: {
    type: "object",
    default: {
      title: "",
      content: "",
      updateTime: 0,
      updateTimeDisplay: "",
    },
    properties: {
      title: { type: "string" },
      content: { type: "string" },
      updateTime: { type: "number" },
      updateTimeDisplay: { type: "string" },
    },
  },
  monacoNotes: {
    type: "object",
    default: {},
    additionalProperties: { type: "string" },
  },
  userNoteContent: {
    type: "string",
    default: "",
  },
  userNotesTree: {
    type: "array",
    default: [],
  },
  userNotesFiles: {
    type: "object",
    default: {},
    additionalProperties: { type: "string" },
  },
  userNotesCurrentFile: {
    type: "string",
    default: "",
  },
  userNotesFileHistory: {
    type: "object",
    default: {},
    additionalProperties: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          savedAt: { type: "number" },
          content: { type: "string" },
        },
      },
    },
  },
  appSettings: {
    type: "object",
    default: { defaultEditor: "vscode" },
    properties: {
      defaultEditor: { type: "string" },
    },
  },
  floatingWindowUserScript: {
    type: "string",
    default: "",
  },
} as const;

function migrateConfigBeforeLoad(): void {
  try {
    const userDataPath = app.getPath("userData");
    const configPath = path.join(userDataPath, "config.json");

    if (!existsSync(configPath)) return;

    const configData = JSON.parse(readFileSync(configPath, "utf-8"));
    let needsSave = false;

    if (configData.userNotesTree !== undefined && !Array.isArray(configData.userNotesTree)) {
      configData.userNotesTree = [];
      needsSave = true;
    }

    if (needsSave) {
      writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
    }
  } catch (error) {
    console.error("Failed to migrate config:", error);
  }
}

migrateConfigBeforeLoad();

export const vsgoStore = new Store({ schema });
