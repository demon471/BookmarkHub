import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client';
import { Container, Form, Button, Col, Row, InputGroup, Modal } from 'react-bootstrap';
// @ts-ignore
import { useForm } from "react-hook-form";
import 'bootstrap/dist/css/bootstrap.min.css';
import './options.css'
import optionsStorage from '../../utils/optionsStorage'
const Popup: React.FC = () => {
    const { register, setValue, handleSubmit } = useForm();
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [importMessage, setImportMessage] = useState('');
    
    const loadConfig = async () => {
        // 加载现有配置
        const options = await optionsStorage.getAll();
        setValue('githubToken', options.githubToken || '');
        setValue('gistID', options.gistID || '');
        setValue('gistFileName', options.gistFileName || 'BookmarkHub');
        setValue('enableNotify', options.enableNotify !== false);
    };
    
    useEffect(() => {
        loadConfig();
    }, []);

    const onSubmit = async (data: any) => {
        setSaving(true);
        setSaveMessage('');
        try {
            // 保存到storage.sync
            await optionsStorage.set({
                githubToken: data.githubToken || '',
                gistID: data.gistID || '',
                gistFileName: data.gistFileName || 'BookmarkHub',
                enableNotify: data.enableNotify !== false
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
                    enableNotify: config.enableNotify !== false
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
                enableNotify: importData.config.enableNotify !== false
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

    return (
        <Container>
            <Form id='formOptions' name='formOptions' onSubmit={handleSubmit(onSubmit)}>
                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('githubToken')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <InputGroup size="sm">
                            <Form.Control name="githubToken" ref={register} type="text" placeholder="github token" size="sm" />
                            <InputGroup.Append>
                                <Button variant="outline-secondary" as="a" target="_blank" href="https://github.com/settings/tokens/new" size="sm">Get Token</Button>
                            </InputGroup.Append>
                        </InputGroup>
                    </Col>
                </Form.Group>

                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistID')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <Form.Control name="gistID" ref={register} type="text" placeholder="gist ID" size="sm" />
                    </Col>
                </Form.Group>
                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('gistFileName')}</Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <Form.Control name="gistFileName" ref={register} type="text" placeholder="gist file name" size="sm" defaultValue="BookmarkHub" />
                    </Col>
                </Form.Group>
                <Form.Group as={Row}>
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
                <Form.Group as={Row}>
                    <Form.Label column="sm" sm={3} lg={2} xs={3}></Form.Label>
                    <Col sm={9} lg={10} xs={9}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <Button type="submit" variant="primary" disabled={saving} size="sm">
                                {saving ? '保存中...' : '💾 保存配置'}
                            </Button>
                            <Button 
                                type="button" 
                                variant="success" 
                                size="sm" 
                                onClick={handleExportConfig}
                            >
                                📤 导出配置
                            </Button>
                            <label htmlFor="importConfigFile" style={{ margin: 0 }}>
                                <Button 
                                    type="button" 
                                    variant="info" 
                                    size="sm"
                                    as="span"
                                    style={{ cursor: 'pointer' }}
                                >
                                    📥 导入配置
                                </Button>
                            </label>
                            <input 
                                id="importConfigFile"
                                type="file" 
                                accept=".json"
                                onChange={handleImportConfig}
                                style={{ display: 'none' }}
                            />
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            {saveMessage && <span style={{ color: saveMessage.startsWith('✅') ? 'green' : 'red', marginRight: '10px' }}>{saveMessage}</span>}
                            {importMessage && <span style={{ color: importMessage.startsWith('✅') ? 'green' : 'red' }}>{importMessage}</span>}
                        </div>
                    </Col>
                </Form.Group>
            </Form>
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
  