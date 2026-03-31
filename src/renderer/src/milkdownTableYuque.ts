import type { Ctx } from "@milkdown/ctx";
import { commandsCtx } from "@milkdown/core";
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorState, Transaction } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import {
  CellSelection,
  addColumn,
  addRow,
  deleteTable,
  findTable,
  isInTable,
  selectedRect,
  TableMap,
} from "@milkdown/prose/tables";

type TableInfo = NonNullable<ReturnType<typeof findTable>>;

function fullTableRect(table: TableInfo, map: TableMap) {
  return {
    left: 0,
    top: 0,
    right: map.width,
    bottom: map.height,
    tableStart: table.start,
    map,
    table: table.node,
  };
}

/** 语雀风格：浮动工具栏、行列选择条、列间/底部插入；列宽拖拽需配合 columnResizingPlugin */
class TableYuqueView {
  private root: HTMLDivElement;
  private toolbar: HTMLDivElement;
  private leftGutterHost: HTMLDivElement;
  private topGutterHost: HTMLDivElement;
  private bottomBar: HTMLButtonElement;
  private colInsertLayer: HTMLDivElement;
  private raf = 0;
  private scrollParents: HTMLElement[] = [];

  constructor(
    private view: EditorView,
    private ctx: Ctx
  ) {
    this.root = document.createElement("div");
    this.root.className = "table-yuque-overlay";

    this.toolbar = document.createElement("div");
    this.toolbar.className = "table-yuque-toolbar";

    this.leftGutterHost = document.createElement("div");
    this.leftGutterHost.className = "table-yuque-gutter-host table-yuque-gutter-host--rows";

    this.topGutterHost = document.createElement("div");
    this.topGutterHost.className = "table-yuque-gutter-host table-yuque-gutter-host--cols";

    this.bottomBar = document.createElement("button");
    this.bottomBar.type = "button";
    this.bottomBar.className = "table-yuque-insert table-yuque-insert--row";
    this.bottomBar.title = "在表格末尾插入一行";
    this.bottomBar.innerHTML = "<span class=\"table-yuque-insert-icon\">+</span>";

    this.colInsertLayer = document.createElement("div");
    this.colInsertLayer.className = "table-yuque-insert-layer";

    this.root.append(
      this.toolbar,
      this.leftGutterHost,
      this.topGutterHost,
      this.colInsertLayer,
      // this.bottomBar
    );

    const parent = view.dom.closest(".note-editor-content") ?? view.dom.parentElement ?? document.body;
    parent.appendChild(this.root);

    this.bindToolbar();
    this.bindGutters();
    this.bindInsertZones();
    this.bindScrollResize();
    this.scheduleSync();
  }

  private bindScrollResize() {
    const onScrollOrResize = () => this.scheduleSync();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    let el: HTMLElement | null = this.view.dom.parentElement;
    while (el) {
      el.addEventListener("scroll", onScrollOrResize, { passive: true });
      this.scrollParents.push(el);
      el = el.parentElement;
    }
    this._cleanupScroll = () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      for (const p of this.scrollParents) p.removeEventListener("scroll", onScrollOrResize);
    };
  }

  private _cleanupScroll?: () => void;

  private scheduleSync() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.sync());
  }

  private exec(run: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) {
    const commands = this.ctx.get(commandsCtx);
    this.view.focus();
    commands.inline(run);
  }

  private bindToolbar() {
    this.toolbar.addEventListener("mousedown", (e) => e.preventDefault());
    this.toolbar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-yuque-action]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = btn.dataset.yuqueAction;
      if (!action) return;

      if (action === "fit") {
        const table = findTable(this.view.state.selection.$from);
        if (!table) return;
        const dom = this.view.nodeDOM(table.pos) as HTMLElement | null;
        if (!dom) return;
        const wrap = dom.classList.contains("tableWrapper")
          ? dom
          : (dom.closest(".tableWrapper") as HTMLElement) ?? dom;
        const on = wrap.getAttribute("data-yuque-fit") === "1";
        if (on) wrap.removeAttribute("data-yuque-fit");
        else wrap.setAttribute("data-yuque-fit", "1");
        return;
      }

      if (action === "deleteTable") {
        this.exec(deleteTable);
        return;
      }

      if (action === "addRowEnd") {
        this.exec((state, dispatch) => {
          const table = findTable(state.selection.$from);
          if (!table || !dispatch) return false;
          const map = TableMap.get(table.node);
          const rect = fullTableRect(table, map);
          dispatch(addRow(state.tr, rect, map.height));
          return true;
        });
        return;
      }

      if (action === "addColEnd") {
        this.exec((state, dispatch) => {
          const table = findTable(state.selection.$from);
          if (!table || !dispatch) return false;
          const map = TableMap.get(table.node);
          const rect = fullTableRect(table, map);
          dispatch(addColumn(state.tr, rect, map.width));
          return true;
        });
        return;
      }

      if (action === "deleteSelection") {
        this.ctx.get(commandsCtx).call("DeleteSelectedCells");
      }
    });
  }

  private bindGutters() {
    this.leftGutterHost.addEventListener("mousedown", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-row-index]");
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(t.dataset.rowIndex);
      if (Number.isNaN(idx)) return;
      this.view.focus();
      this.ctx.get(commandsCtx).call("SelectRow", { index: idx });
    });

    this.topGutterHost.addEventListener("mousedown", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-col-index]");
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(t.dataset.colIndex);
      if (Number.isNaN(idx)) return;
      this.view.focus();
      this.ctx.get(commandsCtx).call("SelectCol", { index: idx });
    });
  }

  private bindInsertZones() {
    this.bottomBar.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.exec((state, dispatch) => {
        const table = findTable(state.selection.$from);
        if (!table || !dispatch) return false;
        const map = TableMap.get(table.node);
        const rect = fullTableRect(table, map);
        dispatch(addRow(state.tr, rect, map.height));
        return true;
      });
    });

    this.colInsertLayer.addEventListener("mousedown", (e) => {
      const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-insert-col-after]");
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      const after = Number(hit.dataset.insertColAfter);
      if (Number.isNaN(after)) return;
      this.exec((state, dispatch) => {
        const table = findTable(state.selection.$from);
        if (!table || !dispatch) return false;
        const map = TableMap.get(table.node);
        const rect = fullTableRect(table, map);
        dispatch(addColumn(state.tr, rect, after + 1));
        return true;
      });
    });
  }

  private sync() {
    const { state } = this.view;
    if (!isInTable(state)) {
      this.hide();
      return;
    }
    const table = findTable(state.selection.$from);
    if (!table) {
      this.hide();
      return;
    }

    const dom = this.view.nodeDOM(table.pos) as HTMLElement | null;
    if (!dom) {
      this.hide();
      return;
    }

    const wrapper = dom.classList.contains("tableWrapper")
      ? dom
      : (dom.closest(".tableWrapper") as HTMLElement) ?? dom;
    const tableEl =
      wrapper.tagName === "TABLE"
        ? (wrapper as HTMLTableElement)
        : (wrapper.querySelector("table") as HTMLTableElement | null);
    if (!tableEl) {
      this.hide();
      return;
    }

    const rows = tableEl.querySelectorAll("tr");
    const rowRects = [...rows].map((r) => r.getBoundingClientRect());
    const firstRow = rows[0];
    const cellEls = firstRow ? [...firstRow.querySelectorAll("th, td")] : [];
    const cellRects = cellEls.map((c) => c.getBoundingClientRect());
    const tb = wrapper.getBoundingClientRect();

    this.root.style.display = "block";

    const sel = state.selection;
    const cellSel = sel instanceof CellSelection;
    const showDeleteSlice = cellSel && (sel.isRowSelection() || sel.isColSelection());

    let rowSelActive: { top: number; bottom: number } | null = null;
    let colSelActive: { left: number; right: number } | null = null;
    if (cellSel && (sel.isRowSelection() || sel.isColSelection())) {
      const r = selectedRect(state);
      if (sel.isRowSelection()) rowSelActive = { top: r.top, bottom: r.bottom };
      if (sel.isColSelection()) colSelActive = { left: r.left, right: r.right };
    }

    this.toolbar.innerHTML = `
      <button type="button" class="table-yuque-btn" data-yuque-action="fit" title="切换铺满 / 内容宽度">自适应宽度</button>
      <span class="table-yuque-sep"></span>
      <button type="button" class="table-yuque-btn" data-yuque-action="addRowEnd" title="在末尾插入一行">+ 行</button>
      <button type="button" class="table-yuque-btn" data-yuque-action="addColEnd" title="在末尾插入一列">+ 列</button>
      <span class="table-yuque-sep"></span>
      <button type="button" class="table-yuque-btn table-yuque-btn--danger" data-yuque-action="deleteTable" title="删除整张表">删表</button>
      ${
        showDeleteSlice
          ? `<button type="button" class="table-yuque-btn table-yuque-btn--danger" data-yuque-action="deleteSelection" title="删除选中的行或列">删除</button>`
          : ""
      }
    `;

    const toolbarH = 36;
    this.toolbar.style.left = `${tb.left + tb.width / 2}px`;
    this.toolbar.style.top = `${tb.top - toolbarH - 6}px`;
    this.toolbar.style.transform = "translateX(-50%)";

    const gutterW = 14;
    const gutterTopH = 14;

    this.leftGutterHost.innerHTML = "";
    for (let i = 0; i < rowRects.length; i++) {
      const rr = rowRects[i];
      const seg = document.createElement("div");
      seg.className = "table-yuque-gutter-cell table-yuque-gutter-cell--row";
      if (rowSelActive && i >= rowSelActive.top && i < rowSelActive.bottom) seg.classList.add("is-active");
      seg.dataset.rowIndex = String(i);
      seg.title = `选中第 ${i + 1} 行`;
      seg.style.left = `${tb.left - gutterW - 2}px`;
      seg.style.top = `${rr.top}px`;
      seg.style.width = `${gutterW}px`;
      seg.style.height = `${rr.height}px`;
      this.leftGutterHost.appendChild(seg);
    }

    this.topGutterHost.innerHTML = "";
    for (let i = 0; i < cellRects.length; i++) {
      const cr = cellRects[i];
      const seg = document.createElement("div");
      seg.className = "table-yuque-gutter-cell table-yuque-gutter-cell--col";
      if (colSelActive && i >= colSelActive.left && i < colSelActive.right) seg.classList.add("is-active");
      seg.dataset.colIndex = String(i);
      seg.title = `选中第 ${i + 1} 列`;
      seg.style.left = `${cr.left}px`;
      seg.style.top = `${tb.top - 2}px`;
      seg.style.width = `${cr.width}px`;
      seg.style.height = `${gutterTopH}px`;
      this.topGutterHost.appendChild(seg);
    }

    this.bottomBar.style.left = `${tb.left + tb.width / 2}px`;
    this.bottomBar.style.top = `${tb.bottom + 4}px`;
    this.bottomBar.style.transform = "translateX(-50%)";

    this.colInsertLayer.innerHTML = "";
    this.colInsertLayer.style.left = `${tb.left}px`;
    this.colInsertLayer.style.top = `${tb.top - gutterTopH - 2}px`;
    this.colInsertLayer.style.width = `${tb.width}px`;
    this.colInsertLayer.style.height = `${gutterTopH}px`;

    for (let i = 0; i < cellRects.length - 1; i++) {
      const a = cellRects[i];
      const b = cellRects[i + 1];
      const mid = (a.right + b.left) / 2;
      const zone = document.createElement("button");
      zone.type = "button";
      zone.className = "table-yuque-col-insert-hit";
      zone.dataset.insertColAfter = String(i);
      zone.title = "在右侧插入列";
      zone.style.left = `${mid - tb.left - 5}px`;
      zone.style.position = "absolute";
      zone.style.width = "10px";
      zone.style.top = "0";
      zone.style.height = `${gutterTopH}px`;
      this.colInsertLayer.appendChild(zone);
    }
  }

  private hide() {
    this.leftGutterHost.innerHTML = "";
    this.topGutterHost.innerHTML = "";
    this.root.style.display = "none";
  }

  update(view: EditorView, prevState: EditorState) {
    this.view = view;
    if (view.state === prevState) return true;
    this.scheduleSync();
    return true;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this._cleanupScroll?.();
    this.root.remove();
  }
}

export const tableYuquePlugin = $prose((ctx) => {
  const key = new PluginKey("vsgoTableYuque");
  return new Plugin({
    key,
    view(editorView) {
      return new TableYuqueView(editorView, ctx);
    },
  });
});
