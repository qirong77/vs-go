import { ExtensionPopover } from "./ExtensionPopover";

export const ExtensionCookie: React.FC = () => {
  const cookieContent = (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Cookie 管理</h3>
      <div style={{ marginBottom: '8px' }}>
        <strong>当前域名:</strong> {window.location.hostname}
      </div>
      <div style={{ marginBottom: '12px', color: '#6b7280', fontSize: '13px' }}>
        管理当前网站的 Cookie 设置
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={{
          padding: '6px 12px',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          cursor: 'pointer'
        }}>
          查看 Cookie
        </button>
        <button style={{
          padding: '6px 12px',
          background: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontSize: '12px',
          cursor: 'pointer'
        }}>
          清除 Cookie
        </button>
      </div>
    </div>
  );

  return (
    <ExtensionPopover 
      content={cookieContent}
      trigger="click"
      placement="bottom-right"
    >
      <div style={{
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '6px',
        fontSize: '14px',
        transition: 'background-color 0.2s ease'
      }}>
        🍪
      </div>
    </ExtensionPopover>
  );
};
