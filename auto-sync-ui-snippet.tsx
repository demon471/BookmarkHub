
{/* 将以下代码插入到 options.tsx 第452行之后（enableNotify 的 </Form.Group> 之后） */}

                            <Form.Group as={Row}>
                                <Form.Label column="sm" sm={3} lg={2} xs={3}>{browser.i18n.getMessage('autoSyncEnabled')}</Form.Label>
                                <Col sm={9} lg={10} xs={9}>
                                    <Form.Check
                                        id="autoSyncEnabled"
                                        name="autoSyncEnabled"
                                        ref={register}
                                        type="switch"
                                        defaultChecked={false}
                                    />
                                    <Form.Text className="text-muted">
                                        定期从远程拉取书签并合并到本地（不会删除本地书签）
                                    </Form.Text>
                                </Col>
                            </Form.Group>

                            <Form.Group as={Row}>
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
                                    <Form.Text className="text-muted">
                                        自动同步的时间间隔
                                    </Form.Text>
                                </Col>
                            </Form.Group>

{/* 插入位置说明：
    
    在 options.tsx 文件中找到：
    
    第441-452行（使用消息通知的代码块）：
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
    </Form.Group>  ← 这是第452行
    
    （在这里插入上面的代码，保持28个空格的缩进）
    
    第454行开始是保存按钮：
    <Form.Group as={Row}>
        <Form.Label column="sm" sm={3} lg={2} xs={3}></Form.Label>
        ...
*/}
