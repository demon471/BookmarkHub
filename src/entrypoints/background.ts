import BookmarkService from '../utils/services'
import { Setting } from '../utils/setting'
import iconLogo from '../assets/icon.png'
import { OperType, BookmarkInfo, SyncDataInfo, RootBookmarksType, BrowserType } from '../utils/models'
import { Bookmarks } from 'wxt/browser'
export default defineBackground(() => {

  browser.runtime.onInstalled.addListener(async (c) => {
    await startAutoSync();
  });

  let curOperType = OperType.NONE;
  let curBrowserType = BrowserType.CHROME;
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
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('uploadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
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
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconLogo,
        title: browser.i18n.getMessage('downloadBookmarks'),
        message: `${browser.i18n.getMessage('error')}：${error.message}`
      });
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
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_DELAY = 2000; // 2秒防抖延迟
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
   * 触发自动同步（带防抖机制）
   * 1. 检查是否正在同步中
   * 2. 启动2秒防抖计时器
   * 3. 如果2秒内无新变化，执行智能同步
   */
  async function triggerAutoSyncIfEnabled(): Promise<void> {
    try {
      console.log('Auto sync check:', {
        curOperType: curOperType,
        shouldTrigger: curOperType === OperType.NONE
      });
      
      // Only proceed if we're not currently syncing
      if (curOperType === OperType.NONE) {
        // Clear existing debounce timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          console.log('Previous debounce timer cleared');
        }
        
        // Set new debounce timer (2 seconds)
        debounceTimer = setTimeout(async () => {
          try {
            console.log('Debounce delay completed, triggering auto sync...');
            
            // Double-check conditions before sync
            if (curOperType === OperType.NONE) {
              // Set operation type to prevent multiple simultaneous syncs
              curOperType = OperType.SYNC;
              
              // Show sync in progress badge
              browser.action.setBadgeText({ text: "↻" });
              browser.action.setBadgeBackgroundColor({ color: "#007bff" });
              
              // Perform smart sync with API rate limiting
              await smartSync();
              
              // Clear badge after sync
              browser.action.setBadgeText({ text: "" });
              browser.action.setBadgeBackgroundColor({ color: "#F00" });
              
              // Reset operation type
              curOperType = OperType.NONE;
            } else {
              console.log('Auto sync cancelled during debounce: Currently syncing');
            }
          } catch (error) {
            console.error('Error in debounced auto sync:', error);
            // Reset operation type on error
            curOperType = OperType.NONE;
            browser.action.setBadgeText({ text: "" });
          } finally {
            // Clear debounce timer
            debounceTimer = null;
          }
        }, DEBOUNCE_DELAY);
        
        console.log(`Auto sync scheduled with ${DEBOUNCE_DELAY}ms debounce delay`);
      } else {
        console.log('Auto sync not triggered: Currently syncing');
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
        console.log('Local data differs from remote, uploading...');
        await uploadBookmarks();
      } else {
        console.log('Local and remote data are identical, skipping sync');
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
    await startAutoSync();
  });

  // Clean up timers when extension is suspended or closed
  browser.runtime.onSuspend.addListener(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      console.log('Debounce timer cleared on suspend');
    }
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