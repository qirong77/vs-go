import { useState, useEffect } from "react";
import { VS_GO_EVENT } from "../../common/EVENT";

type DefaultEditor = "vscode" | "cursor";

type AppSettings = {
  defaultEditor: DefaultEditor;
};

const { ipcRenderer } = window.electron;

const EDITORS: { value: DefaultEditor; label: string; desc: string }[] = [
  {
    value: "vscode",
    label: "Visual Studio Code",
    desc: "使用 VS Code 打开项目",
  },
  {
    value: "cursor",
    label: "Cursor",
    desc: "使用 Cursor 打开项目",
  },
];

function AppSetting() {
  const [editor, setEditor] = useState<DefaultEditor>("vscode");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ipcRenderer.invoke(VS_GO_EVENT.APP_SETTINGS_GET).then((res: AppSettings) => {
      if (res?.defaultEditor) setEditor(res.defaultEditor);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await ipcRenderer.invoke(VS_GO_EVENT.APP_SETTINGS_SET, { defaultEditor: editor });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 w-full h-full flex flex-col bg-white dark:bg-gray-900">
      <h2 className="mb-6 flex items-center gap-2">
        <span role="img" aria-label="settings">⚙️</span>
        <span className="text-xl font-bold text-gray-800 dark:text-gray-100">App 设置</span>
      </h2>

      <div className="flex-1">
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            默认打开项目的编辑器
          </label>
          <div className="flex flex-col gap-3">
            {EDITORS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  editor === opt.value
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500"
                }`}
              >
                <input
                  type="radio"
                  name="editor"
                  value={opt.value}
                  checked={editor === opt.value}
                  onChange={() => setEditor(opt.value)}
                  className="w-4 h-4 accent-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {opt.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          className="px-5 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleSave}
          disabled={saving}
        >
          {saved ? "✓ 已保存" : saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

export default AppSetting;
