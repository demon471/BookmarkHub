import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineClear
} from 'react-icons/ai'
import 'bootstrap/dist/css/bootstrap.min.css';
import './popup.css'
import optionsStorage from '../../utils/optionsStorage'

type ActionName = 'upload' | 'download' | 'removeAll';

const Popup: React.FC = () => {
    const [count, setCount] = useState({ local: "0", remote: "0", excluded: "0" })
    const [actionLoading, setActionLoading] = useState<ActionName | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [encryptEnabled, setEncryptEnabled] = useState(false)
    const [encryptPassword, setEncryptPassword] = useState('')
    const [showEncryptModal, setShowEncryptModal] = useState(false)
    const [encryptSaving, setEncryptSaving] = useState(false)
    const [encryptError, setEncryptError] = useState('')
    const [pendingRetryAction, setPendingRetryAction] = useState<ActionName | null>(null)

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

    // 加载当前加密配置到弹窗状态
    useEffect(() => {
        (async () => {
            try {
                const opts = await optionsStorage.getAll()
                setEncryptEnabled(!!opts.enableEncrypt)
                setEncryptPassword(opts.encryptPassword || '')
            } catch (e) {
                console.error('Load encrypt settings from popup failed:', e)
            }
        })()
    }, [])

    // 监听后台发来的加密密码错误提示
    useEffect(() => {
        const listener = (msg: any) => {
            if (msg && msg.name === 'requireEncryptPassword') {
                setEncryptError('远程数据已加密或密码错误，请设置正确的加密密码后重试。')
                setPendingRetryAction('download')
                setShowEncryptModal(true)
                setStatusMessage('')
            }
        }
        browser.runtime.onMessage.addListener(listener)
        return () => {
            browser.runtime.onMessage.removeListener(listener)
        }
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

    const openEncryptModal = () => {
        setEncryptError('')
        setShowEncryptModal(true)
    }

    const handleSaveEncryptSettings = async () => {
        setEncryptError('')
        setEncryptSaving(true)
        const shouldRetryDownload = pendingRetryAction === 'download'
        try {
            const finalEnable = encryptEnabled
            if (finalEnable && !encryptPassword) {
                setEncryptError('请输入加密密码')
                setEncryptSaving(false)
                return
            }
            await optionsStorage.set({
                enableEncrypt: finalEnable,
                encryptPassword: finalEnable ? encryptPassword : '',
            })
            setStatusMessage('✅ 加密设置已保存')
            setTimeout(() => setStatusMessage(''), 4000)
            setShowEncryptModal(false)
            setPendingRetryAction(null)

            if (shouldRetryDownload) {
                await runAction('download')
            }
        } catch (error) {
            console.error('Save encrypt settings error:', error)
            setEncryptError('保存失败，请稍后重试')
        } finally {
            setEncryptSaving(false)
        }
    }

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

                <section className="popup-encrypt-hint">
                    <button
                        type="button"
                        className="popup-encrypt-button"
                        onClick={openEncryptModal}
                    >
                        {encryptEnabled ? '已启用加密 · 修改密码' : '设置加密密码'}
                    </button>
                </section>

                {showEncryptModal && (
                    <div className="popup-modal-backdrop">
                        <div className="popup-modal">
                            <h2 className="popup-modal-title">加密设置</h2>
                            <label className="popup-modal-row">
                                <input
                                    type="checkbox"
                                    checked={encryptEnabled}
                                    onChange={e => setEncryptEnabled(e.target.checked)}
                                />
                                <span>启用加密存储远程书签</span>
                            </label>
                            <div className="popup-modal-row">
                                <input
                                    type="password"
                                    className="popup-modal-input"
                                    value={encryptPassword}
                                    onChange={e => setEncryptPassword(e.target.value)}
                                    placeholder="请输入加密密码"
                                    disabled={!encryptEnabled}
                                />
                            </div>
                            {encryptError && <p className="popup-modal-error">{encryptError}</p>}
                            <div className="popup-modal-actions">
                                <button
                                    type="button"
                                    className="popup-modal-btn secondary"
                                    onClick={() => setShowEncryptModal(false)}
                                    disabled={encryptSaving}
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    className="popup-modal-btn primary"
                                    onClick={handleSaveEncryptSettings}
                                    disabled={encryptSaving}
                                >
                                    {encryptSaving ? '保存中…' : '保存'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

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

