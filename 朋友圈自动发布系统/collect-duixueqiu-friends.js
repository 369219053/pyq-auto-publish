// 在堆雪球好友列表页面的浏览器控制台中运行此脚本
// 用于收集所有好友并保存为JSON文件

(async function collectAllFriends() {
  const allFriends = [];
  const seenFriends = new Set();
  
  let previousCount = 0;
  let stableCount = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 10000;
  const stableThreshold = 100;
  
  console.log('🚀 开始滚动收集好友...');
  
  while (scrollAttempts < maxScrollAttempts && stableCount < stableThreshold) {
    // 收集当前可见的好友
    const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');
    
    friendElements.forEach(el => {
      const nameEl = el.querySelector('.recent-and-friend-panel-concat-item__nickname');
      const avatarEl = el.querySelector('.recent-and-friend-panel-concat-item__avatar');
      
      if (nameEl && avatarEl) {
        const name = nameEl.textContent.trim();
        const avatarUrl = avatarEl.src;
        const key = `${name}_${avatarUrl}`;
        
        if (!seenFriends.has(key)) {
          seenFriends.add(key);
          allFriends.push({ name, avatarUrl });
        }
      }
    });
    
    // 检查是否有新好友
    if (allFriends.length === previousCount) {
      stableCount++;
    } else {
      stableCount = 0;
      previousCount = allFriends.length;
    }
    
    // 滚动
    const container = document.querySelector('.vue-recycle-scroller__item-wrapper');
    if (container && container.parentElement) {
      container.parentElement.scrollBy(0, 300);
    }
    
    // 等待渲染
    await new Promise(resolve => setTimeout(resolve, 500));
    
    scrollAttempts++;
    
    // 每100次输出一次进度
    if (scrollAttempts % 100 === 0) {
      console.log(`📊 滚动进度: ${scrollAttempts}次, 收集到 ${allFriends.length} 个好友, 稳定计数: ${stableCount}`);
    }
  }
  
  console.log(`✅ 滚动完成! 总共滚动 ${scrollAttempts} 次, 收集到 ${allFriends.length} 个好友`);
  
  // 下载为JSON文件
  const dataStr = JSON.stringify(allFriends, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'duixueqiu-10号机-friends.json';
  link.click();
  URL.revokeObjectURL(url);
  
  console.log('💾 好友列表已下载为 duixueqiu-10号机-friends.json');
  
  return {
    totalFriends: allFriends.length,
    scrollAttempts,
    friends: allFriends
  };
})();

