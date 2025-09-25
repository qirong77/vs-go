import Store from "electron-store";

// Define or import BrowserItem type
export type BrowserItem = {
  // Add appropriate fields here, for example:
  id: string;
  name: string;
  url: string;
  lastVisit?: number;
  type: "bookmark" | "history";
};
const schema = {
  browserList: {
    type: "array",
    default: [],
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        url: { type: "string" },
      },
    },
  },
};
const store = new Store({ schema });
export const vsgoStore = store;
