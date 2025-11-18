import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType, BrowserType } from '../utils/models'
import { Bookmarks } from 'wxt/browser'
export default defineBackground(() => {

  browser.runtime.onInstalled.addListener(async (c) => {
    console.log('🎉 Extension installed/updated');
    
    // 检查是否首次安装
    if (c.reason === 'install') {
      // 首次安装，检查GitHub配置
      const setting = await Setting.build();
      if (!setting.githubToken || !setting.gistID) {
        console.log('📌 First install: Opening options page for configuration');
        // 打开配置页面
        await browser.runtime.openOptionsPage();
        // 显示欢迎通知
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('extensionName') || 'BookmarkHub',
          message: '欢迎使用！请先配置GitHub Token和Gist ID以启用书签同步功能。'
        });
      }
    }
    
    // 初始化本地书签计数
    await refreshLocalCount();
    console.log('✅ Extension installed, ready to sync on bookmark changes');
  });

  let curOperType = OperType.NONE;
  let curBrowserType = BrowserType.CHROME;
  let configChangeTimer: ReturnType<typeof setTimeout> | null = null;
  let badgeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isClearing = false; // 标记是否正在清空书签，防止触发同步
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'upload') {
      curOperType = OperType.SYNC
      const selectedFolderIds = Array.isArray(msg.selectedFolderIds) ? (msg.selectedFolderIds as string[]) : undefined;
      uploadBookmarks(selectedFolderIds).then(() => {
        curOperType = OperType.NONE
        // Badge handled by uploadBookmarks()
        refreshLocalCount();
        sendResponse(true);
      });
    }
    if (msg.name === 'download') {
      curOperType = OperType.SYNC
      downloadBookmarks().then(() => {
        curOperType = OperType.NONE
        // Badge handled by downloadBookmarks()
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'removeAll') {
      curOperType = OperType.REMOVE
      isClearing = true; // 设置清空标记
      clearBookmarkTree().then(async () => {
        curOperType = OperType.NONE
        await showSyncBadge('success');
        await refreshLocalCount();
        // 清空后重置初始同步状态，让用户重新选择
        await browser.storage.local.set({ initialSyncCompleted: false });
        await browser.storage.local.remove(['pendingInitialSync', 'localBookmarkCount', 'lastBookmarkStructure']);
        console.log('🗑️ Local bookmarks cleared, initial sync reset');
        isClearing = false; // 清除标记
        sendResponse(true);
      }).catch(async (error) => {
        console.error('Clear bookmarks error:', error);
        curOperType = OperType.NONE;
        isClearing = false;
        sendResponse(false);
      });

    }
    if (msg.name === 'setting') {
      browser.runtime.openOptionsPage().then(() => {
        sendResponse(true);
      });
    }
    if (msg.name === 'initialSyncUpload') {
      console.log('📤 Initial sync: Uploading local bookmarks to remote...');
      curOperType = OperType.SYNC;
      const selectedFolderIds = Array.isArray(msg.selectedFolderIds) ? (msg.selectedFolderIds as string[]) : undefined;
      uploadBookmarks(selectedFolderIds).then(async () => {
        curOperType = OperType.NONE;
        console.log('✅ Initial sync upload completed');
        await browser.storage.local.set({ initialSyncCompleted: true });
        await browser.storage.local.remove(['pendingInitialSync', 'localBookmarkCount']);
        // Update bookmark structure tracking
        await updateBookmarkStructureTracking();
        sendResponse(true);
      }).catch(async (error) => {
        console.error('❌ Initial sync upload failed:', error);
        curOperType = OperType.NONE;
        sendResponse(false);
      });
    }
    if (msg.name === 'initialSyncDownload') {
      console.log('📥 Initial sync: Downloading remote bookmarks to local...');
      curOperType = OperType.SYNC;
      downloadBookmarks().then(async () => {
        curOperType = OperType.NONE;
        console.log('✅ Initial sync download completed');
        await browser.storage.local.set({ initialSyncCompleted: true });
        await browser.storage.local.remove(['pendingInitialSync', 'localBookmarkCount']);
        // Update bookmark structure tracking
        await updateBookmarkStructureTracking();
        sendResponse(true);
      }).catch(async (error) => {
        console.error('❌ Initial sync download failed:', error);
        curOperType = OperType.NONE;
        sendResponse(false);
      });
    }
    if (msg.name === 'cancelInitialSync') {
      console.log('❌ Initial sync cancelled by user');
      (async () => {
        await browser.storage.local.set({ initialSyncCompleted: true });
        await browser.storage.local.remove(['pendingInitialSync', 'localBookmarkCount']);
        // Update bookmark structure tracking
        await updateBookmarkStructureTracking();
        sendResponse(true);
      })();
    }
    if (msg.name === 'triggerInitialSync') {
      console.log('🔄 Manual trigger: Starting initial sync from options page...');
      (async () => {
        try {
          await performInitialSync();
          sendResponse(true);
        } catch (error) {
          console.error('Failed to trigger initial sync:', error);
          sendResponse(false);
        }
      })();
    }
    return true;
  });
  browser.bookmarks.onCreated.addListener(async (id, info) => {
    if (curOperType === OperType.NONE && !isClearing) {
      // console.log("onCreated", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    } else if (isClearing) {
      console.log('⏸️ Bookmark created during clear operation, skipping sync');
    }
  });
  browser.bookmarks.onChanged.addListener(async (id, info) => {
    if (curOperType === OperType.NONE && !isClearing) {
      // console.log("onChanged", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    } else if (isClearing) {
      console.log('⏸️ Bookmark changed during clear operation, skipping sync');
    }
  })
  browser.bookmarks.onMoved.addListener(async (id, info) => {
    if (curOperType === OperType.NONE && !isClearing) {
      // console.log("onMoved", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    } else if (isClearing) {
      console.log('⏸️ Bookmark moved during clear operation, skipping sync');
    }
  })
  browser.bookmarks.onRemoved.addListener(async (id, info) => {
    if (curOperType === OperType.NONE && !isClearing) {
      console.log("Bookmark removed:", id, info);
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    } else if (isClearing) {
      console.log('⏸️ Bookmark removed during clear operation, skipping sync');
    }
  })

  // Listen for configuration changes to trigger initial sync
  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName === 'sync' && (changes.githubToken || changes.gistID)) {
      console.log('📝 GitHub configuration changed, checking...');
      if (configChangeTimer) clearTimeout(configChangeTimer);
      configChangeTimer = setTimeout(async () => {
        const setting = await Setting.build();
        if (setting.githubToken && setting.gistID && setting.gistFileName) {
          console.log('✅ GitHub configuration complete!');
          console.log('   - Token:', setting.githubToken ? '✓' : '✗');
          console.log('   - Gist ID:', setting.gistID ? '✓' : '✗');
          console.log('   - Gist FileName:', setting.gistFileName);
          
          // 重置初始同步标记，允许重新执行初始同步逻辑
          await browser.storage.local.set({ initialSyncCompleted: false });
          await browser.storage.local.remove(['pendingInitialSync', 'localBookmarkCount', 'lastConfigErrorNotified']);
          
          console.log('🔄 Triggering initial sync after configuration...');
          await performInitialSync();
        } else {
          console.log('⚠️ Configuration incomplete:');
          console.log('   - Token:', setting.githubToken ? '✓' : '✗');
          console.log('   - Gist ID:', setting.gistID ? '✓' : '✗');
          console.log('   - Gist FileName:', setting.gistFileName || '✗');
        }
        configChangeTimer = null;
      }, 1000);
    }
  });

  async function showSyncBadge(status: 'syncing' | 'success' | 'error') {
    if (badgeTimeoutId) {
      clearTimeout(badgeTimeoutId);
      badgeTimeoutId = null;
    }

    if (status === 'syncing') {
      await browser.action.setBadgeText({ text: '…' });
      await browser.action.setBadgeBackgroundColor({ color: '#007bff' });
    } else if (status === 'success') {
      await browser.action.setBadgeText({ text: '' });
    } else {
      await browser.action.setBadgeText({ text: '!' });
      await browser.action.setBadgeBackgroundColor({ color: '#dc3545' });
      badgeTimeoutId = setTimeout(async () => {
        await browser.action.setBadgeText({ text: '' });
      }, 5000);
    }
  }

  function filterBookmarksBySelectedFolders(roots: BookmarkInfo[], selectedFolderIds: string[]): BookmarkInfo[] {
    // 过滤掉仅包含根 id("0") 的情况，此时不做任何过滤
    const effectiveIds = selectedFolderIds.filter(id => id && id !== '0');
    if (effectiveIds.length === 0) {
      return roots;
    }

    const selectedIdSet = new Set(effectiveIds);

    const dfs = (node: BookmarkInfo, parentSelected: boolean): BookmarkInfo | null => {
      const id = node.id ?? '';
      const hasChildren = !!(node.children && node.children.length);
      const isSelectedHere = selectedIdSet.has(id);
      const underSelected = parentSelected || isSelectedHere;

      if (hasChildren) {
        const children = node.children || [];
        const filteredChildren: BookmarkInfo[] = [];
        for (const child of children) {
          const filteredChild = dfs(child, underSelected);
          if (filteredChild) {
            filteredChildren.push(filteredChild);
          }
        }

        // 如果当前文件夹本身未选中且子级也都被过滤掉，则整个分支丢弃
        if (!underSelected && filteredChildren.length === 0) {
          return null;
        }

        // 保留当前节点，但只保留过滤后的子节点
        return { ...node, children: filteredChildren };
      } else {
        // 书签叶子节点：只有在位于被选中文件夹之下时才保留
        if (!underSelected) {
          return null;
        }
        return node;
      }
    };

    const result: BookmarkInfo[] = [];
    for (const root of roots) {
      const filteredRoot = dfs(root, false);
      if (filteredRoot) {
        result.push(filteredRoot);
      }
    }
    return result;
  }

  async function uploadBookmarks(selectedFolderIds?: string[]) {
    try {
      console.log('Starting upload bookmarks...');
      await showSyncBadge('syncing');

      let setting = await Setting.build()
      console.log('Setting loaded:', {
        hasToken: !!setting.githubToken,
        hasGistID: !!setting.gistID,
        hasFileName: !!setting.gistFileName,
        gistID: setting.gistID,
        fileName: setting.gistFileName
      });

      if (setting.githubToken == '') {
        throw new Error("Gist Token Not Found");
      }
      if (setting.gistID == '') {
        throw new Error("Gist ID Not Found");
      }
      if (setting.gistFileName == '') {
        throw new Error("Gist File Not Found");
      }

      let bookmarks = await getBookmarks();
      console.log('Bookmarks loaded:', bookmarks.length, 'items');

      // 如果没有显式传入过滤条件，则尝试从本地读取最近一次确认时保存的 selectedFolderIds
      let effectiveSelectedIds = selectedFolderIds;
      if (!effectiveSelectedIds || effectiveSelectedIds.length === 0) {
        const stored = await browser.storage.local.get(['selectedFolderIds']);
        if (Array.isArray(stored.selectedFolderIds)) {
          effectiveSelectedIds = stored.selectedFolderIds as string[];
        }
      }

      if (effectiveSelectedIds && effectiveSelectedIds.length) {
        bookmarks = filterBookmarksBySelectedFolders(bookmarks, effectiveSelectedIds);
        console.log('Bookmarks after folder filter:', bookmarks.length, 'items');
      }

      let syncdata = new SyncDataInfo();
      syncdata.version = browser.runtime.getManifest().version;
      syncdata.createDate = Date.now();
      syncdata.bookmarks = formatBookmarks(bookmarks);
      syncdata.browser = navigator.userAgent;

      console.log('Sync data prepared:', {
        version: syncdata.version,
        createDate: new Date(syncdata.createDate),
        bookmarksCount: syncdata.bookmarks?.length || 0,
        dataSize: JSON.stringify(syncdata).length
      });

      const updateData = {
        files: {
          [setting.gistFileName]: {
            content: JSON.stringify(syncdata)
          }
        },
        description: setting.gistFileName
      };
      
      console.log('Sending update request to GitHub API...');
      const result = await BookmarkService.update(updateData);
      console.log('Update result:', result);
      
      const count = getBookmarkCount(syncdata.bookmarks);
      await browser.storage.local.set({ remoteCount: count });
      console.log('Remote count updated:', count);
      
      // Update last sync time after successful upload
      await updateLastSyncTime();
      console.log('Last sync time updated');
      
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      console.log('Bookmark structure tracking updated');
      
      if (setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('uploadBookmarks'),
          message: browser.i18n.getMessage('success')
        });
      }
      
      console.log('Upload bookmarks completed successfully');
      await showSyncBadge('success');
      // Refresh local count for popup display
      await refreshLocalCount();

    }
    catch (error: any) {
      console.error('Upload bookmarks error:', error);
      await showSyncBadge('error');
      
      // 只在配置问题时显示一次提示
      const isConfigError = error.message?.includes('token') || error.message?.includes('gist') || error.message?.includes('401');
      if (isConfigError) {
        const { lastConfigErrorNotified } = await browser.storage.local.get(['lastConfigErrorNotified']);
        const now = Date.now();
        // 只在1小时内显示一次配置错误
        if (!lastConfigErrorNotified || now - lastConfigErrorNotified > 3600000) {
          await browser.storage.local.set({ lastConfigErrorNotified: now });
          await browser.notifications.create({
            type: "basic",
            iconUrl: iconLogo,
            title: browser.i18n.getMessage('uploadBookmarks'),
            message: `${browser.i18n.getMessage('error')}：${error.message}`
          });
        } else {
          console.log('⏸️ Config error notification suppressed (already notified recently)');
        }
      } else {
        // 非配置错误，正常提示
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('uploadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：${error.message}`
        });
      }
    }
  }
  async function downloadBookmarks() {
    try {
      console.log('Starting download bookmarks...');
      await showSyncBadge('syncing');
      
      let gist = await BookmarkService.get();
      let setting = await Setting.build()
      if (gist) {
        let syncdata: SyncDataInfo = JSON.parse(gist);
        if (syncdata.bookmarks == undefined || syncdata.bookmarks.length == 0) {
          if (setting.enableNotify) {
            await browser.notifications.create({
              type: "basic",
              iconUrl: iconLogo,
              title: browser.i18n.getMessage('downloadBookmarks'),
              message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} is NULL`
            });
          }
          return;
        }
        // 设置清空标志，防止下载过程中的删除操作触发同步
        isClearing = true;
        try {
          await clearBookmarkTree();
          await createBookmarkTree(syncdata.bookmarks);
        } finally {
          isClearing = false;
        }
        const count = getBookmarkCount(syncdata.bookmarks);
        await browser.storage.local.set({ remoteCount: count });
        // Update last sync time after successful download
        await updateLastSyncTime();
        // Update bookmark structure tracking
        await updateBookmarkStructureTracking();
        console.log('Bookmark structure tracking updated after download');
        if (setting.enableNotify) {
          await browser.notifications.create({
            type: "basic",
            iconUrl: iconLogo,
            title: browser.i18n.getMessage('downloadBookmarks'),
            message: browser.i18n.getMessage('success')
          });
        }
        await showSyncBadge('success');
        // Refresh local count for popup display
        await refreshLocalCount();
      }
      else {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} Not Found`
        });
        await showSyncBadge('error');
      }
    }
    catch (error: any) {
      console.error(error);
      isClearing = false; // 确保错误时也清除标志
      await showSyncBadge('error');
      
      // 只在配置问题时显示一次提示
      const isConfigError = error.message?.includes('token') || error.message?.includes('gist') || error.message?.includes('401');
      if (isConfigError) {
        const { lastConfigErrorNotified } = await browser.storage.local.get(['lastConfigErrorNotified']);
        const now = Date.now();
        // 只在1小时内显示一次配置错误
        if (!lastConfigErrorNotified || now - lastConfigErrorNotified > 3600000) {
          await browser.storage.local.set({ lastConfigErrorNotified: now });
          await browser.notifications.create({
            type: "basic",
            iconUrl: iconLogo,
            title: browser.i18n.getMessage('downloadBookmarks'),
            message: `${browser.i18n.getMessage('error')}：${error.message}`
          });
        } else {
          console.log('⏸️ Config error notification suppressed (already notified recently)');
        }
      } else {
        // 非配置错误，正常提示
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：${error.message}`
        });
      }
    }
  }

  async function pullLatestOnStartup(): Promise<void> {
    try {
      console.log('🔄 Checking for remote updates on startup...');
      
      // 检查配置是否完整
      const setting = await Setting.build();
      if (!setting.githubToken || !setting.gistID) {
        console.log('⏸️ Startup pull skipped: GitHub not configured');
        return;
      }
      
      // 检查初始同步是否完成
      const { initialSyncCompleted } = await browser.storage.local.get(['initialSyncCompleted']);
      if (!initialSyncCompleted) {
        console.log('⏸️ Startup pull skipped: Waiting for initial sync to complete');
        return;
      }
      
      // 获取远程数据
      const gist = await BookmarkService.get();
      if (!gist) {
        console.log('⏸️ Startup pull skipped: No remote data found');
        return;
      }
      
      const remoteSyncData: SyncDataInfo = JSON.parse(gist);
      if (!remoteSyncData.bookmarks || remoteSyncData.bookmarks.length === 0) {
        console.log('⏸️ Startup pull skipped: Remote data is empty');
        return;
      }
      
      // 获取本地书签
      const localBookmarks = await getBookmarks();
      const localStructure = JSON.stringify(formatBookmarks(localBookmarks));
      const remoteStructure = JSON.stringify(remoteSyncData.bookmarks);
      
      const localCount = getBookmarkCount(localBookmarks);
      const remoteCount = getBookmarkCount(remoteSyncData.bookmarks);
      
      console.log('📊 Startup comparison:', {
        localCount,
        remoteCount,
        localSize: localStructure.length,
        remoteSize: remoteStructure.length,
        identical: localStructure === remoteStructure
      });
      
      // 比较本地和远程是否一致
      if (localStructure === remoteStructure) {
        console.log('✅ Local and remote are identical, skipping pull');
        // 更新最后同步时间
        await browser.storage.local.set({ lastSyncTime: remoteSyncData.createDate });
        return;
      }
      
      // 检查本地是否有未同步的修改
      const { lastBookmarkStructure } = await browser.storage.local.get(['lastBookmarkStructure']);
      const localHasChanges = lastBookmarkStructure && lastBookmarkStructure !== localStructure;
      
      if (localHasChanges) {
        console.log('⚠️ Startup pull skipped: Local has unsaved changes');
        console.log('   💡 Local changes will be uploaded by auto-sync');
        return;
      }
      
      // 远程和本地不同，且本地无未同步修改 -> 下载
      console.log('🔽 Pulling latest version from remote...');
      console.log(`   📥 Downloading ${remoteCount} bookmarks from remote`);
      
      await showSyncBadge('syncing');
      
      // 执行下载
      isClearing = true;
      try {
        await clearBookmarkTree();
        await createBookmarkTree(remoteSyncData.bookmarks);
      } finally {
        isClearing = false;
      }
      
      // 更新存储
      await browser.storage.local.set({ 
        remoteCount: remoteCount,
        lastSyncTime: remoteSyncData.createDate
      });
      
      // 更新书签结构追踪
      await updateBookmarkStructureTracking();
      
      console.log('✅ Startup pull completed:', {
        bookmarksDownloaded: remoteCount,
        remoteTime: new Date(remoteSyncData.createDate).toLocaleString()
      });
      
      // 显示通知
      if (setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: '启动同步',
          message: `已从远程拉取最新书签（${remoteCount}个）`
        });
      }
      
      await showSyncBadge('success');
      await refreshLocalCount();
      
    } catch (error: any) {
      console.error('❌ Startup pull error:', error);
      isClearing = false; // 确保错误时也清除标志
      // 静默失败，不显示错误通知
      console.log('⚠️ Startup pull failed silently');
    }
  }

  // Initialize on startup
  browser.runtime.onStartup.addListener(async () => {
    console.log('🔧 Extension startup');
    
    // 延迟1秒后执行拉取，避免启动时资源竞争
    setTimeout(async () => {
      await pullLatestOnStartup();
    }, 1000);
    
    // Refresh local count on startup
    await refreshLocalCount();
    console.log('✅ Extension ready to sync on bookmark changes');
  });

  // Extension suspended handler
  browser.runtime.onSuspend.addListener(() => {
    console.log('Extension suspended');
  });

  async function getBookmarks() {
    const bookmarkTree = await browser.bookmarks.getTree() as unknown as BookmarkInfo[];
    if (bookmarkTree && bookmarkTree[0] && bookmarkTree[0].id === 'root________') {
      curBrowserType = BrowserType.FIREFOX;
    } else {
      curBrowserType = BrowserType.CHROME;
    }
    return bookmarkTree;
  }

  async function refreshLocalCount() {
    const bookmarkList = await getBookmarks();
    const count = getBookmarkCount(bookmarkList);
    await browser.storage.local.set({ localCount: count });
  }

  function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0] && bookmarks[0].children) {
      for (const a of bookmarks[0].children) {
        switch (a.id) {
          case '1':
          case 'toolbar_____':
            a.title = RootBookmarksType.ToolbarFolder;
            break;
          case 'menu________':
            a.title = RootBookmarksType.MenuFolder;
            break;
          case '2':
          case 'unfiled_____':
            a.title = RootBookmarksType.UnfiledFolder;
            break;
          case '3':
          case 'mobile______':
            a.title = RootBookmarksType.MobileFolder;
            break;
        }
      }
    }
    const root = format(bookmarks[0]);
    return root.children;
  }

  function format(b: BookmarkInfo): BookmarkInfo {
    b.dateAdded = undefined;
    b.dateGroupModified = undefined;
    b.id = undefined;
    b.index = undefined;
    b.parentId = undefined;
    b.type = undefined;
    if (b.children) {
      b.children = b.children.map(child => format(child));
    }
    return b;
  }

  function getBookmarkCount(bookmarks: BookmarkInfo[] | BookmarkInfo | undefined): number {
    if (!bookmarks) {
      return 0;
    }
    const list = Array.isArray(bookmarks) ? bookmarks : [bookmarks];
    let count = 0;
    const stack: BookmarkInfo[] = [...list];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.url && !node.children) {
        count += 1;
      }
      if (node.children) {
        for (const child of node.children) {
          stack.push(child);
        }
      }
    }
    return count;
  }

  async function clearBookmarkTree() {
    try {
      const setting = await Setting.build();
      if (!setting.githubToken) {
        throw new Error('Gist Token Not Found');
      }
      if (!setting.gistID) {
        throw new Error('Gist ID Not Found');
      }
      if (!setting.gistFileName) {
        throw new Error('Gist File Not Found');
      }

      const bookmarks = await getBookmarks();
      const tempNodes: BookmarkInfo[] = [];
      if (bookmarks[0] && bookmarks[0].children) {
        for (const c of bookmarks[0].children) {
          if (c.children) {
            for (const d of c.children) {
              tempNodes.push(d);
            }
          }
        }
      }

      for (const node of tempNodes) {
        if (node.id) {
          await browser.bookmarks.removeTree(node.id);
        }
      }

      if (curOperType === OperType.REMOVE && setting.enableNotify) {
        await browser.notifications.create({
          type: 'basic',
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('removeAllBookmarks'),
          message: browser.i18n.getMessage('success'),
        });
      }
    } catch (error: any) {
      console.error('Clear bookmarks error:', error);
      await browser.notifications.create({
        type: 'basic',
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('removeAllBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`,
      });
    }
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined) {
    if (!bookmarkList) {
      return;
    }
    for (let i = 0; i < bookmarkList.length; i++) {
      const node = bookmarkList[i];
      if (
        node.title === RootBookmarksType.MenuFolder ||
        node.title === RootBookmarksType.MobileFolder ||
        node.title === RootBookmarksType.ToolbarFolder ||
        node.title === RootBookmarksType.UnfiledFolder
      ) {
        if (curBrowserType === BrowserType.FIREFOX) {
          switch (node.title) {
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => (c.parentId = 'menu________'));
              break;
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => (c.parentId = 'mobile______'));
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => (c.parentId = 'toolbar_____'));
              break;
            case RootBookmarksType.UnfiledFolder:
              node.children?.forEach(c => (c.parentId = 'unfiled_____'));
              break;
            default:
              node.children?.forEach(c => (c.parentId = 'unfiled_____'));
              break;
          }
        } else {
          switch (node.title) {
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => (c.parentId = '3'));
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => (c.parentId = '1'));
              break;
            case RootBookmarksType.UnfiledFolder:
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => (c.parentId = '2'));
              break;
            default:
              node.children?.forEach(c => (c.parentId = '2'));
              break;
          }
        }
        await createBookmarkTree(node.children);
        continue;
      }

      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        res = await browser.bookmarks.create({
          parentId: node.parentId,
          title: node.title,
          url: node.url,
        });
      } catch (err) {
        console.error(res, err);
      }
      if (res.id && node.children && node.children.length > 0) {
        node.children.forEach(c => (c.parentId = res.id));
        await createBookmarkTree(node.children);
      }
    }
  }

  async function updateBookmarkStructureTracking(): Promise<void> {
    try {
      const bookmarks = await getBookmarks();
      const currentCount = getBookmarkCount(bookmarks);
      const currentStructure = JSON.stringify(formatBookmarks(bookmarks));
      await browser.storage.local.set({
        localBookmarkCount: currentCount,
        lastBookmarkStructure: currentStructure,
      });
    } catch (error) {
      console.error('Error updating bookmark structure tracking:', error);
    }
  }

  async function updateLastSyncTime(): Promise<void> {
    try {
      const currentTime = Date.now();
      await browser.storage.local.set({ lastSyncTime: currentTime });
    } catch (error) {
      console.error('Error updating last sync time:', error);
    }
  }

  async function triggerAutoSyncIfEnabled(): Promise<void> {
    try {
      const setting = await Setting.build();
      if (!setting.autoSyncEnabled) {
        return;
      }
      const data = await browser.storage.local.get(['lastSyncTime']);
      const lastSyncTime = data.lastSyncTime || 0;
      const intervalMinutes = setting.autoSyncInterval || 15;
      const intervalMs = intervalMinutes * 60 * 1000;
      const now = Date.now();
      if (lastSyncTime && now - lastSyncTime < intervalMs) {
        return;
      }
      if (curOperType !== OperType.NONE) {
        return;
      }
      curOperType = OperType.SYNC;
      try {
        await uploadBookmarks();
      } finally {
        curOperType = OperType.NONE;
      }
    } catch (error) {
      console.error('Error triggering auto sync:', error);
    }
  }

  ///暂时不启用自动备份
  /*
  async function backupToLocalStorage(bookmarks: BookmarkInfo[]) {
      try {
          let syncdata = new SyncDataInfo();
          syncdata.version = browser.runtime.getManifest().version;
          syncdata.createDate = Date.now();
          syncdata.bookmarks = formatBookmarks(bookmarks);
          syncdata.browser = navigator.userAgent;
          const keyname = 'BookmarkHub_backup_' + Date.now().toString();
          await browser.storage.local.set({ [keyname]: JSON.stringify(syncdata) });
      }
      catch (error:any) {
          console.error(error)
      }
  }
  */

});