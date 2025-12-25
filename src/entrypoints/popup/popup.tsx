import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { IconContext } from 'react-icons'
import {
    AiOutlineCloudUpload, AiOutlineCloudDownload,
    AiOutlineSetting, AiOutlineClear,
} from 'react-icons/ai'
// import 'bootstrap/dist/css/bootstrap.min.css';
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
    const [showClearModal, setShowClearModal] = useState(false)
    const [clearSaving, setClearSaving] = useState(false)

    // Temporary state for modal editing
    const [tempEncryptEnabled, setTempEncryptEnabled] = useState(false)
    const [tempEncryptPassword, setTempEncryptPassword] = useState('')

    const renderPopupToast = (message: string, key: string) => {
        const isSuccess = message.startsWith('✅');
        const cleanMessage = message.replace(/^✅\s*/, '').replace(/^❌\s*/, '');
        // Check if this is an encryption related success message
        // Exclude "加密已关闭" (Encryption Disabled) from usage distinct separate color
        const isEncryption = (cleanMessage.includes('加密') || cleanMessage.includes('Encryption') || cleanMessage.includes('密码'))
            && !cleanMessage.includes('关闭') && !cleanMessage.includes('disabled');

        return (
            <div key={key} className={`popup-toast ${isSuccess ? 'popup-toast--success' : 'popup-toast--error'} ${isEncryption ? 'popup-toast--encryption' : ''}`}>
                <div className="popup-toast-icon">
                    {isSuccess ? '✓' : '!'}
                </div>
                <div className="popup-toast-message">{cleanMessage}</div>
            </div>
        );
    };

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

    const runAction = async (name: ActionName, options?: { skipConfirm?: boolean }) => {
        if (name === 'removeAll' && !options?.skipConfirm) {
            setShowClearModal(true);
            return;
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
        setTempEncryptEnabled(encryptEnabled)
        setTempEncryptPassword(encryptPassword)
        setEncryptError('')
        setShowEncryptModal(true)
    }

    const handleSaveEncryptSettings = async () => {
        setEncryptError('')
        setEncryptSaving(true)
        const shouldRetryDownload = pendingRetryAction === 'download'
        try {
            const finalEnable = tempEncryptEnabled
            if (finalEnable && !tempEncryptPassword) {
                setEncryptError('请输入加密密码')
                setEncryptSaving(false)
                return
            }
            await optionsStorage.set({
                enableEncrypt: finalEnable,
                encryptPassword: finalEnable ? tempEncryptPassword : '',
            })
            // Update local state only after save
            setEncryptEnabled(finalEnable);
            setEncryptPassword(finalEnable ? tempEncryptPassword : '');

            if (finalEnable) {
                setStatusMessage('✅ 加密设置已保存')
            } else {
                setStatusMessage('✅ 加密已关闭')
            }
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

    const handleConfirmRemoveAll = async () => {
        setClearSaving(true)
        try {
            await runAction('removeAll', { skipConfirm: true })
            setShowClearModal(false)
        } finally {
            setClearSaving(false)
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

                <section className="popup-encrypt-hint">
                    <button
                        type="button"
                        className={
                            `popup-encrypt-button ` +
                            (encryptEnabled ? 'popup-encrypt-button--enabled' : 'popup-encrypt-button--disabled')
                        }
                        onClick={openEncryptModal}
                    >
                        {encryptEnabled ? '已启用加密 · 修改密码' : '未启用加密 · 点击设置'}
                    </button>
                </section>

                <section className="popup-stats">
                    <div className="popup-stat popup-stat-local">
                        <span>本地</span>
                        <strong>{count["local"]}</strong>
                    </div>
                    <div className="popup-stat popup-stat-remote">
                        <span>远程</span>
                        <strong>{count["remote"]}</strong>
                    </div>
                    <div className="popup-stat popup-stat-excluded">
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
                    </button>
                </section>

                {showEncryptModal && (
                    <div className="popup-modal-backdrop">
                        <div className="popup-modal">
                            <h2 className="popup-modal-title">加密设置</h2>
                            <label className="popup-modal-row">
                                <input
                                    type="checkbox"
                                    checked={tempEncryptEnabled}
                                    onChange={e => setTempEncryptEnabled(e.target.checked)}
                                />
                                <span>启用加密存储远程书签</span>
                            </label>
                            <div className="popup-modal-row">
                                <input
                                    type="password"
                                    className="popup-modal-input"
                                    value={tempEncryptPassword}
                                    onChange={e => setTempEncryptPassword(e.target.value)}
                                    placeholder="请输入加密密码"
                                    disabled={!tempEncryptEnabled}
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

                {showClearModal && (
                    <div className="popup-modal-backdrop">
                        <div className="popup-modal">
                            <h2 className="popup-modal-title">清空本地书签</h2>
                            <p className="popup-modal-row">
                                清空后将删除当前浏览器中的全部书签并重置同步状态，此操作不可撤销，请先备份重要书签。
                            </p>
                            <div className="popup-modal-actions">
                                <button
                                    type="button"
                                    className="popup-modal-btn popup-modal-btn-cancel"
                                    onClick={() => setShowClearModal(false)}
                                    disabled={clearSaving}
                                >
                                    取消
                                </button>
                                <button
                                    type="button"
                                    className="popup-modal-btn popup-modal-btn-danger"
                                    onClick={handleConfirmRemoveAll}
                                    disabled={clearSaving}
                                >
                                    {clearSaving ? '清空中…' : '确认清空'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <footer className="popup-footer">
                    {statusMessage && (
                        <div className="popup-toast-container">
                            {renderPopupToast(statusMessage, 'popup')}
                        </div>
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

