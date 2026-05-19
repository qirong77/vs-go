import { useMemo } from "react";
import { Select } from "antd";
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./codeBlockLanguage";

const BASE_VALUES = new Set(CODE_BLOCK_LANGUAGE_OPTIONS.map((o) => o.value));

type Props = {
  value: string;
  onChange: (v: string) => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
};

export function CodeBlockLangSelect({ value, onChange, getPopupContainer }: Props) {
  const options = useMemo(() => {
    const opts = CODE_BLOCK_LANGUAGE_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
    }));
    const v = String(value ?? "").trim();
    if (v && !BASE_VALUES.has(v)) {
      opts.push({ label: v, value: v });
    }
    return opts;
  }, [value]);

  return (
    <div
      className="code-block-lang-select-antd-wrap"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Select
        size="small"
        className="code-block-lang-select-antd"
        showSearch
        popupMatchSelectWidth={false}
        listHeight={280}
        options={options}
        value={value}
        optionFilterProp="label"
        filterOption={(input, option) => {
          const q = input.trim().toLowerCase();
          if (!q) return true;
          const label = String(option?.label ?? "").toLowerCase();
          const val = String(option?.value ?? "").toLowerCase();
          return label.includes(q) || val.includes(q);
        }}
        getPopupContainer={(trigger) => {
          const el = trigger as HTMLElement;
          return (
            getPopupContainer?.(el) ??
            (el.closest(".milkdown-code-block-shell") as HTMLElement | null) ??
            document.body
          );
        }}
        onChange={(v) => onChange(v ?? "")}
      />
    </div>
  );
}
