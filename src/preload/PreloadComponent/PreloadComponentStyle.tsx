import { CSSProperties } from "react";

// 样式常量定义
export const styles: { [key: string]: CSSProperties } = {
  container: {
    position: "relative",
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderBottom: "1px solid #e5e7eb",
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    transition: "all 0.2s ease-in-out",
    pointerEvents: "auto",
    boxSizing: "border-box",
    margin: "10px 0",
  },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
  },

  navigationGroup: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },

  inputContainer: {
    flex: "1",
    position: "relative",
    borderRadius: "8px",
    padding: "4px",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    background: "transparent",
  },

  inputContainerHover: {
    background:
      "linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 100%)",
    boxShadow: "0 0 0 1px rgba(59, 130, 246, 0.1), 0 2px 8px -2px rgba(59, 130, 246, 0.15)",
    transform: "translateY(-1px)",
  },

  button: {
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "400",
    borderWidth: "0",
    borderStyle: "none",
    cursor: "pointer",
    transition: "all 0.2s",
    color: "#374151",
    backgroundColor: "transparent",
  } as CSSProperties,

  buttonHover: {
    color: "#111827",
    backgroundColor: "#f3f4f6",
  },

  buttonActive: {
    backgroundColor: "#e5e7eb",
  },

  buttonDisabled: {
    color: "#9ca3af",
    cursor: "not-allowed",
  },

  input: {
    width: "100%",
    padding: "8px 14px",
    fontSize: "14px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#d1d5db",
    borderRadius: "6px",
    outline: "none",
    backgroundColor: "#ffffff",
    transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
  } as CSSProperties,

  inputHover: {
    borderColor: "#a3a3a3",
    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(59, 130, 246, 0.1)",
    transform: "translateY(-0.5px)",
  } as CSSProperties,

  inputFocused: {
    borderColor: "#3b82f6",
    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(59, 130, 246, 0.15)",
    transform: "translateY(-1px)",
  } as CSSProperties,

  dropdown: {
    position: "absolute",
    top: "100%",
    left: "0",
    right: "0",
    marginTop: "4px",
    backgroundColor: "#ffffff",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#e5e7eb",
    borderRadius: "6px",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.05)",
    zIndex: 9999999,
    maxHeight: "256px",
    overflowY: "auto",
  } as CSSProperties,

  dropdownItem: {
    padding: "10px 12px",
    cursor: "pointer",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#f3f4f6",
    transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
    borderRadius: "4px",
    margin: "2px 4px",
    borderLeft: "3px solid transparent",
    position: "relative",
  } as CSSProperties,

  dropdownItemLast: {
    borderBottomWidth: "0",
  } as CSSProperties,

  dropdownItemHover: {
    backgroundColor:
      "linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(147, 51, 234, 0.15) 100%)",
    borderRadius: "6px",
    margin: "2px 4px",
    transform: "translateX(4px) translateY(-1px) scale(1.02)",
    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.25), 0 2px 6px rgba(147, 51, 234, 0.15)",
    borderLeft: "3px solid rgba(59, 130, 246, 0.4)",
    transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  } as CSSProperties,

  dropdownItemContent: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  dropdownIcon: {
    width: "16px",
    height: "16px",
    backgroundColor: "#e5e7eb",
    borderRadius: "2px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
  },

  dropdownText: {
    flex: "1",
    minWidth: "0",
  },

  dropdownTitle: {
    fontSize: "14px",
    fontWeight: "500",
    color: "#111827",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  dropdownUrl: {
    fontSize: "12px",
    color: "#6b7280",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  emptyState: {
    padding: "8px 12px",
    fontSize: "14px",
    color: "#6b7280",
  },

  inputWrapper: {
    position: "relative",
  },
  extensionContainer: {
    marginLeft: "8px",
    marginRight: "40px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
};
