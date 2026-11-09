/**
 * ==============================================================================
 * SMART WEB & FORUM NAVIGATOR - BACKGROUND SERVICE WORKER
 * ==============================================================================
 * Xử lý mở Tab mới ở chế độ nền (Background Tab: active = false).
 * Giúp người dùng khi bấm [Enter] thì mở tab mới chạy ngầm phía sau
 * mà KHÔNG bị nhảy chuyển trang, vẫn ở nguyên trang web hiện tại.
 * ==============================================================================
 */

// Lắng nghe yêu cầu mở tab ngầm từ content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openBackgroundTab' && request.url) {
    // Tạo tab mới với active = false (tab mở ngầm phía sau)
    chrome.tabs.create({
      url: request.url,
      active: false // Quan trọng: Giữ nguyên ở tab hiện tại, không chuyển focus sang tab mới
    });
    
    sendResponse({ success: true });
    return true;
  }

  // Tự động ghi nhận video vào Lịch sử xem (Watch History) của YouTube
  if (request.action === 'markAsWatchedOnYouTube' && request.videoId) {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(request.videoId)}&t=99999s`;
    chrome.tabs.create({
      url: watchUrl,
      active: false // Chạy ngầm phía sau, không làm gián đoạn người dùng
    }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ success: false });
        return;
      }
      try {
        // Tắt tiếng tab ngầm để không phát ra âm thanh
        chrome.tabs.update(tab.id, { muted: true }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (e) {}

      // Giữ tab ngầm 2.5 giây để player YouTube nạp và gửi beacon ghi nhận lịch sử xem 100%
      setTimeout(() => {
        try {
          chrome.tabs.remove(tab.id, () => {
            if (chrome.runtime.lastError) {}
          });
        } catch (e) {}
      }, 2500);
    });

    sendResponse({ success: true });
    return true;
  }
});
