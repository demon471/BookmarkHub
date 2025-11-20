import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineClear
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'

type ActionName = 'upload' | 'download' | 'removeAll';

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0", excluded: "0" })
    const [actionLoading, setActionLoading] = useState<ActionName | null>(null);
    const [statusMessage, setStatusMessage] = useState('');

    const refreshCounts = async () => {
        const data = await browser.storage.local.get(["localCount", "remoteCount"]);
        const localNum = Number(data["localCount"] ?? 0);
        const remoteNum = Number(data["remoteCount"] ?? 0);
        const excludedNum = Math.max(localNum - remoteNum, 0);
        setCount({
            local: String(localNum),
            remote: String(remoteNum),
            excluded: String(excludedNum),
        });
    };

    useEffect(() => {
        refreshCounts();

        const handleChange = (changes: any, areaName: string) => {
            if (areaName === 'local' && (changes.localCount || changes.remoteCount)) {
                refreshCounts();
            }
        };

        browser.storage.onChanged.addListener(handleChange);
        return () => {
            browser.storage.onChanged.removeListener(handleChange);
        };
    }, [])

    const runAction = async (name: ActionName) => {
        if (name === 'removeAll') {
            const confirmed = window.confirm('确认清空本地书签并重置同步状态？此操作不可撤销。');
            if (!confirmed) {
                return;
            }
        }

        setActionLoading(name);
        setStatusMessage('');
        try {
            await browser.runtime.sendMessage({ name });
            const successMsg = name === 'upload'
                ? '✅ 已触发上传任务'
                : name === 'download'
                    ? '✅ 已触发下载任务'
                    : '✅ 已清空本地书签';
            setStatusMessage(successMsg);
            setTimeout(() => setStatusMessage(''), 4000);
        } catch (error) {
            console.error('Popup action error:', error);
            setStatusMessage('❌ 操作失败，请重试');
            setTimeout(() => setStatusMessage(''), 4000);
        } finally {
            setActionLoading(null);
        }
    };

    const openSettings = async () => {
        setStatusMessage('');
        try {
            await browser.runtime.sendMessage({ name: 'setting' });
        } catch (error) {
            console.error('Open settings error:', error);
        }
    };

    return (
        <IconContext.Provider value={{ className: 'popup-icon' }}>
            <div className="popup-root">
                <header className="popup-header">
                    <div className="popup-heading">
                        <p className="popup-eyebrow">BookmarkHub</p>
                        <h1>快捷同步面板</h1>
                        <p>一键上传或下载书签，随时掌握同步状态。</p>
                    </div>
                    <button className="popup-settings" onClick={openSettings} title={browser.i18n.getMessage('settings')}>
                        <AiOutlineSetting />
                    </button>
                </header>

                <section className="popup-stats">
                    <div className="popup-stat">
                        <span>本地</span>
                        <strong>{count["local"]}</strong>
                    </div>
                    <div className="popup-stat">
                        <span>远程</span>
                        <strong>{count["remote"]}</strong>
                    </div>
                    <div className="popup-stat">
                        <span>排除</span>
                        <strong>{count["excluded"]}</strong>
                    </div>
                </section>

                <section className="popup-actions">
                    <button
                        className="popup-action primary"
                        onClick={() => runAction('upload')}
                        disabled={!!actionLoading}
                    >
                        <div className="popup-action-body">
                            <AiOutlineCloudUpload className="popup-action-icon" />
                            <div className="popup-action-text">
                                <strong>{browser.i18n.getMessage('uploadBookmarks')}</strong>
                                <span>{browser.i18n.getMessage('uploadBookmarksDesc')}</span>
                            </div>
                        </div>
                        {actionLoading === 'upload' && <span className="popup-action-badge">…</span>}
                    </button>

                    <button
                        className="popup-action secondary"
                        onClick={() => runAction('download')}
                        disabled={!!actionLoading}
                    >
                        <div className="popup-action-body">
                            <AiOutlineCloudDownload className="popup-action-icon" />
                            <div className="popup-action-text">
                                <strong>{browser.i18n.getMessage('downloadBookmarks')}</strong>
                                <span>{browser.i18n.getMessage('downloadBookmarksDesc')}</span>
                            </div>
                        </div>
                        {actionLoading === 'download' && <span className="popup-action-badge">…</span>}
                    </button>

                    <button
                        className="popup-action danger"
                        onClick={() => runAction('removeAll')}
                        disabled={!!actionLoading}
                    >
                        <div className="popup-action-body">
                            <AiOutlineClear className="popup-action-icon" />
                            <div className="popup-action-text">
                                <strong>{browser.i18n.getMessage('removeAllBookmarks')}</strong>
                                <span>{browser.i18n.getMessage('removeAllBookmarksDesc')}</span>
                            </div>
                        </div>
                        {actionLoading === 'removeAll' && <span className="popup-action-badge">…</span>}
                    </button>
                </section>

                <footer className="popup-footer">
                    {statusMessage && (
                        <p className={statusMessage.startsWith('✅') ? 'popup-feedback success' : 'popup-feedback error'}>{statusMessage}</p>
                    )}
                    <p className="popup-tip">最新的同步范围可在「设置页」中调整。</p>
                </footer>
            </div>
        </IconContext.Provider>
    )
}


ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
);

