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
});
