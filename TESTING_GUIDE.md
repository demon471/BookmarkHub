# BookmarkHub - 初始同步功能测试指南

## 测试准备

### 环境设置
1. 安装依赖：`pnpm install`
2. 构建扩展：`npm run build`
3. 在Chrome中加载扩展：
   - 打开 `chrome://extensions/`
   - 启用"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `.output/chrome-mv3` 目录

### 测试工具
- Chrome DevTools Application标签：查看storage内容
- Chrome DevTools Console：查看日志输出
- GitHub Gist：准备测试用的Gist

## 测试场景

### 场景1：首次配置，本地无书签，远程有数据

**目的：** 验证自动下载功能

**前置条件：**
```javascript
// 在Console中执行
browser.storage.local.clear();
// 删除所有本地书签
```

**测试步骤：**
1. 在GitHub创建一个Gist，添加一些测试书签数据
2. 打开扩展的Options页面
3. 填写GitHub Token
4. 填写Gist ID
5. 填写Gist File Name（默认"BookmarkHub"）

**预期结果：**
- ✅ 自动从远程下载书签到本地
- ✅ 浏览器书签栏出现下载的书签
- ✅ storage.local中`initialSyncCompleted`设置为true
- ✅ 没有弹出Modal对话框

**验证命令：**
```javascript
browser.storage.local.get(['initialSyncCompleted']).then(console.log);
browser.bookmarks.getTree().then(console.log);
```

---

### 场景2：首次配置，本地无书签，远程也无数据

**目的：** 验证空数据处理

**前置条件：**
```javascript
browser.storage.local.clear();
// 删除所有本地书签
// 确保Gist文件不存在或为空
```

**测试步骤：**
1. 配置Token和Gist ID
2. 确保Gist文件不存在或为空

**预期结果：**
- ✅ 不执行任何同步操作
- ✅ `initialSyncCompleted`标记设置为true
- ✅ 没有弹出Modal
- ✅ 没有错误提示

---

### 场景3：首次配置，本地有书签，用户选择上传

**目的：** 验证Modal显示和上传功能

**前置条件：**
```javascript
browser.storage.local.clear();
// 手动创建一些测试书签
browser.bookmarks.create({
  title: '测试书签1',
  url: 'https://example.com'
});
```

**测试步骤：**
1. 配置Token和Gist ID
2. 等待Modal对话框出现
3. 查看对话框显示的书签数量是否正确
4. 点击"上传到远程（覆盖远程）"按钮

**预期结果：**
- ✅ Modal对话框正确显示
- ✅ 显示正确的本地书签数量
- ✅ 三个按钮都可用（上传、下载、取消）
- ✅ 点击上传后Modal关闭
- ✅ 本地书签成功上传到Gist
- ✅ `initialSyncCompleted`设置为true
- ✅ `pendingInitialSync`被清除

**验证命令：**
```javascript
browser.storage.local.get(['initialSyncCompleted', 'pendingInitialSync']).then(console.log);
// 检查Gist内容
```

---

### 场景4：首次配置，本地有书签，用户选择下载

**目的：** 验证下载覆盖功能

**前置条件：**
```javascript
browser.storage.local.clear();
// 本地创建一些书签
// 远程Gist有不同的书签数据
```

**测试步骤：**
1. 配置Token和Gist ID
2. Modal出现后，点击"从远程拉取（覆盖本地）"按钮
3. 查看本地书签是否被远程数据覆盖

**预期结果：**
- ✅ Modal正确显示
- ✅ 点击下载后Modal关闭
- ✅ 本地原有书签被清除
- ✅ 远程书签成功下载
- ✅ 标记正确设置

---

### 场景5：配置已完成，再次修改配置

**目的：** 验证不重复触发

**前置条件：**
```javascript
// initialSyncCompleted已存在
browser.storage.local.set({ initialSyncCompleted: true });
```

**测试步骤：**
1. 修改Token或Gist ID
2. 观察是否触发初始同步

**预期结果：**
- ✅ 不弹出Modal
- ✅ 不执行自动同步
- ✅ Console没有初始同步相关日志
- ✅ 现有的书签保持不变

---

### 场景6：Options页面未打开时配置完成

**目的：** 验证延迟处理机制

**前置条件：**
```javascript
browser.storage.local.clear();
// 创建本地书签
```

**测试步骤：**
1. 关闭Options页面
2. 在Console中模拟配置变化：
```javascript
browser.storage.sync.set({
  githubToken: 'your_token',
  gistID: 'your_gist_id',
  gistFileName: 'BookmarkHub'
});
```
3. 等待1秒后打开Options页面
4. 观察Modal是否自动显示

**预期结果：**
- ✅ 打开Options页面时Modal自动显示
- ✅ 显示正确的书签数量
- ✅ `pendingInitialSync`状态被正确处理

---

## 功能验证清单

### 核心功能
- [ ] 配置变化触发初始同步
- [ ] 本地无数据自动下载
- [ ] 本地有数据显示Modal
- [ ] 上传按钮正确工作
- [ ] 下载按钮正确工作
- [ ] 取消按钮正确工作

### 技术实现
- [ ] 防抖机制工作（快速修改配置只触发一次）
- [ ] `initialSyncCompleted`标记正确防止重复触发
- [ ] `pendingInitialSync`状态正确处理
- [ ] 消息监听器正确清理（无内存泄漏）
- [ ] 错误处理完善

### UI/UX
- [ ] Modal显示美观
- [ ] 按钮点击反馈及时
- [ ] isProcessing状态防止重复点击
- [ ] Modal backdrop="static"防止误关闭

### 国际化
- [ ] 英文文本显示正确
- [ ] 中文文本显示正确
- [ ] {count}占位符正确替换

### 兼容性
- [ ] 不影响现有的手动上传功能
- [ ] 不影响现有的手动下载功能
- [ ] 不影响现有的清空功能
- [ ] 不影响现有的自动同步功能（每5秒）

---

## 调试技巧

### 查看Storage内容
```javascript
// 查看local storage
browser.storage.local.get().then(console.log);

// 查看sync storage
browser.storage.sync.get().then(console.log);

// 清空storage
browser.storage.local.clear();
```

### 查看书签
```javascript
browser.bookmarks.getTree().then(tree => {
  console.log(JSON.stringify(tree, null, 2));
});
```

### 触发初始同步
```javascript
// 重置标记
browser.storage.local.remove(['initialSyncCompleted', 'pendingInitialSync']);

// 模拟配置变化
browser.storage.sync.set({
  githubToken: 'your_token',
  gistID: 'your_gist_id'
});
```

### 查看Console日志
关键日志输出：
- `performInitialSync error:` - 初始同步错误
- `Initial sync check remote error:` - 远程检查错误
- `Upload error:` - 上传错误
- `Download error:` - 下载错误

---

## 性能测试

### 防抖机制
1. 快速修改Token字段10次
2. 观察Console日志
3. 应该只触发1次初始同步检查

### API调用频率
1. 检查`smartSync`的API调用频率
2. 应该有3秒的最小间隔限制

---

## 已知限制

1. **TypeScript类型声明**：开发环境可能显示类型错误，但不影响运行
2. **BOM字符**：俄语文件已修复BOM问题
3. **浏览器兼容性**：主要在Chrome测试，Firefox可能需要额外测试

---

## 测试报告模板

```
测试日期：____年__月__日
测试人员：________
浏览器版本：Chrome ______

场景1：[✓/✗] ____________
场景2：[✓/✗] ____________
场景3：[✓/✗] ____________
场景4：[✓/✗] ____________
场景5：[✓/✗] ____________
场景6：[✓/✗] ____________

发现的问题：
1. ________________
2. ________________

建议改进：
1. ________________
2. ________________
```

---

## 自动化测试建议（未来）

考虑使用以下工具实现自动化测试：
- Playwright - 浏览器自动化
- Jest - 单元测试
- Chrome Extension Testing Framework

示例测试代码结构：
```typescript
describe('Initial Sync Feature', () => {
  it('should auto-download when local is empty', async () => {
    // 测试代码
  });
  
  it('should show modal when local has bookmarks', async () => {
    // 测试代码
  });
});
```

