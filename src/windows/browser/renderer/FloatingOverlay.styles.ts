export const OVERLAY_STYLES = `
  html, body, #root {
    cursor: default;
  }
  .vsgo-overlay-root {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  .vsgo-overlay-card {
    animation: vsgoOverlayIn 0.16s ease-out;
    cursor: default;
  }
  .vsgo-overlay-card-context-menu {
    animation-duration: 0.06s;
  }
  .vsgo-overlay-card button,
  .vsgo-overlay-card .ant-menu-item:not(.ant-menu-item-disabled),
  .vsgo-overlay-card .ant-menu-item:not(.ant-menu-item-disabled) .ant-menu-title-content,
  .vsgo-overlay-card .ant-menu-item:not(.ant-menu-item-disabled) .anticon {
    cursor: pointer !important;
  }
  @keyframes vsgoOverlayIn {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .vsgo-overlay-panel {
    padding: 10px 12px 8px;
    min-width: 0;
  }
  .vsgo-overlay-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #202124;
    margin-bottom: 8px;
    user-select: none;
  }
  .vsgo-overlay-header-icon {
    color: #f5b400;
    font-size: 14px;
  }
  .vsgo-bookmark-name-input.ant-input {
    border-radius: 6px;
    font-size: 12px;
  }
  .vsgo-bookmark-url {
    margin-top: 6px;
    padding: 4px 6px;
    font-size: 10px;
    line-height: 1.4;
    color: #5f6368;
    background: #f1f3f4;
    border-radius: 6px;
    word-break: break-all;
    user-select: text;
  }
  .vsgo-overlay-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
  }
  .vsgo-overlay-footer-spacer {
    flex: 1;
  }
  .vsgo-overlay-btn {
    border: none;
    background: transparent;
    font-size: 12px;
    line-height: 1;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
    user-select: none;
  }
  .vsgo-overlay-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  .vsgo-overlay-btn-danger {
    color: #d93025;
  }
  .vsgo-overlay-btn-danger:hover:not(:disabled) {
    background: #fce8e6;
  }
  .vsgo-overlay-btn-ghost {
    color: #5f6368;
  }
  .vsgo-overlay-btn-ghost:hover:not(:disabled) {
    background: #f1f3f4;
  }
  .vsgo-overlay-btn-primary {
    color: #fff;
    background: #1a73e8;
    font-weight: 500;
  }
  .vsgo-overlay-btn-primary:hover:not(:disabled) {
    background: #1765cc;
  }
  .vsgo-overlay-menu.ant-menu {
    padding: 2px;
    background: transparent;
    max-height: inherit;
    overflow-y: auto;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item,
  .vsgo-overlay-menu.ant-menu .ant-menu-submenu-title {
    cursor: pointer;
    border-radius: 4px;
    margin: 0;
    width: 100%;
    min-height: 28px;
    height: 28px;
    line-height: 28px;
    padding-inline: 8px !important;
    font-size: 12px;
    transition: background 0.12s ease;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-disabled {
    cursor: default;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-disabled:hover {
    background: transparent !important;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-group-title {
    font-size: 10px;
    color: #80868b;
    padding: 4px 8px 2px;
    line-height: 1.2;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-group-list {
    padding: 0;
  }
  .vsgo-overlay-menu.ant-menu .ant-menu-item-group-list .ant-menu-item {
    cursor: pointer;
  }
  .vsgo-confirm-message {
    color: #3c4043;
    font-size: 12px;
    line-height: 1.5;
    margin-top: 4px;
    word-break: break-word;
  }
  .vsgo-folder-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #80868b;
    font-size: 12px;
    user-select: none;
  }
  .vsgo-bookmark-item-label {
    display: block;
    font-size: 12px;
    color: #202124;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .vsgo-name-dialog-title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 8px;
    color: #202124;
    user-select: none;
  }
  .vsgo-overlay-panel .ant-input,
  .vsgo-overlay-panel .ant-input-affix-wrapper {
    cursor: text !important;
  }
  .vsgo-overlay-panel .ant-input-clear-icon {
    cursor: pointer !important;
  }
  .vsgo-history-panel {
    min-width: 0;
    color: #202124;
    outline: none;
  }
  .vsgo-overlay-card-history-list {
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .vsgo-history-panel:focus,
  .vsgo-history-panel:focus-visible,
  .vsgo-history-address-input,
  .vsgo-history-address-input:focus,
  .vsgo-history-address-input:focus-visible,
  .vsgo-history-item:focus,
  .vsgo-history-item:focus-visible {
    outline: none;
  }
  .vsgo-history-address-wrap {
    height: 28px;
    padding: 0 12px;
    border-radius: 18px;
    background: #fff;
    border: 1px solid #1a73e8;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 0 0 1px rgba(26,115,232,0.05);
  }
  .vsgo-history-address-wrap .anticon {
    color: #5f6368;
    font-size: 13px;
    flex-shrink: 0;
  }
  .vsgo-history-address-input {
    flex: 1;
    border: none;
    background: transparent;
    color: #202124;
    font-size: 13px;
    min-width: 0;
    height: 24px;
    padding: 0;
    user-select: text;
    -webkit-user-select: text;
  }
  .vsgo-history-list-card {
    margin-top: 6px;
    padding: 6px 0;
    background: rgba(255,255,255,0.98);
    border-radius: 10px;
    box-shadow: 0 3px 10px rgba(60,64,67,0.12), 0 0 0 1px rgba(60,64,67,0.06);
    overflow: hidden;
  }
  .vsgo-history-header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 18px;
    color: #5f6368;
    font-size: 13px;
    user-select: none;
  }
  .vsgo-history-list {
    max-height: 286px;
    overflow-y: auto;
    padding: 2px 0 4px;
  }
  .vsgo-history-list::-webkit-scrollbar {
    width: 8px;
  }
  .vsgo-history-list::-webkit-scrollbar-thumb {
    background: rgba(95,99,104,0.28);
    border-radius: 8px;
  }
  .vsgo-history-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 14px;
    box-sizing: border-box;
    cursor: pointer;
    user-select: none;
  }
  .vsgo-history-item:hover {
    background: #f1f3f4;
  }
  .vsgo-history-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: #5f6368;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .vsgo-history-icon img {
    width: 16px;
    height: 16px;
    border-radius: 2px;
  }
  .vsgo-history-text {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    overflow: hidden;
  }
  .vsgo-history-title {
    min-width: 0;
    flex: 0 1 auto;
    max-width: 45%;
    font-size: 13px;
    color: #202124;
    line-height: 16px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .vsgo-history-url {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 11px;
    color: #5f6368;
    line-height: 14px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .vsgo-history-highlight {
    color: #1a73e8;
    font-weight: 600;
    background: transparent;
  }
  .vsgo-history-empty {
    height: 40px;
    display: flex;
    align-items: center;
    padding: 0 14px;
    gap: 10px;
    color: #80868b;
    font-size: 12px;
    user-select: none;
  }
`;
