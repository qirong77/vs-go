import React, { useState, useEffect } from "react";
import { ExtensionPopover } from "./ExtensionPopover";
import { VS_GO_EVENT } from "../../../common/EVENT";
import { SavedCookie } from "../../../common/type";
import { ipcRenderer } from "electron";



interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const ExtensionCookie: React.FC = () => {
  const [savedCookies, setSavedCookies] = useState<SavedCookie[]>([]);
  const [currentCookies, setCurrentCookies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredCookie, setHoveredCookie] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Toast 消息系统
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastMessage = { id, message, type };
    setToasts(prev => [...prev, toast]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // 获取已保存的 Cookie 列表
  const loadSavedCookies = async () => {
    try {
      const cookies = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_GET_SAVED_LIST);
      setSavedCookies(cookies);
    } catch (error) {
      console.error('加载已保存 Cookie 失败:', error);
    }
  };

  // 获取当前页面的 Cookie
  const loadCurrentCookies = async () => {
    try {
      setLoading(true);
      const cookies = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_GET_CURRENT, window.location.href);
      setCurrentCookies(cookies);
    } catch (error) {
      console.error('获取当前页面 Cookie 失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 保存当前页面的 Cookie
  const saveCurrentCookies = async () => {
    try {
      setLoading(true);
      await loadCurrentCookies();
      
      if (currentCookies.length === 0) {
        showToast('当前页面没有 Cookie 可保存', 'info');
        return;
      }

      let savedCount = 0;
      for (const cookie of currentCookies) {
        const cookieData = {
          domain: cookie.domain || window.location.hostname,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          expirationDate: cookie.expirationDate,
          sameSite: cookie.sameSite,
        };
        
        const result = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_SAVE, cookieData);
        if (result.success) savedCount++;
      }
      
      await loadSavedCookies();
      showToast(`成功保存 ${savedCount} 个 Cookie`, 'success');
    } catch (error) {
      console.error('保存 Cookie 失败:', error);
      showToast('保存 Cookie 失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 删除已保存的 Cookie
  const deleteSavedCookie = async (cookieId: string) => {
    try {
      const result = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_DELETE, cookieId);
      if (result.success) {
        await loadSavedCookies();
        showToast('Cookie 删除成功', 'success');
      } else {
        showToast('删除 Cookie 失败', 'error');
      }
    } catch (error) {
      console.error('删除 Cookie 失败:', error);
      showToast('删除 Cookie 失败，请稍后重试', 'error');
    }
  };

  // 应用 Cookie 到当前页面
  const applyCookie = async (cookie: SavedCookie) => {
    try {
      setLoading(true);
      const result = await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_APPLY, cookie, window.location.href);
      
      if (result.success) {
        showToast('Cookie 应用成功，即将刷新页面...', 'success');
        // 延迟刷新以显示成功消息
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showToast(`应用 Cookie 失败: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('应用 Cookie 失败:', error);
      showToast('应用 Cookie 失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 过滤 Cookie 列表
  const filteredCookies = savedCookies.filter(cookie => 
    cookie.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cookie.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 清除所有已保存的 Cookie
  const clearAllCookies = async () => {
    if (!confirm('确定要删除所有已保存的 Cookie 吗？此操作无法撤销。')) {
      return;
    }
    
    try {
      // 由于没有批量删除的 API，我们逐个删除
      for (const cookie of savedCookies) {
        await ipcRenderer.invoke(VS_GO_EVENT.COOKIE_DELETE, cookie.id);
      }
      await loadSavedCookies();
      showToast('所有 Cookie 已清除', 'success');
    } catch (error) {
      console.error('清除 Cookie 失败:', error);
      showToast('清除 Cookie 失败，请稍后重试', 'error');
    }
  };

  // 导出 Cookie 到剪贴板
  const exportCookies = async () => {
    try {
      const exportData = {
        exportTime: new Date().toISOString(),
        cookies: filteredCookies
      };
      
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      showToast('Cookie 数据已复制到剪贴板', 'success');
    } catch (error) {
      console.error('导出 Cookie 失败:', error);
      showToast('导出失败，请稍后重试', 'error');
    }
  };

  // 组件加载时获取已保存的 Cookie
  useEffect(() => {
    loadSavedCookies();
  }, []);

  const cookieContent = (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .cookie-item:hover {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }
        .cookie-item {
          transition: all 0.2s ease;
        }
      `}</style>
      <div style={{ width: '400px', maxHeight: '500px', overflow: 'scroll', position: 'relative' }}>
        {/* Toast 消息 */}
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              padding: '12px 16px',
              borderRadius: '6px',
              color: 'white',
              fontSize: '14px',
              zIndex: 10000,
              minWidth: '200px',
              background: toast.type === 'success' ? '#10b981' : 
                        toast.type === 'error' ? '#ef4444' : '#3b82f6',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              animation: 'slideIn 0.3s ease-out'
            }}
          >
            {toast.message}
          </div>
        ))}

      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
        Cookie 管理
      </h3>
      
      <div style={{ marginBottom: '16px', padding: '12px', background: '#f9fafb', borderRadius: '8px' }}>
        <div style={{ marginBottom: '8px', fontSize: '14px', color: '#374151' }}>
          <strong>当前域名:</strong> {window.location.hostname}
        </div>
        <button 
          onClick={saveCurrentCookies}
          disabled={loading}
          style={{
            width: '100%',
            padding: '8px 16px',
            background: loading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s ease'
          }}
        >
          {loading ? '保存中...' : '保存页面 Cookie'}
        </button>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#374151' }}>
          已保存的 Cookie ({savedCookies.length})
        </h4>
        
        {/* 搜索框 */}
        {savedCookies.length > 0 && (
          <>
            <input
              type="text"
              placeholder="搜索域名或 Cookie 名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                marginBottom: '8px',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
            />
            
            {/* 批量操作按钮 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                onClick={exportCookies}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
              >
                导出
              </button>
              <button
                onClick={clearAllCookies}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
              >
                清除全部
              </button>
            </div>
          </>
        )}
      </div>

      {savedCookies.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          color: '#6b7280', 
          fontSize: '13px', 
          padding: '20px 0',
          fontStyle: 'italic'
        }}>
          暂无保存的 Cookie
        </div>
      ) : filteredCookies.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          color: '#6b7280', 
          fontSize: '13px', 
          padding: '20px 0',
          fontStyle: 'italic'
        }}>
          没有找到匹配的 Cookie
        </div>
      ) : (
          <div style={{ maxHeight: '260px', overflow: 'auto' }}>
            {filteredCookies.map((cookie) => (
              <div 
                key={cookie.id}
                className="cookie-item"
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: '#ffffff',
                  position: 'relative'
                }}
                onMouseEnter={() => setHoveredCookie(cookie.id)}
                onMouseLeave={() => setHoveredCookie(null)}
              >
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: 500, 
                  color: '#1f2937',
                  marginBottom: '4px'
                }}>
                  {cookie.domain} - {cookie.saveTimeDisplay}
                </div>
                
                {hoveredCookie === cookie.id && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '0',
                    right: '0',
                    background: '#374151',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    zIndex: 1000,
                    marginTop: '4px',
                    maxHeight: '100px',
                    overflow: 'auto',
                    wordBreak: 'break-all'
                  }}>
                    <div><strong>名称:</strong> {cookie.name}</div>
                    <div><strong>值:</strong> {cookie.value}</div>
                    {cookie.path && <div><strong>路径:</strong> {cookie.path}</div>}
                  </div>
                )}
                
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  gap: '8px',
                  marginTop: '8px'
                }}>
                  <button
                    onClick={() => applyCookie(cookie)}
                    disabled={loading}
                    style={{
                      padding: '4px 8px',
                      background: loading ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    应用
                  </button>
                  <button
                    onClick={() => deleteSavedCookie(cookie.id)}
                    style={{
                      padding: '4px 8px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease'
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
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
        transition: 'background-color 0.2s ease',
        cursor: 'pointer'
      }}>
        🍪
      </div>
    </ExtensionPopover>
  );
};
