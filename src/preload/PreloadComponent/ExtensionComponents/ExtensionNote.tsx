import { ExtensionPopover } from "./ExtensionPopover";

export const ExtensionNote: React.FC = () => {
  return (
    <ExtensionPopover content={<div>笔记管理</div>}>
      📝
    </ExtensionPopover>
  );
};
