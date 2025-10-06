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
    
    // 启动自动同步检查（配置完成后才会真正同步）
    await startAutoSync();
  });

  let curOperType = OperType.NONE;
  let curBrowserType = BrowserType.CHROME;
  let configChangeTimer: ReturnType<typeof setTimeout> | null = null;
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.name === 'upload') {
      curOperType = OperType.SYNC
      uploadBookmarks().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });
    }
    if (msg.name === 'download') {
      curOperType = OperType.SYNC
      downloadBookmarks().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
      });

    }
    if (msg.name === 'removeAll') {
      curOperType = OperType.REMOVE
      clearBookmarkTree().then(() => {
        curOperType = OperType.NONE
        browser.action.setBadgeText({ text: "" });
        refreshLocalCount();
        sendResponse(true);
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
      uploadBookmarks().then(async () => {
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
    if (curOperType === OperType.NONE) {
      // console.log("onCreated", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    }
  });
  browser.bookmarks.onChanged.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      // console.log("onChanged", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    }
  })
  browser.bookmarks.onMoved.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      // console.log("onMoved", id, info)
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
    }
  })
  browser.bookmarks.onRemoved.addListener(async (id, info) => {
    if (curOperType === OperType.NONE) {
      console.log("Bookmark removed:", id, info);
      browser.action.setBadgeText({ text: "!" });
      browser.action.setBadgeBackgroundColor({ color: "#F00" });
      refreshLocalCount();
      // Update bookmark structure tracking
      await updateBookmarkStructureTracking();
      // Trigger auto sync if enabled
      await triggerAutoSyncIfEnabled();
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

  async function uploadBookmarks() {
    try {
      console.log('Starting upload bookmarks...');
      
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

    }
    catch (error: any) {
      console.error('Upload bookmarks error:', error);
      
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
        await clearBookmarkTree();
        await createBookmarkTree(syncdata.bookmarks);
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
      }
      else {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('downloadBookmarks'),
          message: `${browser.i18n.getMessage('error')}：Gist File ${setting.gistFileName} Not Found`
        });
      }
    }
    catch (error: any) {
      console.error(error);
      
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

  async function performInitialSync() {
    try {
      const { initialSyncCompleted } = await browser.storage.local.get(['initialSyncCompleted']);
      if (initialSyncCompleted) {
        console.log('ℹ️ Initial sync already completed, skipping');
        return;
      }
      
      // 检查GitHub配置是否完成
      const setting = await Setting.build();
      if (!setting.githubToken || !setting.gistID) {
        console.log('⚠️ GitHub not configured yet, waiting for configuration...');
        // 不设置initialSyncCompleted，保持未完成状态，等待用户配置
        return;
      }
      
      console.log('🎯 Starting initial sync check...');
      const bookmarks = await getBookmarks();
      const localCount = getBookmarkCount(bookmarks);
      
      if (localCount === 0) {
        // 本地无书签，检查远程
        try {
          const gist = await BookmarkService.get();
          if (gist) {
            const syncdata: SyncDataInfo = JSON.parse(gist);
            const remoteCount = getBookmarkCount(syncdata.bookmarks);
            if (remoteCount > 0) {
              console.log(`📥 Auto-downloading ${remoteCount} bookmarks from remote...`);
              await downloadBookmarks();
              await browser.notifications.create({
                type: "basic",
                iconUrl: iconLogo,
                title: '初始同步完成',
                message: `已从远程下载 ${remoteCount} 个书签`
              });
            } else {
              console.log('ℹ️ Remote is also empty, nothing to sync');
              // 即使远程为空，也更新追踪以避免后续误判
              await updateBookmarkStructureTracking();
            }
          } else {
            console.log('ℹ️ Remote gist not found, starting fresh');
            // 更新追踪
            await updateBookmarkStructureTracking();
          }
        } catch (error) {
          console.error('Initial sync check remote error:', error);
          // 出错也更新追踪
          await updateBookmarkStructureTracking();
        }
        // 无论如何都启用自动同步
        await browser.storage.local.set({ initialSyncCompleted: true });
        console.log('✅ Initial sync completed, auto-sync enabled');
      } else {
        // 本地有书签，显示选择对话框
        console.log(`📊 Found ${localCount} local bookmarks, showing sync choice dialog...`);
        await browser.storage.local.set({ 
          pendingInitialSync: true, 
          localBookmarkCount: localCount 
        });
        
        // 尝试发送消息给options页面
        try {
          await browser.runtime.sendMessage({ name: 'showSyncChoice', localCount });
          console.log('✅ Sync choice message sent to options page');
        } catch (e) {
          console.log('⚠️ Options page not open, opening it now...');
          await browser.runtime.openOptionsPage();
          // 等待页面加载后重新发送消息
          setTimeout(async () => {
            try {
              await browser.runtime.sendMessage({ name: 'showSyncChoice', localCount });
              console.log('✅ Sync choice message sent after opening options page');
            } catch (err) {
              console.error('Failed to send message even after opening options page:', err);
            }
          }, 1000);
        }
        
        // 30秒超时：如果用户没响应，自动启用同步（不做任何操作，保留本地书签）
        setTimeout(async () => {
          const { initialSyncCompleted, pendingInitialSync } = await browser.storage.local.get(['initialSyncCompleted', 'pendingInitialSync']);
          if (!initialSyncCompleted && pendingInitialSync) {
            console.log('⚠️ Initial sync timeout (30s): Auto-enabling sync, keeping local bookmarks');
            await browser.storage.local.set({ initialSyncCompleted: true });
            await browser.storage.local.remove(['pendingInitialSync', 'localBookmarkCount']);
            await browser.notifications.create({
              type: "basic",
              iconUrl: iconLogo,
              title: '初始同步',
              message: '已启用自动同步，保留本地书签。后续变化将自动同步到远程。'
            });
          }
        }, 30000); // 30秒超时
      }
    } catch (error) {
      console.error('performInitialSync error:', error);
      // 出错也要启用自动同步，不要卡住
      await browser.storage.local.set({ initialSyncCompleted: true });
    }
  }

  async function getBookmarks() {
    let bookmarkTree: BookmarkInfo[] = await browser.bookmarks.getTree();
    if (bookmarkTree && bookmarkTree[0].id === "root________") {
      curBrowserType = BrowserType.FIREFOX;
    }
    else {
      curBrowserType = BrowserType.CHROME;
    }
    return bookmarkTree;
  }

  async function clearBookmarkTree() {
    try {
      let setting = await Setting.build()
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
      let tempNodes: BookmarkInfo[] = [];
      bookmarks[0].children?.forEach(c => {
        c.children?.forEach(d => {
          tempNodes.push(d)
        })
      });
      if (tempNodes.length > 0) {
        for (let node of tempNodes) {
          if (node.id) {
            await browser.bookmarks.removeTree(node.id)
          }
        }
      }
      if (curOperType === OperType.REMOVE && setting.enableNotify) {
        await browser.notifications.create({
          type: "basic",
          iconUrl: iconLogo,
          title: browser.i18n.getMessage('removeAllBookmarks'),
          message: browser.i18n.getMessage('success')
        });
      }
    }
    catch (error: any) {
      console.error(error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('removeAllBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
    }
  }

  async function createBookmarkTree(bookmarkList: BookmarkInfo[] | undefined) {
    if (bookmarkList == null) {
      return;
    }
    for (let i = 0; i < bookmarkList.length; i++) {
      let node = bookmarkList[i];
      if (node.title == RootBookmarksType.MenuFolder
        || node.title == RootBookmarksType.MobileFolder
        || node.title == RootBookmarksType.ToolbarFolder
        || node.title == RootBookmarksType.UnfiledFolder) {
        if (curBrowserType == BrowserType.FIREFOX) {
          switch (node.title) {
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => c.parentId = "menu________");
              break;
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => c.parentId = "mobile______");
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => c.parentId = "toolbar_____");
              break;
            case RootBookmarksType.UnfiledFolder:
              node.children?.forEach(c => c.parentId = "unfiled_____");
              break;
            default:
              node.children?.forEach(c => c.parentId = "unfiled_____");
              break;
          }
        } else {
          switch (node.title) {
            case RootBookmarksType.MobileFolder:
              node.children?.forEach(c => c.parentId = "3");
              break;
            case RootBookmarksType.ToolbarFolder:
              node.children?.forEach(c => c.parentId = "1");
              break;
            case RootBookmarksType.UnfiledFolder:
            case RootBookmarksType.MenuFolder:
              node.children?.forEach(c => c.parentId = "2");
              break;
            default:
              node.children?.forEach(c => c.parentId = "2");
              break;
          }
        }
        await createBookmarkTree(node.children);
        continue;
      }

      let res: Bookmarks.BookmarkTreeNode = { id: '', title: '' };
      try {
        /* 处理firefox中创建 chrome://chrome-urls/ 格式的书签会报错的问题 */
        res = await browser.bookmarks.create({
          parentId: node.parentId,
          title: node.title,
          url: node.url
        });
      } catch (err) {
        console.error(res, err);
      }
      if (res.id && node.children && node.children.length > 0) {
        node.children.forEach(c => c.parentId = res.id);
        await createBookmarkTree(node.children);
      }
    }
  }

  function getBookmarkCount(bookmarkList: BookmarkInfo[] | undefined) {
    let count = 0;
    if (bookmarkList) {
      bookmarkList.forEach(c => {
        if (c.url) {
          count = count + 1;
        }
        else {
          count = count + getBookmarkCount(c.children);
        }
      });
    }
    return count;
  }

  async function refreshLocalCount() {
    let bookmarkList = await getBookmarks();
    const count = getBookmarkCount(bookmarkList);
    await browser.storage.local.set({ localCount: count });
  }


  function formatBookmarks(bookmarks: BookmarkInfo[]): BookmarkInfo[] | undefined {
    if (bookmarks[0].children) {
      for (let a of bookmarks[0].children) {
        switch (a.id) {
          case "1":
          case "toolbar_____":
            a.title = RootBookmarksType.ToolbarFolder;
            break;
          case "menu________":
            a.title = RootBookmarksType.MenuFolder;
            break;
          case "2":
          case "unfiled_____":
            a.title = RootBookmarksType.UnfiledFolder;
            break;
          case "3":
          case "mobile______":
            a.title = RootBookmarksType.MobileFolder;
            break;
        }
      }
    }

    let a = format(bookmarks[0]);
    return a.children;
  }

  function format(b: BookmarkInfo): BookmarkInfo {
    b.dateAdded = undefined;
    b.dateGroupModified = undefined;
    b.id = undefined;
    b.index = undefined;
    b.parentId = undefined;
    b.type = undefined;
    b.unmodifiable = undefined;
    if (b.children && b.children.length > 0) {
      b.children?.map(c => format(c))
    }
    return b;
  }

  // Auto sync functionality
  let autoSyncTimer: string | null = null;
  let autoSyncInterval: ReturnType<typeof setInterval> | null = null;
  const AUTO_SYNC_INTERVAL = 5000; // 5秒自动同步间隔
  
  // API rate limiting
  let lastApiCallTime = 0;
  const MIN_API_INTERVAL = 3000; // 最小API调用间隔3秒

  // Check if API can be called (rate limiting)
  function canCallApi(): boolean {
    const now = Date.now();
    if (now - lastApiCallTime >= MIN_API_INTERVAL) {
      lastApiCallTime = now;
      return true;
    }
    return false;
  }

  // Update bookmark structure tracking for change detection
  async function updateBookmarkStructureTracking(): Promise<void> {
    try {
      const bookmarks = await getBookmarks();
      const currentCount = getBookmarkCount(bookmarks);
      const currentStructure = JSON.stringify(formatBookmarks(bookmarks));
      
      console.log('Updating bookmark structure tracking:', {
        currentCount,
        structureLength: currentStructure.length
      });
      
      await browser.storage.local.set({ 
        localBookmarkCount: currentCount,
        lastBookmarkStructure: currentStructure
      });
    } catch (error) {
      console.error('Error updating bookmark structure tracking:', error);
    }
  }

  /**
   * 触发自动同步（立即执行，无延迟）
   * 检测到书签变化后立即上传到远程
   */
  async function triggerAutoSyncIfEnabled(): Promise<void> {
    try {
      // Check if initial sync is completed first
      const { initialSyncCompleted } = await browser.storage.local.get(['initialSyncCompleted']);
      if (!initialSyncCompleted) {
        console.log('Auto sync check skipped: Waiting for initial sync to complete');
        return;
      }
      
      console.log('🔄 Auto sync triggered immediately (no delay)');
      
      // Only proceed if we're not currently syncing
      if (curOperType === OperType.NONE) {
        try {
          // Set operation type to prevent multiple simultaneous syncs
          curOperType = OperType.SYNC;
          
          // Show sync in progress badge
          browser.action.setBadgeText({ text: "↻" });
          browser.action.setBadgeBackgroundColor({ color: "#007bff" });
          
          // Perform smart sync immediately with API rate limiting
          await smartSync();
          
          // Clear badge after sync - remove the warning badge
          await refreshLocalCount();
          browser.action.setBadgeText({ text: "" });
          
          // Reset operation type
          curOperType = OperType.NONE;
        } catch (error) {
          console.error('Error in auto sync:', error);
          // Reset operation type on error
          curOperType = OperType.NONE;
          browser.action.setBadgeText({ text: "" });
        }
      } else {
        console.log('⏸️ Auto sync skipped: Currently syncing');
      }
    } catch (error) {
      console.error('Error triggering auto sync:', error);
      // Reset operation type on error
      curOperType = OperType.NONE;
      browser.action.setBadgeText({ text: "" });
    }
  }



  // Get last sync time from local storage
  async function getLastSyncTime(): Promise<number> {
    try {
      const data = await browser.storage.local.get(['lastSyncTime']);
      return data.lastSyncTime || 0;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return 0;
    }
  }

  // Get local bookmarks last modification time
  async function getLocalBookmarksLastModified(): Promise<number> {
    try {
      const bookmarks = await getBookmarks();
      let maxTime = 0;
      
      function findMaxTime(bookmarkList: BookmarkInfo[]) {
        for (const bookmark of bookmarkList) {
          if (bookmark.dateAdded && bookmark.dateAdded > maxTime) {
            maxTime = bookmark.dateAdded;
          }
          if (bookmark.dateGroupModified && bookmark.dateGroupModified > maxTime) {
            maxTime = bookmark.dateGroupModified;
          }
          if (bookmark.children) {
            findMaxTime(bookmark.children);
          }
        }
      }
      
      findMaxTime(bookmarks);
      
      // Also check if we have a stored bookmark count to detect deletions
      const storedData = await browser.storage.local.get(['localBookmarkCount', 'lastBookmarkStructure']);
      const currentCount = getBookmarkCount(bookmarks);
      const currentStructure = JSON.stringify(formatBookmarks(bookmarks));
      
      // If bookmark count changed or structure changed, consider it modified
      if (storedData.localBookmarkCount !== undefined && storedData.localBookmarkCount !== currentCount) {
        console.log('Bookmark count changed:', storedData.localBookmarkCount, '->', currentCount);
        maxTime = Math.max(maxTime, Date.now());
      }
      
      if (storedData.lastBookmarkStructure && storedData.lastBookmarkStructure !== currentStructure) {
        console.log('Bookmark structure changed');
        maxTime = Math.max(maxTime, Date.now());
      }
      
      // Force modification detection for testing - always consider modified if we have changes
      if (storedData.localBookmarkCount !== undefined && storedData.localBookmarkCount !== currentCount) {
        console.log('FORCING MODIFICATION DETECTION - Count changed');
        maxTime = Date.now();
      } else if (storedData.lastBookmarkStructure && storedData.lastBookmarkStructure !== currentStructure) {
        console.log('FORCING MODIFICATION DETECTION - Structure changed');
        maxTime = Date.now();
      }
      
      console.log('Local bookmarks last modified time calculated:', {
        maxTime: new Date(maxTime),
        currentCount,
        storedCount: storedData.localBookmarkCount,
        countChanged: storedData.localBookmarkCount !== currentCount,
        structureChanged: storedData.lastBookmarkStructure !== currentStructure
      });
      
      return maxTime;
    } catch (error) {
      console.error('Error getting local bookmarks last modified time:', error);
      return 0;
    }
  }

  // Get remote Gist last update time
  async function getRemoteLastUpdateTime(): Promise<number> {
    try {
      const setting = await Setting.build();
      if (!setting.gistID) {
        throw new Error("Gist ID Not Found");
      }
      
      const gist = await BookmarkService.get();
      if (gist) {
        // Parse the gist content to get the createDate
        const syncData: SyncDataInfo = JSON.parse(gist);
        return syncData.createDate || 0;
      }
      return 0;
    } catch (error) {
      console.error('Error getting remote last update time:', error);
      return 0;
    }
  }

  /**
   * 智能同步函数 - 比较本地和远程数据
   * 1. 检查API调用频率限制（3秒间隔）
   * 2. 比较本地书签和远程Gist数据
   * 3. 如果本地有变化，上传覆盖远程
   * 4. 如果无变化，跳过同步
   */
  async function smartSync(): Promise<void> {
    try {
      // Check GitHub configuration first
      const setting = await Setting.build();
      if (!setting.githubToken || !setting.gistID) {
        console.log('⏸️ Smart sync skipped: GitHub not configured');
        return;
      }
      
      console.log('Starting smart sync...');
      
      // Check API rate limiting
      if (!canCallApi()) {
        console.log('Smart sync skipped: API rate limit exceeded');
        return;
      }
      
      // Get current local bookmarks
      const localBookmarks = await getBookmarks();
      const localCount = getBookmarkCount(localBookmarks);
      const localStructure = JSON.stringify(formatBookmarks(localBookmarks));
      
      // Get remote bookmarks
      let remoteCount = 0;
      let remoteStructure = '';
      try {
        const gist = await BookmarkService.get();
        if (gist) {
          const syncData: SyncDataInfo = JSON.parse(gist);
          remoteCount = getBookmarkCount(syncData.bookmarks);
          remoteStructure = JSON.stringify(syncData.bookmarks);
        }
      } catch (error) {
        console.log('Could not fetch remote data, assuming local is newer');
        remoteCount = 0;
        remoteStructure = '';
      }
      
      console.log('Local vs Remote comparison:', {
        localCount,
        remoteCount,
        countChanged: localCount !== remoteCount,
        structureChanged: localStructure !== remoteStructure,
        localStructureLength: localStructure.length,
        remoteStructureLength: remoteStructure.length
      });
      
      // Check if local data is different from remote
      const hasChanges = localCount !== remoteCount || localStructure !== remoteStructure;
      
      if (hasChanges) {
        console.log('✅ Local data differs from remote, uploading...', {
          localCount,
          remoteCount,
          structureDiff: localStructure.length - remoteStructure.length
        });
        await uploadBookmarks();
        console.log('✅ Smart sync upload completed');
        // Update bookmark structure tracking after successful upload
        await updateBookmarkStructureTracking();
      } else {
        console.log('ℹ️ Local and remote data are identical, skipping sync');
      }
    } catch (error) {
      console.error('Smart sync error:', error);
      // Auto sync error - no notification needed
    }
  }

  // Update last sync time in settings
  async function updateLastSyncTime(): Promise<void> {
    try {
      const currentTime = Date.now();
      // Save to storage
      await browser.storage.local.set({ lastSyncTime: currentTime });
      console.log('Updated last sync time:', new Date(currentTime).toLocaleString());
    } catch (error) {
      console.error('Error updating last sync time:', error);
    }
  }

  // Start auto sync with 5 second interval
  async function startAutoSync(): Promise<void> {
    try {
      // Clear existing interval
      if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
      }

      // Create new interval with 5 second interval
      autoSyncInterval = setInterval(async () => {
        try {
          // Check if initial sync is completed
          const { initialSyncCompleted } = await browser.storage.local.get(['initialSyncCompleted']);
          if (!initialSyncCompleted) {
            console.log('Auto sync interval skipped: Waiting for initial sync to complete');
            return;
          }
          await smartSync();
        } catch (error) {
          console.error('Error in auto sync interval:', error);
        }
      }, AUTO_SYNC_INTERVAL);

      console.log(`Auto sync started with ${AUTO_SYNC_INTERVAL}ms interval`);
    } catch (error) {
      console.error('Error starting auto sync:', error);
    }
  }

  // Stop auto sync
  async function stopAutoSync(): Promise<void> {
    try {
      if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
        console.log('Auto sync stopped');
      }
    } catch (error) {
      console.error('Error stopping auto sync:', error);
    }
  }


  // Initialize auto sync on startup
  browser.runtime.onStartup.addListener(async () => {
    console.log('🔧 Extension startup');
    await startAutoSync();
  });

  // Clean up timers when extension is suspended or closed
  browser.runtime.onSuspend.addListener(() => {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
      console.log('Auto sync interval cleared on suspend');
    }
  });

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