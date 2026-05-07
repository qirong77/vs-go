import type { DataNode } from "antd/es/tree";
import type { BrowserItem } from "../../../common/type";

export function bookmarkUrlsMatch(a: string, b: string): boolean {
  const x = (a || "").trim();
  const y = (b || "").trim();
  if (!x || !y) return false;
  try {
    return new URL(x).href === new URL(y).href;
  } catch {
    return x === y;
  }
}

export function orderedRootBarItems(all: BrowserItem[]): BrowserItem[] {
  return all.filter(
    (i) =>
      (i.parentId ?? null) === null && (i.type === "bookmark" || i.type === "folder")
  );
}

export function orderedChildrenOf(all: BrowserItem[], parentId: string): BrowserItem[] {
  return all.filter((i) => (i.parentId ?? null) === parentId);
}

/** candidateId 是否在 rootFolderId 文件夹子树中（含与 root 同 id） */
export function isNodeInsideFolderSubtree(
  all: BrowserItem[],
  candidateId: string,
  rootFolderId: string
): boolean {
  let cur: string | null = candidateId;
  const byId = new Map(all.map((b) => [b.id, b]));
  for (let g = 0; g < 500; g++) {
    if (cur === rootFolderId) return true;
    const n = cur ? byId.get(cur) : undefined;
    if (!n) return false;
    cur = n.parentId ?? null;
    if (cur === null) return false;
  }
  return false;
}

export function flattenFolderChildrenPreorder(
  all: BrowserItem[],
  folderId: string,
  depth: number
): Array<{ item: BrowserItem; depth: number }> {
  const out: Array<{ item: BrowserItem; depth: number }> = [];
  for (const ch of orderedChildrenOf(all, folderId)) {
    if (ch.type !== "bookmark" && ch.type !== "folder") continue;
    out.push({ item: ch, depth });
    if (ch.type === "folder") {
      out.push(...flattenFolderChildrenPreorder(all, ch.id, depth + 1));
    }
  }
  return out;
}

export function moveParentTargets(
  all: BrowserItem[],
  item: BrowserItem
): Array<{ id: string | null; name: string }> {
  const out: Array<{ id: string | null; name: string }> = [{ id: null, name: "书签栏" }];
  for (const f of all) {
    if (f.type !== "folder") continue;
    if (item.type === "folder") {
      if (f.id === item.id) continue;
      if (isNodeInsideFolderSubtree(all, f.id, item.id)) continue;
    }
    out.push({ id: f.id, name: f.name });
  }
  return out;
}

/** 构建设置页左侧 Tree 数据（按 store 顺序） */
export function browserItemsToAntdTreeData(items: BrowserItem[]): DataNode[] {
  const childrenMap = new Map<string | null, BrowserItem[]>();
  for (const i of items) {
    const p = i.parentId ?? null;
    if (!childrenMap.has(p)) childrenMap.set(p, []);
    childrenMap.get(p)!.push(i);
  }
  const orderIndex = new Map(items.map((it, idx) => [it.id, idx]));
  const sortKids = (a: BrowserItem, b: BrowserItem) =>
    (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);

  function build(parentId: string | null): DataNode[] {
    const kids = (childrenMap.get(parentId) ?? []).sort(sortKids);
    return kids.map((it) => {
      if (it.type === "folder") {
        return {
          key: it.id,
          title: it.name,
          icon: undefined,
          children: build(it.id),
        };
      }
      return {
        key: it.id,
        title: it.name,
        isLeaf: true,
      };
    });
  }
  return build(null);
}
