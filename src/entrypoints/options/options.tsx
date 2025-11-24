import React, { useState, useEffect, useMemo, useRef } from 'react'

import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Modal } from 'react-bootstrap';

// @ts-ignore
import { useForm } from "react-hook-form";
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'

const Popup: React.FC = () => {

    const { register, setValue, handleSubmit, watch, reset, getValues } = useForm();

    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [importMessage, setImportMessage] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [bookmarkActionLoading, setBookmarkActionLoading] = useState<'upload' | 'download' | null>(null);
    const [bookmarkActionMessage, setBookmarkActionMessage] = useState('');
    const [folderTree, setFolderTree] = useState<any[] | null>(null);

    const [loadingTree, setLoadingTree] = useState(false);
    const [treeError, setTreeError] = useState('');
    const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
    const [folderBookmarkCount, setFolderBookmarkCount] = useState<{ [id: string]: number }>({});
    const [allFolderIds, setAllFolderIds] = useState<string[]>([]);
    const [showEncryptPassword, setShowEncryptPassword] = useState(false);

    const bookmarkActionMessageTimer = useRef<number | null>(null);
    const bookmarkFileInputRef = useRef<HTMLInputElement | null>(null);

    const folderSelectionStats = useMemo(() => {
        const total = allFolderIds.length;

        const selected = selectedFolderIds.length;
        const excluded = Math.max(total - selected, 0);
        const coverage = total > 0 ? Math.round((selected / total) * 100) : 0;
        return { total, selected, excluded, coverage };
    }, [selectedFolderIds, allFolderIds]);

    const encryptEnabled = !!watch('enableEncrypt');

    const buildFolderMeta = (nodes: any[] | null) => {
        const counts: { [id: string]: number } = {};
        const ids: string[] = [];

        const dfs = (node: any): number => {
            if (node.url) {
                return 1;
            }
            let total = 0;
            if (node.children && node.children.length) {
                for (const child of node.children) {
                    total += dfs(child);
                }
            }
            ids.push(node.id);
            counts[node.id] = total;
            return total;
        };

        if (nodes) {
            for (const node of nodes) {
                dfs(node);
            }
        }

        return { counts, ids };
    };

    const loadConfig = async () => {
        // 加载现有配置
        const options = await optionsStorage.getAll();
        reset({
            githubToken: options.githubToken || '',
            gistID: options.gistID || '',
            gistFileName: options.gistFileName || 'BookmarkHub',
            enableNotify: options.enableNotify !== false,
            autoSyncEnabled: options.autoSyncEnabled || false,
            autoSyncInterval: options.autoSyncInterval || 15,
            enableEncrypt: options.enableEncrypt || false,
            encryptPassword: options.encryptPassword || '',
        });
    };

    const loadFolderTree = async () => {
        setLoadingTree(true);
        setTreeError('');
        try {
            const tree = await browser.bookmarks.getTree();
            if (tree && tree[0]) {
                tree[0].title = '根';
            }
            const { counts, ids } = buildFolderMeta(tree);
            setFolderBookmarkCount(counts);
            setAllFolderIds(ids);

            let initialSelectedIds: string[] | null = null;
            let excludedFolderIds: string[] | null = null;
            try {
                const stored = await browser.storage.local.get(['selectedFolderIds', 'excludedFolderIds']);
                if (Array.isArray(stored.selectedFolderIds)) {
                    initialSelectedIds = stored.selectedFolderIds as string[];
                }
                if (Array.isArray(stored.excludedFolderIds)) {
                    excludedFolderIds = stored.excludedFolderIds as string[];
                }
            } catch (e) {
                console.error('Load folder selection error:', e);
            }

            let finalSelectedIds: string[];

            // 优先使用排除列表：先视为全部选中，再去掉之前排除的目录
            if (excludedFolderIds && excludedFolderIds.length) {
                const validExcluded = excludedFolderIds.filter(id => ids.includes(id));
                if (validExcluded.length) {
                    finalSelectedIds = ids.filter(id => !validExcluded.includes(id));
                } else {
                    finalSelectedIds = ids;
                }
            }
            else if (initialSelectedIds && initialSelectedIds.length) {
                const validSelected = initialSelectedIds.filter(id => ids.includes(id));
                finalSelectedIds = validSelected.length ? validSelected : ids;
            }
            else {
                finalSelectedIds = ids;
            }

            setSelectedFolderIds(finalSelectedIds);

            try {
                const excludedToSave = ids.filter(id => !finalSelectedIds.includes(id));
                await browser.storage.local.set({
                    selectedFolderIds: finalSelectedIds,
                    excludedFolderIds: excludedToSave,
                });
            } catch (e) {
                console.error('Save folder selection error:', e);
            }

            setFolderTree(tree);

        } catch (error) {
            console.error('Load folder tree error:', error);
            setTreeError('无法加载书签文件夹');
        } finally {
            setLoadingTree(false);
        }
    };

    const onSubmit = async (data: any) => {
        setSaving(true);
        setSaveMessage('');
        try {
            // 保存到storage.sync
            await optionsStorage.set({
                githubToken: data.githubToken || '',
                gistID: data.gistID || '',
                gistFileName: data.gistFileName || 'BookmarkHub',
                enableNotify: data.enableNotify !== false,
                autoSyncEnabled: data.autoSyncEnabled || false,
                autoSyncInterval: parseInt(data.autoSyncInterval) || 15,
                enableEncrypt: data.enableEncrypt || false,
                encryptPassword: data.encryptPassword || ''
            });

            console.log('✅ Configuration saved:', {
                hasToken: !!data.githubToken,
                hasGistID: !!data.gistID,
                fileName: data.gistFileName
            });

            setSaveMessage('✅ 配置已保存！正在检查初始同步...');

            // 等待一下让storage.onChanged触发
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 检查初始同步状态
            const { initialSyncCompleted, pendingInitialSync } = await browser.storage.local.get(['initialSyncCompleted', 'pendingInitialSync']);

            console.log('Initial sync status:', {
                initialSyncCompleted,
                pendingInitialSync
            });

            if (!initialSyncCompleted && !pendingInitialSync) {
                // 如果初始同步没有完成且没有pending，手动触发
                console.log('⚠️ Initial sync not triggered automatically, triggering manually...');

                // 发送消息到background让它执行初始同步
                try {
                    await browser.runtime.sendMessage({ name: 'triggerInitialSync' });
                } catch (err) {
                    console.error('Failed to trigger initial sync:', err);
                }
            }

            setSaveMessage('✅ 配置已保存！');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (error) {
            console.error('保存配置失败:', error);
            setSaveMessage('❌ 保存失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    const handleExportConfig = async () => {
        try {
            const config = await optionsStorage.getAll();
            const exportData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                config: {
                    githubToken: config.githubToken || '',
                    gistID: config.gistID || '',
                    gistFileName: config.gistFileName || 'BookmarkHub',
                    enableNotify: config.enableNotify !== false,
                    autoSyncEnabled: config.autoSyncEnabled || false,
                    autoSyncInterval: config.autoSyncInterval || 15,
                    enableEncrypt: config.enableEncrypt || false,
                    encryptPassword: config.encryptPassword || ''
                }
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bookmarkhub-config-${new Date().getTime()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setSaveMessage('✅ 配置已导出！');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (error) {
            console.error('Export config error:', error);
            setSaveMessage('❌ 导出失败');
            setTimeout(() => setSaveMessage(''), 3000);
        }
    };

    const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setImportMessage('');
        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            if (!importData.config) {
                throw new Error('Invalid config file format');
            }

            const configData = {
                githubToken: importData.config.githubToken || '',
                gistID: importData.config.gistID || '',
                gistFileName: importData.config.gistFileName || 'BookmarkHub',
                enableNotify: importData.config.enableNotify !== false,
                autoSyncEnabled: importData.config.autoSyncEnabled || false,
                autoSyncInterval: importData.config.autoSyncInterval || 15,
                enableEncrypt: importData.config.enableEncrypt || false,
                encryptPassword: importData.config.encryptPassword || ''
            };

            // 保存导入的配置
            await optionsStorage.set(configData);

            // 重新加载配置到表单
            await loadConfig();

            console.log('✅ Configuration imported:', {
                hasToken: !!configData.githubToken,
                hasGistID: !!configData.gistID,
                fileName: configData.gistFileName
            });

            setImportMessage('✅ 配置已导入！正在检查初始同步...');

            // 等待一下让storage.onChanged触发
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 检查初始同步状态
            const { initialSyncCompleted, pendingInitialSync } = await browser.storage.local.get(['initialSyncCompleted', 'pendingInitialSync']);

            console.log('Initial sync status after import:', {
                initialSyncCompleted,
                pendingInitialSync
            });

            if (!initialSyncCompleted && !pendingInitialSync) {
                // 如果初始同步没有完成且没有pending，手动触发
                console.log('⚠️ Initial sync not triggered automatically, triggering manually...');

                // 发送消息到background让它执行初始同步
                try {
                    await browser.runtime.sendMessage({ name: 'triggerInitialSync' });
                } catch (err) {
                    console.error('Failed to trigger initial sync:', err);
                }
            }

            setImportMessage('✅ 配置已导入！');
            setTimeout(() => setImportMessage(''), 3000);
        } catch (error) {
            console.error('Import config error:', error);
            setImportMessage('❌ 导入失败：配置文件格式错误');
            setTimeout(() => setImportMessage(''), 5000);
        }

        // 清除文件选择
        event.target.value = '';
    };

    useEffect(() => {
        return () => {
            if (bookmarkActionMessageTimer.current) {
                window.clearTimeout(bookmarkActionMessageTimer.current);
            }
        };
    }, []);

    const persistSelectedFolders = async () => {
        const excludedFolderIds = allFolderIds.filter(id => !selectedFolderIds.includes(id));
        await browser.storage.local.set({
            selectedFolderIds,
            excludedFolderIds,
        });
    };

    const handleConfirmUpload = async () => {
        setSyncing(true);
        try {
            // 1）仅在加密相关配置有变化时才写入 optionsStorage
            try {
                const stored = await optionsStorage.getAll();
                const values: any = getValues();

                const prevEnableEncrypt = !!stored.enableEncrypt;
                const prevEncryptPassword = stored.encryptPassword || '';

                const nextEnableEncrypt = !!values.enableEncrypt;
                const nextEncryptPasswordRaw = values.encryptPassword || '';

                const encryptChanged =
                    prevEnableEncrypt !== nextEnableEncrypt ||
                    prevEncryptPassword !== nextEncryptPasswordRaw;

                if (encryptChanged) {
                    // 如果关闭加密，则同时清空密码
                    await optionsStorage.set({
                        enableEncrypt: nextEnableEncrypt,
                        encryptPassword: nextEnableEncrypt ? nextEncryptPasswordRaw : '',
                    });
                }
            } catch (e) {
                console.error('Persist encrypt settings on folder selection failed:', e);
            }

            // 2）触发上传，并在成功后持久化文件夹选择
            const result = await browser.runtime.sendMessage({
                name: 'upload',
                selectedFolderIds,
            });

            if (result) {
                await persistSelectedFolders();
                showBookmarkActionMessage('✅ 已保存同步范围并触发上传');
            } else {
                showBookmarkActionMessage('❌ 保存选择或上传失败，请稍后重试');
            }
        } catch (error) {
            console.error('Confirm upload error:', error);
            showBookmarkActionMessage(`❌ 保存选择或上传失败：${(error as any)?.message || '请稍后重试'}`);
        } finally {
            setSyncing(false);
        }
    };

    const showBookmarkActionMessage = (message: string) => {
        setBookmarkActionMessage(message);
        if (bookmarkActionMessageTimer.current) {
            window.clearTimeout(bookmarkActionMessageTimer.current);
        }
        bookmarkActionMessageTimer.current = window.setTimeout(() => {
            setBookmarkActionMessage('');
            bookmarkActionMessageTimer.current = null;
        }, 4000);
    };

    const handleManualBookmarkUpload = () => {
        if (bookmarkFileInputRef.current) {
            bookmarkFileInputRef.current.click();
        }
    };

    const handleBookmarkFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        setBookmarkActionLoading('upload');
        try {
            const text = await file.text();
            let payload: any;
            try {
                payload = JSON.parse(text);
            } catch {
                throw new Error('文件内容不是有效的 JSON');
            }

            const result = await browser.runtime.sendMessage({
                name: 'importBookmarksFromFile',
                data: payload,
            });

            if (result && result.ok) {
                showBookmarkActionMessage('✅ 已从文件导入书签');
            } else {
                throw new Error(result?.error || 'Import failed');
            }
        } catch (error: any) {
            console.error('Manual bookmark file import error:', error);
            showBookmarkActionMessage(`❌ 导入失败：${error.message || '请检查文件格式'}`);
        } finally {
            setBookmarkActionLoading(null);
            event.target.value = '';
        }
    };

    const handleManualBookmarkDownload = async () => {
        setBookmarkActionLoading('download');
        try {
            const result = await browser.runtime.sendMessage({
                name: 'exportBookmarksToFile',
                selectedFolderIds,
            });

            if (!result || !result.ok || !result.data) {
                throw new Error(result?.error || 'Export failed');
            }

            const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bookmarkhub-bookmarks-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showBookmarkActionMessage('✅ 已导出书签到文件');
        } catch (error: any) {
            console.error('Manual bookmark export error:', error);
            showBookmarkActionMessage(`❌ 导出失败：${error.message || '请稍后重试'}`);
        } finally {
            setBookmarkActionLoading(null);
        }
    };

    const collectFolderIdsRecursive = (node: any, acc: string[]) => {
        if (!node || node.url) {
            return;
        }
        acc.push(node.id);
        if (node.children && node.children.length) {
            for (const child of node.children) {
                if (!child.url) {
                    collectFolderIdsRecursive(child, acc);
                }
            }
        }
    };

    const findFolderNodeById = (nodes: any[] | null, id: string): any | null => {
        if (!nodes) {
            return null;
        }
        const stack = [...nodes];
        while (stack.length) {
            const node = stack.pop();
            if (!node || node.url) {
                continue;
            }
            if (node.id === id) {
                return node;
            }
            if (node.children && node.children.length) {
                for (const child of node.children) {
                    stack.push(child);
                }
            }
        }
        return null;
    };

    const getDescendantFolderIds = (nodes: any[] | null, id: string): string[] => {
        const target = findFolderNodeById(nodes, id);
        if (!target) {
            return [id];
        }
        const result: string[] = [];
        collectFolderIdsRecursive(target, result);
        return result;
    };

    const handleToggleFolder = (id: string) => {
        if (folderTree && folderTree.length > 0) {
            const rootNode = folderTree[0];
            if (rootNode && rootNode.id === id) {
                return;
            }
        }
        const idsToToggle = getDescendantFolderIds(folderTree, id);
        setSelectedFolderIds(prev => {
            const allSelected = idsToToggle.every(folderId => prev.includes(folderId));
            if (allSelected) {
                return prev.filter(x => !idsToToggle.includes(x));
            }
            const nextSet = new Set(prev);
            idsToToggle.forEach(folderId => nextSet.add(folderId));
            return Array.from(nextSet);
        });
    };

    const renderFolderNodes = (nodes: any[] | undefined) => {

        if (!nodes || nodes.length === 0) {
            return null;
        }
        return (
            <ul className="folder-tree-list">
                {nodes.map((node, index) => {
                    if (node.url) {
                        return null;
                    }
                    const isRoot = !node.parentId && index === 0;
                    const hasChildFolder = node.children && node.children.some(child => !child.url);
                    return (
                        <li key={node.id}>
                            <div className="folder-tree-item">
                                <div className="folder-tree-main">
                                    <input
                                        type="checkbox"
                                        className="folder-checkbox"
                                        checked={selectedFolderIds.includes(node.id)}
                                        disabled={isRoot}
                                        onChange={isRoot ? undefined : () => handleToggleFolder(node.id)}
                                    />
                                    <span className="folder-icon" aria-hidden="true">
                                        <svg viewBox="0 0 20 20" role="presentation" focusable="false">
                                            <path d="M3 6.5h3.4l1.2 1.8H17a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
                                        </svg>
                                    </span>
                                    <span className="folder-title">{node.title || '(未命名文件夹)'}</span>
                                </div>
                                <span className="folder-count">{folderBookmarkCount[node.id] ?? 0}</span>
                            </div>
                            {hasChildFolder && renderFolderNodes(node.children)}
                        </li>
                    );
                })}
            </ul>
        );
    };

    useEffect(() => {
        loadConfig();
        loadFolderTree();
    }, []);

    return (
        <Container className="options-root">
            <div className="options-page-header">
                <div className="options-heading">
                    <p className="options-eyebrow">BookmarkHub</p>
                    <h1>同步设置中心</h1>
                    <p>统一的卡片式布局，快速完成 GitHub 配置与同步范围选择。</p>
                </div>
                <div className="options-page-meta">
                    <div className="options-meta-item">
                        <span>已选文件夹</span>
                        <strong>{folderSelectionStats.selected}</strong>
                    </div>
                    <div className="options-meta-item">
                        <span>已排除</span>
                        <strong>{folderSelectionStats.excluded}</strong>
                    </div>
                    <div className="options-meta-item">
                        <span>覆盖率</span>
                        <strong>{folderSelectionStats.coverage}%</strong>
                    </div>
                </div>
            </div>
            <Row className="options-layout">
                <Col xs={12} md={6} lg={6} className="options-col">

                    <Form id='formOptions' name='formOptions' onSubmit={handleSubmit(onSubmit)} className="options-form">
                        <div className="options-card">
                            <div className="options-card-header">
                                <div>
                                    <p className="options-card-eyebrow">GitHub</p>
                                    <h2 className="options-card-title">云同步凭据</h2>
                                    <p className="options-card-desc">填写 GitHub Token 与 Gist 信息，BookmarkHub 将自动安全地同步您的书签。</p>
                                </div>
                            </div>
                            <div className="options-card-body">
                                <div className="options-section">
                                    <div className="options-section-title">访问凭据</div>
                                    <div className="options-section-body">
                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('githubToken')}</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <InputGroup size="sm">
                                                    <Form.Control name="githubToken" ref={register} type="text" placeholder="GitHub Token" size="sm" />
                                                    <InputGroup.Append>
                                                        <Button variant="outline-secondary" as="a" target="_blank" href="https://github.com/settings/tokens/new" size="sm">获取 Token</Button>
                                                    </InputGroup.Append>
                                                </InputGroup>
                                            </Col>
                                        </Form.Group>

                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistID')}</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <Form.Control name="gistID" ref={register} type="text" placeholder="Gist ID" size="sm" />
                                            </Col>
                                        </Form.Group>

                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistFileName')}</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <Form.Control name="gistFileName" ref={register} type="text" placeholder="Gist 文件名" size="sm" defaultValue="BookmarkHub" />
                                            </Col>
                                        </Form.Group>
                                    </div>
                                </div>

                                <div className="options-section">
                                    <div className="options-section-title">同步偏好</div>
                                    <div className="options-section-body" style={{ marginBottom: 0 }}>
                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('enableNotifications')}</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <Form.Check
                                                    id="enableNotify"
                                                    name="enableNotify"
                                                    ref={register}
                                                    type="switch"
                                                    defaultChecked={true}
                                                />
                                            </Col>
                                        </Form.Group>

                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('autoSyncEnabled')}</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <Form.Check
                                                    id="autoSyncEnabled"
                                                    name="autoSyncEnabled"
                                                    ref={register}
                                                    type="switch"
                                                    defaultChecked={false}
                                                />
                                            </Col>
                                        </Form.Group>
                                        <Row className="options-form-helper-row">
                                            <Col sm={{ span: 9, offset: 3 }} lg={{ span: 10, offset: 2 }} xs={{ span: 9, offset: 3 }}>
                                                <Form.Text className="text-muted">
                                                    定期从远程拉取书签并合并到本地（不会删除本地书签）
                                                </Form.Text>
                                            </Col>
                                        </Row>

                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('autoSyncInterval')}</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <Form.Control
                                                    as="select"
                                                    name="autoSyncInterval"
                                                    ref={register}
                                                    size="sm"
                                                    defaultValue="15"
                                                >
                                                    <option value="5">{browser.i18n.getMessage('autoSyncInterval5')}</option>
                                                    <option value="15">{browser.i18n.getMessage('autoSyncInterval15')}</option>
                                                    <option value="30">{browser.i18n.getMessage('autoSyncInterval30')}</option>
                                                    <option value="60">{browser.i18n.getMessage('autoSyncInterval60')}</option>
                                                </Form.Control>
                                            </Col>
                                        </Form.Group>
                                        <Row className="options-form-helper-row">
                                            <Col sm={{ span: 9, offset: 3 }} lg={{ span: 10, offset: 2 }} xs={{ span: 9, offset: 3 }}>
                                                <Form.Text className="text-muted">
                                                    自动同步的时间间隔
                                                </Form.Text>
                                            </Col>
                                        </Row>

                                        <Form.Group as={Row} className="options-form-group">
                                            <Form.Label column="sm" sm={3} lg={2} xs={3} className="options-label-danger">启用加密</Form.Label>
                                            <Col sm={9} lg={10} xs={9}>
                                                <Form.Check
                                                    id="enableEncrypt"
                                                    name="enableEncrypt"
                                                    ref={register}
                                                    type="switch"
                                                    defaultChecked={false}
                                                />
                                            </Col>
                                        </Form.Group>
                                        <Row className="options-form-helper-row">
                                            <Col sm={{ span: 9, offset: 3 }} lg={{ span: 10, offset: 2 }} xs={{ span: 9, offset: 3 }}>
                                                <Form.Text className="text-muted">
                                                    使用自定义密码对远程数据加密存储
                                                </Form.Text>
                                            </Col>
                                        </Row>

                                        {encryptEnabled && (
                                            <Form.Group as={Row} className="options-form-group">
                                                <Form.Label column="sm" sm={3} lg={2} xs={3}>加密密码</Form.Label>
                                                <Col sm={9} lg={10} xs={9}>
                                                    <div className="options-password-input-wrapper">
                                                        <Form.Control
                                                            name="encryptPassword"
                                                            ref={register}
                                                            type={showEncryptPassword ? 'text' : 'password'}
                                                            placeholder="请输入用于加密的密码"
                                                            size="sm"
                                                        />
                                                        <Button
                                                            variant="link"
                                                            size="sm"
                                                            className={`options-password-toggle-btn ${showEncryptPassword ? 'options-password-toggle-btn--active' : ''}`}
                                                            onClick={() => setShowEncryptPassword(prev => !prev)}
                                                            aria-label={showEncryptPassword ? '隐藏密码' : '查看密码'}
                                                        >
                                                            <span className="options-password-toggle-icon" aria-hidden="true">
                                                                {showEncryptPassword ? (
                                                                    <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                                        <path d="M3 3l18 18" />
                                                                        <path d="M10.58 10.58A3 3 0 0 0 13.42 13.42" />
                                                                        <path d="M9.88 5.51A9.77 9.77 0 0 1 12 5c7 0 10 7 10 7a14.48 14.48 0 0 1-3.17 4.19" />
                                                                        <path d="M6.61 6.61C4.24 7.88 2.54 9.94 2 12c0 0 3 7 10 7a9.52 9.52 0 0 0 4.39-1.06" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                                                                        <circle cx="12" cy="12" r="3" />
                                                                    </svg>
                                                                )}
                                                            </span>
                                                        </Button>
                                                    </div>
                                                </Col>
                                            </Form.Group>
                                        )}
                                        {encryptEnabled && (
                                            <Row className="options-form-helper-row">
                                                <Col sm={{ span: 9, offset: 3 }} lg={{ span: 10, offset: 2 }} xs={{ span: 9, offset: 3 }}>
                                                    <Form.Text className="text-muted">
                                                        仅保存在本地和配置导出文件中，请妥善保管
                                                    </Form.Text>
                                                </Col>
                                            </Row>
                                        )}
                                    </div>
                                </div>

                                <div className="options-form-actions">
                                    <div className="options-action-buttons">
                                        <Button
                                            type="submit"
                                            disabled={saving}
                                            className="options-action-button options-action-button--save"
                                        >
                                            <span className="options-action-icon" aria-hidden="true">
                                                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                    <path d="M12 5v8" />
                                                    <path d="M9 10l3 3 3-3" />
                                                    <path d="M6 13v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" />
                                                    <path d="M15 5h1a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </span>
                                            <span className="options-action-copy">
                                                <span className="options-action-title">{saving ? '保存中…' : '保存配置'}</span>
                                                <span className="options-action-subtitle">即时应用当前设置</span>
                                            </span>
                                        </Button>
                                        <Button
                                            type="button"
                                            className="options-action-button options-action-button--export"
                                            onClick={handleExportConfig}
                                        >
                                            <span className="options-action-icon" aria-hidden="true">
                                                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                    <path d="M12 19V7" />
                                                    <path d="M9 10l3-3 3 3" />
                                                    <path d="M5 19h14" />
                                                </svg>
                                            </span>
                                            <span className="options-action-copy">
                                                <span className="options-action-title">导出配置</span>
                                                <span className="options-action-subtitle">备份为 JSON 文件</span>
                                            </span>
                                        </Button>

                                        <label htmlFor="importConfigFile" className="options-import-label">
                                            <Button
                                                type="button"
                                                as="span"
                                                className="options-action-button options-action-button--import"
                                            >
                                                <span className="options-action-icon" aria-hidden="true">
                                                    <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                        <path d="M12 5v12" />
                                                        <path d="M9 14l3 3 3-3" />
                                                        <path d="M5 5h14" />
                                                    </svg>
                                                </span>
                                                <span className="options-action-copy">
                                                    <span className="options-action-title">导入配置</span>
                                                    <span className="options-action-subtitle">从 JSON 恢复设置</span>
                                                </span>
                                            </Button>
                                        </label>

                                        <input
                                            id="importConfigFile"
                                            type="file"
                                            accept=".json"
                                            onChange={handleImportConfig}
                                            style={{ display: 'none' }}
                                        />

                                        <input
                                            id="importBookmarksFile"
                                            type="file"
                                            accept=".json"
                                            ref={bookmarkFileInputRef}
                                            onChange={handleBookmarkFileChange}
                                            style={{ display: 'none' }}
                                        />

                                        <Button
                                            type="button"
                                            className="options-action-button options-action-button--bookmark-upload"
                                            disabled={bookmarkActionLoading === 'upload'}
                                            onClick={handleManualBookmarkUpload}
                                        >
                                            <span className="options-action-icon" aria-hidden="true">
                                                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                    <path d="M4 14a4 4 0 0 1 4-4h1" />
                                                    <path d="M13 10h3a4 4 0 1 1 0 8h-2" />
                                                    <path d="M12 16V6" />
                                                    <path d="M9 9l3-3 3 3" />
                                                </svg>
                                            </span>
                                            <span className="options-action-copy">
                                                <span className="options-action-title">上传书签</span>
                                                <span className="options-action-subtitle">从外部文件上传书签到浏览器</span>
                                            </span>
                                        </Button>

                                        <Button
                                            type="button"
                                            className="options-action-button options-action-button--bookmark-download"
                                            disabled={bookmarkActionLoading === 'download'}
                                            onClick={handleManualBookmarkDownload}
                                        >
                                            <span className="options-action-icon" aria-hidden="true">
                                                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                    <path d="M20 13a4 4 0 0 0-4-4h-1" />
                                                    <path d="M11 9H8a4 4 0 1 0 0 8h2" />
                                                    <path d="M12 8v10" />
                                                    <path d="M9 15l3 3 3-3" />
                                                </svg>
                                            </span>
                                            <span className="options-action-copy">
                                                <span className="options-action-title">导出书签</span>
                                                <span className="options-action-subtitle">从本地书签导出到外部文件</span>
                                            </span>
                                        </Button>
                                    </div>

                                    <div className="options-feedback">
                                        {saveMessage && <span className={saveMessage.startsWith('✅') ? 'feedback-success' : 'feedback-error'}>{saveMessage}</span>}
                                        {importMessage && <span className={importMessage.startsWith('✅') ? 'feedback-success' : 'feedback-error'}>{importMessage}</span>}
                                        {bookmarkActionMessage && <span className={bookmarkActionMessage.startsWith('✅') ? 'feedback-success' : 'feedback-error'}>{bookmarkActionMessage}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Form>
                </Col>
                <Col xs={12} md={6} lg={6} className="options-col">

                    <div className="options-card folder-tree-card">
                        <div className="options-card-header">
                            <div>
                                <p className="options-card-eyebrow">书签</p>
                                <h2 className="options-card-title">同步范围预览</h2>
                                <p className="options-card-desc">只需勾选即可定义同步范围，BookmarkHub 会记住您的选择。</p>
                            </div>
                        </div>
                        <div className="options-card-body">
                            <div className="folder-tree-toolbar">
                                <p className="options-card-desc" style={{ marginBottom: 0 }}>
                                    {loadingTree ? '正在加载书签…' : '勾选任意文件夹即可包含其全部子目录。'}
                                </p>
                                <div className="folder-tree-toolbar-actions">
                                    <Button
                                        type="button"
                                        className="folder-tree-action-button folder-tree-action-button--refresh"
                                        onClick={loadFolderTree}
                                        disabled={loadingTree}
                                    >
                                        <span className="folder-tree-action-icon" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                <path d="M21 12a9 9 0 1 1-9-9" />
                                                <path d="M21 3v9h-9" />
                                            </svg>
                                        </span>
                                        <span className="folder-tree-action-label">
                                            {loadingTree ? '刷新中…' : '刷新'}
                                        </span>
                                    </Button>
                                    <Button
                                        type="button"
                                        className="folder-tree-action-button folder-tree-action-button--save"
                                        onClick={handleConfirmUpload}
                                        disabled={syncing || !folderTree}
                                    >
                                        <span className="folder-tree-action-icon" aria-hidden="true">
                                            <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                                                <circle cx="12" cy="12" r="10" />
                                                <path d="M9 12.5l2 2L15 10" />
                                            </svg>
                                        </span>
                                        <span className="folder-tree-action-label">
                                            {syncing ? '上传中…' : '保存选择'}
                                        </span>
                                    </Button>
                                </div>
                            </div>

                            <div className="folder-tree-body">
                                {treeError && <div className="folder-tree-error">{treeError}</div>}
                                {!treeError && !folderTree && loadingTree && (
                                    <div className="folder-tree-empty">正在加载书签...</div>
                                )}
                                {!treeError && folderTree && !loadingTree && (
                                    renderFolderNodes(folderTree) || <div className="folder-tree-empty">没有找到任何书签文件夹。</div>
                                )}
                            </div>
                            <div className="folder-tree-footer">
                                <p className="options-note">保存选择后，上传操作将仅同步已选文件夹，避免私密或临时书签被推送到远程。</p>
                            </div>
                        </div>
                    </div>
                </Col>

            </Row>
        </Container >
    )
}

const OptionsWithModal: React.FC = () => {
    return (
        <>
            <Popup />
            <InitialSyncModal />
        </>
    );
};

const InitialSyncModal: React.FC = () => {
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [localBookmarkCount, setLocalBookmarkCount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        const checkPendingSync = async () => {
            const data = await browser.storage.local.get(['pendingInitialSync', 'localBookmarkCount']);
            if (data.pendingInitialSync) {
                setLocalBookmarkCount(data.localBookmarkCount || 0);
                setShowSyncModal(true);
                await browser.storage.local.remove(['pendingInitialSync']);
            }
        };
        
        checkPendingSync();
        
        const messageListener = (msg: any) => {
            if (msg.name === 'showSyncChoice') {
                setLocalBookmarkCount(msg.localCount);
                setShowSyncModal(true);
            }
        };
        
        browser.runtime.onMessage.addListener(messageListener);
        
        return () => {
            browser.runtime.onMessage.removeListener(messageListener);
        };
    }, []);

    const handleUpload = async () => {
        setIsProcessing(true);
        try {
            await browser.runtime.sendMessage({ name: 'initialSyncUpload' });
            setShowSyncModal(false);
        } catch (error) {
            console.error('Upload error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = async () => {
        setIsProcessing(true);
        try {
            await browser.runtime.sendMessage({ name: 'initialSyncDownload' });
            setShowSyncModal(false);
        } catch (error) {
            console.error('Download error:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = async () => {
        await browser.runtime.sendMessage({ name: 'cancelInitialSync' });
        setShowSyncModal(false);
    };

    return (
        <Modal show={showSyncModal} onHide={handleCancel} backdrop="static">
            <Modal.Header closeButton>
                <Modal.Title>{browser.i18n.getMessage('initialSyncTitle')}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {browser.i18n.getMessage('initialSyncMessage').replace('{count}', String(localBookmarkCount))}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={handleDownload} disabled={isProcessing}>
                    {browser.i18n.getMessage('initialSyncDownload')}
                </Button>
                <Button variant="primary" onClick={handleUpload} disabled={isProcessing}>
                    {browser.i18n.getMessage('initialSyncUpload')}
                </Button>
                <Button variant="link" onClick={handleCancel} disabled={isProcessing}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <OptionsWithModal />
    </React.StrictMode>,
  );
  