import { ExtensionPopover } from "./ExtensionPopover";

export const ExtensionNote: React.FC = () => {
  const noteContent = (
    <div>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>网页笔记</h3>
      <div style={{ marginBottom: '12px' }}>
        <textarea 
          placeholder="在这里记录你的想法..."
          style={{
            width: '100%',
            height: '120px',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '13px',
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          {window.location.hostname}
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={{
            padding: '6px 12px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer'
          }}>
            保存
          </button>
          <button style={{
            padding: '6px 12px',
            background: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer'
          }}>
            清空
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ExtensionPopover 
      content={noteContent}
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
        📝
      </div>
    </ExtensionPopover>
  );
};
