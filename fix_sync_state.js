// 临时修复脚本 - 在Chrome Console中运行
// 这会手动设置initialSyncCompleted标记，解除自动同步的阻塞

// 方案1：如果您想立即启用自动同步（推荐）
chrome.storage.local.set({ initialSyncCompleted: true }).then(() => {
  console.log('✅ 已解除自动同步阻塞');
  console.log('现在自动同步功能已启用');
});

// 方案2：如果您想查看当前状态
chrome.storage.local.get(['initialSyncCompleted', 'pendingInitialSync', 'localBookmarkCount']).then(data => {
  console.log('当前状态:', data);
});

// 方案3：完全重置（如果需要重新测试初始同步）
// chrome.storage.local.clear().then(() => {
//   console.log('✅ 已重置所有状态');
//   console.log('请重新配置GitHub Token和Gist ID');
// });

