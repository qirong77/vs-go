import { ipcMain, session } from "electron";
import { VS_GO_EVENT } from "../../../common/EVENT";
import type { SavedCookieByUrl } from "../../../common/type";
import { generateId, formatError } from "../../../common/utils";
import { cookieStore, cookieByUrlStore } from "../store";

type SameSitePolicy = "unspecified" | "no_restriction" | "lax" | "strict";

interface CookieDetails {
  url: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite: SameSitePolicy;
}

function parseCookieString(cookieString: string, targetUrl: string): CookieDetails[] {
  const entries = cookieString.split("; ");
  const result: CookieDetails[] = [];

  for (const entry of entries) {
    if (!entry.includes("=")) continue;

    const [nameValue, ...attributes] = entry.split(";");
    const eqIndex = nameValue.indexOf("=");
    if (eqIndex === -1) continue;

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();
    if (!name) continue;

    const details: CookieDetails = {
      url: targetUrl,
      name,
      value,
      domain: new URL(targetUrl).hostname,
      path: "/",
      secure: false,
      httpOnly: false,
      sameSite: "unspecified" as SameSitePolicy,
    };

    for (const attr of attributes) {
      const trimmed = attr.trim().toLowerCase();
      if (trimmed.startsWith("domain=")) {
        details.domain = attr.trim().substring(7);
      } else if (trimmed.startsWith("path=")) {
        details.path = attr.trim().substring(5);
      } else if (trimmed === "secure") {
        details.secure = true;
      } else if (trimmed === "httponly") {
        details.httpOnly = true;
      } else if (trimmed.startsWith("expires=")) {
        const expiryDate = new Date(attr.trim().substring(8));
        if (!isNaN(expiryDate.getTime())) {
          details.expirationDate = expiryDate.getTime() / 1000;
        }
      } else if (trimmed.startsWith("samesite=")) {
        const sameSiteValue = trimmed.substring(9) as SameSitePolicy;
        const validValues: SameSitePolicy[] = ["unspecified", "no_restriction", "lax", "strict"];
        if (validValues.includes(sameSiteValue)) {
          details.sameSite = sameSiteValue;
        }
      }
    }

    result.push(details);
  }

  return result;
}

export function registerCookieHandlers(): void {
  ipcMain.handle(VS_GO_EVENT.COOKIE_GET_CURRENT, async (_event, url: string) => {
    try {
      return await session.defaultSession.cookies.get({ url });
    } catch (error) {
      console.error("获取当前页面 Cookie 失败:", error);
      return [];
    }
  });

  ipcMain.handle(VS_GO_EVENT.COOKIE_SAVE, async (_event, cookieData) => {
    try {
      const now = new Date();
      const savedCookie = {
        ...cookieData,
        id: generateId(),
        saveTime: now.getTime(),
        saveTimeDisplay: now.toLocaleString("zh-CN"),
      };
      cookieStore.saveCookie(savedCookie);
      return { success: true, cookie: savedCookie };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(VS_GO_EVENT.COOKIE_GET_SAVED_LIST, async () => {
    try {
      return cookieStore.getSavedCookies();
    } catch (error) {
      console.error("获取已保存 Cookie 列表失败:", error);
      return [];
    }
  });

  ipcMain.handle(VS_GO_EVENT.COOKIE_DELETE, async (_event, cookieId: string) => {
    try {
      cookieStore.deleteCookie(cookieId);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(VS_GO_EVENT.COOKIE_APPLY, async (_event, cookie, targetUrl: string) => {
    try {
      await session.defaultSession.cookies.set({
        url: targetUrl,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        expirationDate: cookie.expirationDate,
        sameSite: cookie.sameSite || "unspecified",
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  // --- 基于 URL 的 Cookie 操作 ---

  ipcMain.handle(VS_GO_EVENT.COOKIE_SAVE_BY_URL, async (_event, url: string) => {
    try {
      const cookies = await session.defaultSession.cookies.get({ url });
      if (cookies.length === 0) {
        return { success: false, error: "当前页面没有 Cookie 可保存" };
      }

      const cookieString = cookies
        .map((cookie) => {
          let str = `${cookie.name}=${cookie.value}`;
          if (cookie.domain) str += `; Domain=${cookie.domain}`;
          if (cookie.path) str += `; Path=${cookie.path}`;
          if (cookie.secure) str += `; Secure`;
          if (cookie.httpOnly) str += `; HttpOnly`;
          if (cookie.expirationDate) {
            str += `; Expires=${new Date(cookie.expirationDate * 1000).toUTCString()}`;
          }
          if (cookie.sameSite) str += `; SameSite=${cookie.sameSite}`;
          return str;
        })
        .join("; ");

      const now = new Date();
      const savedCookie: SavedCookieByUrl = {
        id: generateId(),
        url,
        domain: new URL(url).hostname,
        cookieString,
        saveTime: now.getTime(),
        saveTimeDisplay: now.toLocaleString("zh-CN"),
      };

      cookieByUrlStore.save(savedCookie);
      return { success: true, cookie: savedCookie };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(VS_GO_EVENT.COOKIE_GET_SAVED_LIST_BY_URL, async () => {
    try {
      return cookieByUrlStore.getAll();
    } catch (error) {
      console.error("获取已保存 Cookie 列表失败:", error);
      return [];
    }
  });

  ipcMain.handle(VS_GO_EVENT.COOKIE_DELETE_BY_URL, async (_event, cookieId: string) => {
    try {
      cookieByUrlStore.delete(cookieId);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  });

  ipcMain.handle(
    VS_GO_EVENT.COOKIE_APPLY_BY_URL,
    async (_event, cookieData: SavedCookieByUrl, targetUrl: string) => {
      try {
        const cookiesToSet = parseCookieString(cookieData.cookieString, targetUrl);

        for (const details of cookiesToSet) {
          await session.defaultSession.cookies.set(details);
        }

        return { success: true, count: cookiesToSet.length };
      } catch (error) {
        return { success: false, error: formatError(error) };
      }
    }
  );
}
