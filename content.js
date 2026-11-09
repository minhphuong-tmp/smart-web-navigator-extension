/**
 * ==============================================================================
 * SMART WEB, YOUTUBE & FORUM NAVIGATOR
 * ==============================================================================
 * Tiện ích hỗ trợ điều hướng thông minh bằng bàn phím trên:
 * 
 * 1. YOUTUBE (Đặc biệt là cột video gợi ý bên phải khi đang xem video):
 *    - Tự động trỏ CON TRỎ ĐỎ RỰC (▶ #1) vào VIDEO ĐẦU TIÊN ở cột bên phải.
 *    - [Tab] / [↓] / [j]: Chuyển con trỏ sang video tiếp theo (▶ #2, ▶ #3,...).
 *    - [Shift + Tab] / [↑] / [k]: Lùi lại video trước.
 *    - [Enter]: Mở video trong TAB MỚI CHẠY NGẦM (Video hiện tại vẫn tiếp tục phát!).
 *    - [/] hoặc [Esc]: Nhảy nhanh vào ô tìm kiếm YouTube.
 * 
 * 2. DIỄN ĐÀN (Voz, Tinhte, Reddit, XenForo,...):
 *    - Đọc bài viết: Tự trỏ bình luận #1, [Tab] cuộn đọc từng comment trọn vẹn.
 *    - Danh sách bài: Tự trỏ topic #1, [Tab] nhảy topic tiếp, [Enter] mở tab ngầm.
 *    - [Shift + →] / [Shift + ←]: Chuyển trang (Next/Prev Page) liền mạch.
 * 
 * 3. GOOGLE SEARCH:
 *    - Tự trỏ kết quả 1, [Tab] nhảy kết quả, [Enter] mở tab ngầm.
 * ==============================================================================
 */

(() => {
  'use strict';

  let currentItems = [];         // Danh sách các phần tử (video / comment / topic / kết quả)
  let currentIndex = 0;          // Vị trí phần tử đang được trỏ tới
  let pointerBadge = null;       // Con trỏ hiển thị số thứ tự
  let ytPointerElement = null;   // Con trỏ nổi bật trên YouTube
  let pageMode = 'unknown';      // Chế độ: 'youtube' | 'comments' | 'thread_list' | 'google' | 'generic'
  let toastTimeout = null;
  let ytRetryInterval = null;
  const copiedVideoIds = new Set(); // Bộ nhớ lưu trữ các video ID đã copy / đã xem

  /**
   * Kiểm tra xem người dùng có đang thực sự gõ văn bản hay không
   */
  function isTypingContext(e) {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) {
      return false;
    }

    const tagName = active.tagName.toLowerCase();

    if (tagName === 'textarea') return true;

    if (tagName === 'input') {
      const type = (active.getAttribute('type') || 'text').toLowerCase();
      const textTypes = ['text', 'search', 'password', 'email', 'number', 'tel', 'url'];
      if (textTypes.includes(type)) return true;
    }

    if (active.isContentEditable || active.getAttribute('contenteditable') === 'true') {
      return true;
    }

    if (active.classList.contains('fr-element') || active.classList.contains('fr-view')) {
      return true;
    }

    return false;
  }

  /**
   * Hiển thị thông báo nhỏ (Toast HUD) góc màn hình
   */
  function showToast(message) {
    let toast = document.querySelector('.smart-nav-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'smart-nav-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('show');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 1600);
  }

  /**
   * MỞ TAB MỚI Ở CHẾ ĐỘ NỀN (BACKGROUND TAB)
   */
  function openLinkInBackground(url) {
    if (!url) return;

    try {
      chrome.runtime.sendMessage({
        action: 'openBackgroundTab',
        url: url
      }, () => {
        // Đọc lastError để tránh Chrome báo Unchecked runtime.lastError
        if (chrome.runtime.lastError) {
          // Bỏ qua hoặc dùng fallback
        }
      });
      showToast('🔗 Đã mở tab mới ở chế độ nền');
    } catch (err) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noreferrer noopener';
      a.dispatchEvent(new MouseEvent('click', { ctrlKey: true, metaKey: true }));
      showToast('🔗 Đã mở liên kết trong tab mới');
    }
  }

  /**
   * SAO CHÉP VĂN BẢN VÀO CLIPBOARD (HỖ TRỢ FALLBACK AN TOÀN)
   */
  async function copyToClipboard(text) {
    if (!text) return false;

    // 1. Thử dùng Clipboard API hiện đại
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('[Smart Nav] navigator.clipboard failed, fallback to textarea copy', err);
      }
    }

    // 2. Fallback dùng textarea ẩn + execCommand
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '1px';
      textarea.style.height = '1px';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (err) {
      console.error('[Smart Nav] Fallback copy failed:', err);
      return false;
    }
  }

  /**
   * CHUẨN HÓA VÀ LÀM SẠCH LINK YOUTUBE (XÓA TRACKING TOKEN NHƯ SI, PP,...)
   */
  function getCleanYouTubeUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, window.location.origin);

      // 1. Shorts (/shorts/VIDEO_ID)
      if (url.pathname.startsWith('/shorts/')) {
        const parts = url.pathname.split('/');
        const videoId = parts[2];
        if (videoId) {
          return `https://www.youtube.com/shorts/${videoId}`;
        }
      }

      // 2. Video thông thường (/watch?v=VIDEO_ID)
      if (url.pathname === '/watch' || url.searchParams.has('v')) {
        const v = url.searchParams.get('v');
        if (v) {
          let clean = `https://www.youtube.com/watch?v=${v}`;
          const list = url.searchParams.get('list');
          if (list) {
            clean += `&list=${list}`;
          }
          return clean;
        }
      }

      // 3. Trực tiếp (/live/VIDEO_ID)
      if (url.pathname.startsWith('/live/')) {
        const parts = url.pathname.split('/');
        const videoId = parts[2];
        if (videoId) {
          return `https://www.youtube.com/live/${videoId}`;
        }
      }

      // 4. Nếu là link khác trên YouTube, loại bỏ tracking query params
      url.searchParams.delete('si');
      url.searchParams.delete('pp');
      url.searchParams.delete('feature');
      url.searchParams.delete('ab_channel');
      return url.href;
    } catch (err) {
      return rawUrl;
    }
  }

  /**
   * TRÍCH XUẤT VIDEO ID YOUTUBE CHUẨN XÁC (/watch?v=, /shorts/, /live/, youtu.be/)
   */
  function extractYouTubeVideoId(rawUrl) {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl, window.location.origin);
      if (url.searchParams.has('v')) {
        const v = url.searchParams.get('v');
        if (v) return v.trim();
      }
      if (url.pathname.startsWith('/shorts/')) {
        const seg = url.pathname.replace('/shorts/', '').split('/')[0].split('?')[0];
        if (seg) return seg.trim();
      }
      if (url.pathname.startsWith('/live/')) {
        const seg = url.pathname.replace('/live/', '').split('/')[0].split('?')[0];
        if (seg) return seg.trim();
      }
      if (url.hostname.includes('youtu.be')) {
        const seg = url.pathname.replace(/^\//, '').split('/')[0].split('?')[0];
        if (seg) return seg.trim();
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * TẢI DANH SÁCH VIDEO ĐÃ COPY / ĐÃ XEM TỪ BỘ NHỚ LƯU TRỮ VĨNH VIỄN
   */
  function loadCopiedVideoIds() {
    try {
      const local = localStorage.getItem('smart_nav_copied_videos');
      if (local) {
        const arr = JSON.parse(local);
        if (Array.isArray(arr)) {
          arr.forEach(id => copiedVideoIds.add(id));
        }
      }
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get(['copiedVideoIds'], (res) => {
          if (chrome.runtime?.lastError) return;
          if (res && Array.isArray(res.copiedVideoIds)) {
            res.copiedVideoIds.forEach(id => copiedVideoIds.add(id));
            updateAllVideoButtonsState();
          }
        });
      } catch (e) {}
    }
  }

  /**
   * ĐÁNH DẤU VIDEO LÀ ĐÃ COPY / ĐÃ XEM VÀ LƯU VÀO STORAGE
   */
  function markVideoAsCopied(videoId) {
    if (!videoId) return;
    copiedVideoIds.add(videoId);

    try {
      localStorage.setItem('smart_nav_copied_videos', JSON.stringify(Array.from(copiedVideoIds)));
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.set({ copiedVideoIds: Array.from(copiedVideoIds) }, () => {
          if (chrome.runtime?.lastError) {}
        });
      } catch (e) {}
    }

    updateAllVideoButtonsState(videoId);
  }

  /**
   * TỰ ĐỘNG BÁO CHO YOUTUBE: "TÔI ĐÃ XEM VIDEO NÀY RỒI" (CÁCH A)
   * Chuỗi thao tác: 3 chấm ➔ Không quan tâm ➔ Cho chúng tôi biết lý do ➔ Tôi đã xem video này rồi ➔ Gửi
   */
  async function dismissVideoAsWatched(card) {
    if (!card) return false;
    try {
      // 1. Tìm nút 3 chấm menu trên thẻ video
      const menuBtn = card.querySelector(
        'ytd-menu-renderer yt-icon-button button, ytd-menu-renderer #button, ' +
        'button[aria-label*="Action menu"], button[aria-label*="Menu"], button[aria-label*="menu"], ' +
        'yt-icon-button.dropdown-trigger button, yt-icon-button.dropdown-trigger, #menu button'
      );
      if (!menuBtn) return false;

      // Click nút 3 chấm để mở menu
      menuBtn.click();

      // 2. Chờ popup menu xuất hiện và tìm mục "Không quan tâm" / "Not interested"
      let notInterestedItem = null;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 60));
        const items = document.querySelectorAll(
          'ytd-menu-popup-renderer ytd-menu-service-item-renderer, ' +
          'ytd-menu-popup-renderer tp-yt-paper-item, ' +
          'ytd-menu-popup-renderer yt-formatted-string'
        );
        for (const item of items) {
          const text = (item.textContent || '').trim().toLowerCase();
          if (text.includes('không quan tâm') || text.includes('not interested')) {
            notInterestedItem = item;
            break;
          }
        }
        if (notInterestedItem) break;
      }

      if (!notInterestedItem) {
        // Đóng menu nếu không tìm thấy tùy chọn
        document.body.click();
        return false;
      }

      // Click "Không quan tâm"
      notInterestedItem.click();

      // 3. Chờ thẻ video chuyển sang ô thông báo có nút "Cho chúng tôi biết lý do" / "Tell us why"
      let tellUsWhyBtn = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 70));
        const notif = card.querySelector(
          'ytd-notification-multi-action-renderer, ytd-dismissed-renderer, #dismissed'
        ) || card;
        const buttons = notif.querySelectorAll('button, yt-button-shape button, a');
        for (const btn of buttons) {
          const text = (btn.textContent || '').trim().toLowerCase();
          if (text.includes('lý do') || text.includes('tell us why')) {
            tellUsWhyBtn = btn;
            break;
          }
        }
        if (tellUsWhyBtn) break;
      }

      if (!tellUsWhyBtn) return true;

      // Click "Cho chúng tôi biết lý do"
      tellUsWhyBtn.click();

      // 4. Chờ danh sách lý do xuất hiện và tìm "Tôi đã xem video này rồi" / "already watched"
      let alreadyWatchedOption = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 70));
        const options = document.querySelectorAll(
          'ytd-dismissal-follow-up-renderer, tp-yt-paper-checkbox, yt-checkbox-renderer, ' +
          'ytd-checkbox-renderer, tp-yt-paper-radio-button, [role="checkbox"], [role="radio"], ' +
          'ytd-dismissal-follow-up-renderer yt-formatted-string, ytd-dismissal-follow-up-renderer label'
        );
        for (const opt of options) {
          const text = (opt.textContent || '').trim().toLowerCase();
          if (text.includes('đã xem') || text.includes('already watched')) {
            alreadyWatchedOption = opt;
            break;
          }
        }
        if (alreadyWatchedOption) break;
      }

      if (alreadyWatchedOption) {
        alreadyWatchedOption.click();

        // 5. Chờ 80ms rồi bấm nút "Gửi" / "Submit"
        await new Promise(r => setTimeout(r, 80));
        const allButtons = document.querySelectorAll(
          'ytd-dismissal-follow-up-renderer button, ytd-dismissal-follow-up-renderer yt-button-shape button, [role="dialog"] button'
        );
        for (const b of allButtons) {
          const text = (b.textContent || '').trim().toLowerCase();
          if (text === 'gửi' || text === 'submit') {
            b.click();
            break;
          }
        }
      }

      return true;
    } catch (err) {
      console.warn('[Smart Nav] Gửi phản hồi đã xem tới YouTube:', err);
      return false;
    }
  }

  /**
   * CẬP NHẬT GIAO DIỆN NÚT (DẤU TÍCH XANH HOẶC NÚT COPY GỐC)
   */
  function applyButtonCopiedState(btn, isWatched) {
    if (!btn) return;
    const iconCopy = btn.querySelector('.icon-copy');
    const iconCheck = btn.querySelector('.icon-check');
    const label = btn.querySelector('.smart-nav-btn-label') || btn.querySelector('.watch-btn-label');

    if (isWatched) {
      btn.classList.add('already-copied');
      btn.title = '✓ Video này bạn đã copy & xem rồi (Bấm để copy lại)';
      if (iconCopy) iconCopy.style.display = 'none';
      if (iconCheck) iconCheck.style.display = 'inline-block';
      if (label) {
        label.textContent = btn.classList.contains('smart-nav-watch-copy-btn') ? '✓ Đã xem' : 'Đã xem';
      }
    } else {
      btn.classList.remove('already-copied');
      btn.title = 'Sao chép link clip (Click để copy)';
      if (iconCopy) iconCopy.style.display = 'inline-block';
      if (iconCheck) iconCheck.style.display = 'none';
      if (label) {
        label.textContent = btn.classList.contains('smart-nav-watch-copy-btn') ? 'Copy link' : 'Copy';
      }
    }
  }

  /**
   * CẬP NHẬT TRẠNG THÁI CHO TẤT CẢ NÚT ĐANG HIỂN THỊ TRÊN MÀN HÌNH
   */
  function updateAllVideoButtonsState(targetVideoId = null) {
    const thumbBtns = document.querySelectorAll('.smart-nav-copy-btn');
    thumbBtns.forEach(btn => {
      const rawHref = getLinkFromButtonContext(btn);
      const videoId = extractYouTubeVideoId(rawHref);
      if (!videoId) return;
      if (!targetVideoId || targetVideoId === videoId) {
        applyButtonCopiedState(btn, copiedVideoIds.has(videoId));
      }
    });

    const watchBtn = document.querySelector('.smart-nav-watch-copy-btn');
    if (watchBtn) {
      const currentVideoId = extractYouTubeVideoId(window.location.href);
      if (currentVideoId && (!targetVideoId || targetVideoId === currentVideoId)) {
        applyButtonCopiedState(watchBtn, copiedVideoIds.has(currentVideoId));
      }
    }
  }

  /**
   * LẤY LINK TƯƠI MỚI NHẤT TỪ THẺ VIDEO CHA (TRÁNH LỖI VIRTUAL SCROLL RECYCLE DOM CỦA YOUTUBE)
   */
  function getLinkFromButtonContext(btn) {
    const card = btn.closest(
      'ytd-compact-video-renderer, ytd-compact-playlist-renderer, ytd-compact-radio-renderer, ' +
      'ytd-playlist-panel-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ' +
      'ytd-playlist-renderer, ytd-radio-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer, ' +
      'yt-shorts-item-view-model, ytd-rich-grid-shorts-renderer, yt-lockup-view-model, ytd-lockup-view-model, ' +
      'div#dismissible, [class*="lockup"]'
    ) || btn.parentElement;

    if (card) {
      const linkEl = card.querySelector(
        'a#thumbnail[href], a#video-title-link, a.yt-lockup-metadata-view-model-wiz__title, a[href*="/watch"], a[href*="/shorts/"], a[href*="/playlist"], a[href*="/live/"], a.ytd-thumbnail, a[href]'
      );
      if (linkEl && linkEl.href) {
        return linkEl.href;
      }
    }
    return btn.dataset.fallbackHref || '';
  }

  /**
   * TẠO NÚT BẤM COPY LINK GẮN VÀO THUMBNAIL VIDEO
   */
  function createCopyButton(initialHref) {
    const btn = document.createElement('button');
    btn.className = 'smart-nav-copy-btn';
    btn.type = 'button';
    btn.title = 'Sao chép link clip (Click để copy)';
    btn.setAttribute('aria-label', 'Copy link video');
    btn.dataset.fallbackHref = initialHref || '';

    btn.innerHTML = `
      <svg class="icon-copy" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="icon-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="smart-nav-btn-label">Copy</span>
    `;

    // Khởi tạo trạng thái đã xem nếu ID đã có trong bộ nhớ
    const initialVideoId = extractYouTubeVideoId(initialHref);
    if (initialVideoId && copiedVideoIds.has(initialVideoId)) {
      applyButtonCopiedState(btn, true);
    }

    // Chặn tất cả sự kiện chuột/chạm để YouTube không bị nhảy trang hay phát video khi bấm nút
    ['mousedown', 'mouseup', 'pointerdown', 'touchstart'].forEach(evtType => {
      btn.addEventListener(evtType, (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const card = btn.closest(
        'ytd-compact-video-renderer, ytd-compact-playlist-renderer, ytd-compact-radio-renderer, ' +
        'ytd-playlist-panel-video-renderer, ytd-video-renderer, ytd-grid-video-renderer, ' +
        'ytd-playlist-renderer, ytd-radio-renderer, ytd-rich-item-renderer, ytd-reel-item-renderer, ' +
        'yt-shorts-item-view-model, ytd-rich-grid-shorts-renderer, yt-lockup-view-model, ytd-lockup-view-model, ' +
        'div#dismissible, [class*="lockup"]'
      ) || btn.parentElement;

      const rawHref = getLinkFromButtonContext(btn);
      if (!rawHref) {
        showToast('⚠️ Không tìm thấy link video để copy');
        return;
      }

      const cleanUrl = getCleanYouTubeUrl(rawHref);
      const success = await copyToClipboard(cleanUrl);

      if (success) {
        const videoId = extractYouTubeVideoId(cleanUrl) || extractYouTubeVideoId(rawHref);
        if (videoId) {
          markVideoAsCopied(videoId);
        }

        btn.classList.add('flash-copied');
        const iconCopy = btn.querySelector('.icon-copy');
        const iconCheck = btn.querySelector('.icon-check');
        const label = btn.querySelector('.smart-nav-btn-label');

        if (iconCopy) iconCopy.style.display = 'none';
        if (iconCheck) iconCheck.style.display = 'inline-block';
        if (label) label.textContent = 'Đã copy!';

        showToast(`📋 Đã copy link & Đã báo YouTube: Đã xem video này rồi!`);

        // Tự động kích hoạt chuỗi phản hồi "Tôi đã xem video này rồi" tới YouTube
        if (card) {
          dismissVideoAsWatched(card);
        }

        setTimeout(() => {
          btn.classList.remove('flash-copied');
          const isWatched = videoId ? copiedVideoIds.has(videoId) : false;
          applyButtonCopiedState(btn, isWatched);
        }, 1200);
      } else {
        showToast('⚠️ Không thể copy link vào clipboard');
      }
    }, true);

    return btn;
  }

  /**
   * TẠO VÀ GẮN NÚT COPY TRÊN THANH CÔNG CỤ CỦA TRANG WATCH (DƯỚI VIDEO ĐANG PHÁT)
   */
  function attachWatchPageCopyButton() {
    if (!window.location.pathname.startsWith('/watch')) return;
    if (document.querySelector('.smart-nav-watch-copy-btn')) return;

    const targetContainer = document.querySelector(
      '#above-the-fold #top-row #actions #top-level-buttons-computed, #actions-inner #top-level-buttons-computed, #actions #top-level-buttons-computed, #top-level-buttons-computed'
    );
    if (!targetContainer) return;

    const watchBtn = document.createElement('button');
    watchBtn.className = 'smart-nav-watch-copy-btn';
    watchBtn.type = 'button';
    watchBtn.title = 'Sao chép link video đang xem';
    watchBtn.innerHTML = `
      <svg class="icon-copy" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="icon-check" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="watch-btn-label">Copy link</span>
    `;

    const currentVideoId = extractYouTubeVideoId(window.location.href);
    if (currentVideoId && copiedVideoIds.has(currentVideoId)) {
      applyButtonCopiedState(watchBtn, true);
    }

    watchBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const cleanUrl = getCleanYouTubeUrl(window.location.href);
      const success = await copyToClipboard(cleanUrl);

      if (success) {
        const videoId = extractYouTubeVideoId(cleanUrl) || extractYouTubeVideoId(window.location.href);
        if (videoId) {
          markVideoAsCopied(videoId);
        }

        watchBtn.classList.add('flash-copied');
        const iconCopy = watchBtn.querySelector('.icon-copy');
        const iconCheck = watchBtn.querySelector('.icon-check');
        const label = watchBtn.querySelector('.watch-btn-label');

        if (iconCopy) iconCopy.style.display = 'none';
        if (iconCheck) iconCheck.style.display = 'inline-block';
        if (label) label.textContent = 'Đã copy!';

        showToast(`📋 Đã copy link video đang phát (Đã ghi nhận xem trên YouTube)`);

        setTimeout(() => {
          watchBtn.classList.remove('flash-copied');
          const isWatched = videoId ? copiedVideoIds.has(videoId) : false;
          applyButtonCopiedState(watchBtn, isWatched);
        }, 1200);
      } else {
        showToast('⚠️ Không thể copy link vào clipboard');
      }
    });

    targetContainer.insertBefore(watchBtn, targetContainer.firstChild);
  }

  /**
   * TỰ ĐỘNG QUÉT VÀ GẮN NÚT COPY CHO TẤT CẢ CÁC VIDEO TRÊN YOUTUBE
   */
  function attachCopyButtonsToYouTube() {
    if (!window.location.hostname.includes('youtube.com')) return;

    // 1. Gắn nút cho thanh công cụ trang đang xem video
    attachWatchPageCopyButton();

    // 2. Quét các thẻ card video
    const videoCardSelectors = `
      ytd-compact-video-renderer,
      ytd-compact-playlist-renderer,
      ytd-compact-radio-renderer,
      ytd-playlist-panel-video-renderer,
      ytd-video-renderer,
      ytd-grid-video-renderer,
      ytd-playlist-renderer,
      ytd-radio-renderer,
      ytd-rich-item-renderer,
      ytd-reel-item-renderer,
      yt-shorts-item-view-model,
      ytd-rich-grid-shorts-renderer,
      yt-lockup-view-model,
      ytd-lockup-view-model,
      ytd-ad-slot-renderer,
      ytd-in-feed-ad-layout-renderer
    `;

    const cards = document.querySelectorAll(videoCardSelectors);

    cards.forEach(card => {
      // Đã có nút rồi thì bỏ qua
      if (card.querySelector('.smart-nav-copy-btn')) return;

      const linkEl = card.querySelector(
        'a#thumbnail[href], a#video-title-link, a.yt-lockup-metadata-view-model-wiz__title, a[href*="/watch"], a[href*="/shorts/"], a[href*="/playlist"], a[href*="/live/"], a.ytd-thumbnail, a[href]'
      );
      if (!linkEl || !linkEl.href) return;

      const rawHref = linkEl.href;
      if (!rawHref.includes('/watch') && !rawHref.includes('/shorts/') && !rawHref.includes('/live/') && !rawHref.includes('/playlist')) {
        return;
      }

      const thumbEl = card.querySelector(
        'ytd-thumbnail, yt-thumbnail-view-model, #thumbnail, a#thumbnail, .yt-lockup-view-model__thumbnail, ytd-playlist-thumbnail'
      ) || card;

      thumbEl.style.position = 'relative';

      const btn = createCopyButton(rawHref);
      thumbEl.appendChild(btn);
    });

    // 3. Dự phòng cho Shorts hoặc các video link khác nếu YouTube đổi cấu trúc thẻ
    const otherLinks = document.querySelectorAll('a#thumbnail[href*="/watch"], a#thumbnail[href*="/shorts/"]');
    otherLinks.forEach(link => {
      if (link.querySelector('.smart-nav-copy-btn') || link.parentElement.querySelector('.smart-nav-copy-btn')) return;
      link.style.position = 'relative';
      const btn = createCopyButton(link.href);
      link.appendChild(btn);
    });

    // 4. Đồng bộ trạng thái đã copy / đã xem cho tất cả các nút
    updateAllVideoButtonsState();
  }

  // ============================================================================
  // PHẦN: TÍNH NĂNG COPY LINK VIDEO / REEL CHO FACEBOOK (DÙNG CHO SKILL XEM VIDEO)
  // ============================================================================

  /**
   * LÀM SẠCH VÀ CHUẨN HÓA LINK VIDEO / REEL FACEBOOK (LOẠI BỎ TRACKING FBCLID, MIBEXTID...)
   */
  function getCleanFacebookUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const url = new URL(rawUrl, window.location.origin);

      // Xóa tất cả tham số tracking rác của Facebook
      const trackingParams = [
        'fbclid', 'mibextid', 'rdid', 'ref', 'refsrc', 'hrc',
        '__cft__', '__tn__', 'fs', 's', 'sfnsn', 'locale2', 'paipv',
        'checkpoint_src', 'notif_id', 'notif_t', 'startTime', 'comment_id'
      ];
      trackingParams.forEach(p => url.searchParams.delete(p));

      // 1. Dạng Facebook Reel (/reel/123456789)
      const reelMatch = url.pathname.match(/\/reel\/([0-9a-zA-Z_-]+)/);
      if (reelMatch) {
        return `https://www.facebook.com/reel/${reelMatch[1]}`;
      }

      // 2. Dạng Facebook Watch (/watch/?v=123456789)
      if (url.searchParams.has('v')) {
        const v = url.searchParams.get('v');
        if (v) {
          return `https://www.facebook.com/watch/?v=${v}`;
        }
      }

      // 3. Dạng Profile / Page Videos (/username/videos/123456789/)
      const videoMatch = url.pathname.match(/\/videos\/([0-9a-zA-Z_-]+)/);
      if (videoMatch) {
        return `https://www.facebook.com/watch/?v=${videoMatch[1]}`;
      }

      // 4. Dạng Posts (/username/posts/pfbid... hoặc /username/posts/12345)
      const postMatch = url.pathname.match(/\/posts\/([0-9a-zA-Z_-]+)/);
      if (postMatch) {
        return `https://www.facebook.com${url.pathname}`;
      }

      // 5. Dạng permalink.php?story_fbid=...&id=...
      if (url.pathname.includes('permalink.php') && url.searchParams.has('story_fbid')) {
        let clean = `https://www.facebook.com/permalink.php?story_fbid=${url.searchParams.get('story_fbid')}`;
        if (url.searchParams.has('id')) {
          clean += `&id=${url.searchParams.get('id')}`;
        }
        return clean;
      }

      return url.origin + url.pathname + (url.search ? url.search : '');
    } catch (e) {
      return rawUrl;
    }
  }

  /**
   * TÌM LINK GỐC CỦA VIDEO TRÊN FACEBOOK TỪ THẺ VIDEO VÀ ANCESTOR DOM
   */
  function findFacebookVideoUrl(videoEl) {
    // 1. Nếu người dùng đang mở trang Reel hoặc Watch trực tiếp
    if (window.location.pathname.startsWith('/reel')) {
      return getCleanFacebookUrl(window.location.href);
    }
    if (window.location.pathname.startsWith('/watch')) {
      return getCleanFacebookUrl(window.location.href);
    }

    // 2. Duyệt ngược lên các thẻ cha (tối đa 15 cấp) để tìm thẻ chứa link bài viết hoặc video
    let curr = videoEl;
    let maxSteps = 15;
    while (curr && curr !== document.body && maxSteps > 0) {
      maxSteps--;

      // Ưu tiên 1: Link trực tiếp tới Reel hoặc Video hoặc Watch
      const direct = curr.querySelector(
        'a[href*="/reel/"], a[href*="/videos/"], a[href*="/watch?v="], a[href*="/watch/?v="]'
      );
      if (direct && direct.href) {
        return getCleanFacebookUrl(direct.href);
      }

      // Ưu tiên 2: Link bài viết (posts, permalink, story_fbid)
      const postLink = curr.querySelector(
        'a[href*="/posts/"], a[href*="/permalink/"], a[href*="permalink.php"], a[href*="story.php"], a[href*="story_fbid="]'
      );
      if (postLink && postLink.href) {
        return getCleanFacebookUrl(postLink.href);
      }

      // Ưu tiên 3: Link timestamp (ngày/giờ đăng)
      const timeLink = curr.querySelector(
        'a[aria-label*="giờ"], a[aria-label*="phút"], a[aria-label*="ngày"], a[aria-label*="ago"], a[aria-label*="hour"], a[aria-label*="min"], a[aria-label*="yesterday"]'
      );
      if (timeLink && timeLink.href) {
        return getCleanFacebookUrl(timeLink.href);
      }

      curr = curr.parentElement;
    }

    // 3. Quét toàn bộ các link <a> trong post/dialog gần nhất
    const root = videoEl.closest('div[role="article"], div[role="dialog"], [data-pagelet*="FeedUnit"], div[role="main"]') || document;
    const candidates = root.querySelectorAll('a[href]');
    for (const a of candidates) {
      const h = a.href || '';
      if (h.includes('/reel/') || h.includes('/videos/') || h.includes('/watch') || h.includes('/posts/') || h.includes('story_fbid=')) {
        return getCleanFacebookUrl(h);
      }
    }

    return getCleanFacebookUrl(window.location.href);
  }

  /**
   * TẠO NÚT BẤM COPY LINK GẮN VÀO VIDEO FACEBOOK
   */
  function createFacebookCopyButton(videoEl) {
    const btn = document.createElement('button');
    btn.className = 'smart-nav-fb-copy-btn';
    btn.type = 'button';
    btn.title = 'Sao chép link clip Facebook (Dùng cho skill xem video)';
    btn.setAttribute('aria-label', 'Copy link clip Facebook');

    btn.innerHTML = `
      <svg class="icon-copy" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="icon-check" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="smart-nav-fb-btn-label">Copy clip</span>
    `;

    let isCopying = false;
    async function doCopy(e) {
      if (e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.preventDefault) e.preventDefault();
      }
      if (isCopying) return;
      isCopying = true;
      setTimeout(() => { isCopying = false; }, 800);

      const rawUrl = findFacebookVideoUrl(videoEl);
      if (!rawUrl) {
        showToast('⚠️ Không tìm thấy link clip Facebook để copy');
        return;
      }

      const cleanUrl = getCleanFacebookUrl(rawUrl);
      const success = await copyToClipboard(cleanUrl);

      if (success) {
        btn.classList.add('flash-copied');
        const iconCopy = btn.querySelector('.icon-copy');
        const iconCheck = btn.querySelector('.icon-check');
        const label = btn.querySelector('.smart-nav-fb-btn-label');

        if (iconCopy) iconCopy.style.display = 'none';
        if (iconCheck) iconCheck.style.display = 'inline-block';
        if (label) label.textContent = 'Đã copy!';

        showToast(`📋 Đã copy link clip Facebook! (Sẵn sàng gửi skill xem video)`);

        setTimeout(() => {
          btn.classList.remove('flash-copied');
          if (iconCopy) iconCopy.style.display = 'inline-block';
          if (iconCheck) iconCheck.style.display = 'none';
          if (label) label.textContent = 'Copy clip';
        }, 1300);
      } else {
        showToast('⚠️ Không thể copy link vào clipboard');
      }
    }

    // Chỉ chặn propagation để video Facebook không bị pause/nhảy trang, KHÔNG preventDefault mousedown!
    ['pointerdown', 'mousedown', 'mouseup'].forEach(evtType => {
      btn.addEventListener(evtType, (e) => {
        e.stopPropagation();
      });
    });

    // Lắng nghe cả click và pointerup để kích hoạt 100% không bị Facebook nuốt sự kiện
    btn.addEventListener('click', doCopy);
    btn.addEventListener('pointerup', doCopy);

    return btn;
  }

  /**
   * TỰ ĐỘNG QUÉT VÀ GẮN NÚT COPY CHO TẤT CẢ VIDEO / REEL TRÊN FACEBOOK
   */
  function attachCopyButtonsToFacebook() {
    if (!window.location.hostname.includes('facebook.com')) return;

    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      // Bỏ qua các video icon / preview quá nhỏ (nếu có)
      if (video.offsetWidth > 0 && video.offsetWidth < 120) return;
      if (video.offsetHeight > 0 && video.offsetHeight < 80) return;

      // Tìm container bao quát toàn bộ khung video player để nút nằm trên lớp hiển thị cao nhất
      let wrapper = video.closest(
        '[data-video-id], div[role="region"], div[aria-label*="Video"], div[aria-label*="video"], div[data-pagelet*="Reels"]'
      ) || video.parentElement;

      while (wrapper && wrapper !== document.body && wrapper.offsetHeight < 60) {
        wrapper = wrapper.parentElement;
      }
      if (!wrapper || wrapper === document.body) {
        wrapper = video.parentElement;
      }
      if (!wrapper) return;

      // Nếu đã có nút trong wrapper này rồi thì bỏ qua
      if (wrapper.querySelector('.smart-nav-fb-copy-btn')) return;

      // Đảm bảo wrapper có position relative để nút định vị tuyệt đối chuẩn xác
      const computedPos = window.getComputedStyle(wrapper).position;
      if (computedPos === 'static') {
        wrapper.style.position = 'relative';
      }

      const btn = createFacebookCopyButton(video);
      wrapper.appendChild(btn);
    });
  }

  /**
   * Tạo hoặc lấy thẻ con trỏ chuyên dụng cho YouTube
   */
  function getOrCreateYtPointer() {
    if (!ytPointerElement) {
      ytPointerElement = document.createElement('div');
      ytPointerElement.className = 'smart-nav-yt-pointer';
    }
    return ytPointerElement;
  }

  /**
   * Tạo hoặc lấy thẻ badge con trỏ cho Web/Diễn đàn
   */
  function getOrCreateBadge() {
    if (!pointerBadge) {
      pointerBadge = document.createElement('span');
      pointerBadge.className = 'smart-nav-pointer-badge';
    }
    return pointerBadge;
  }

  /**
   * THUẬT TOÁN CUỘN THÔNG MINH (SMART SCROLL)
   */
  function smartScrollToElement(element) {
    if (!element) return;

    const headerOffset = (pageMode === 'youtube') ? 90 : 70;
    const windowHeight = window.innerHeight;
    const elementRect = element.getBoundingClientRect();
    const elementHeight = elementRect.height;
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    const absoluteElementTop = elementRect.top + currentScrollY;

    const availableHeight = windowHeight - headerOffset - 25;
    let targetScrollY;

    if (elementHeight <= availableHeight) {
      const topPadding = Math.min(25, (availableHeight - elementHeight) / 3);
      targetScrollY = absoluteElementTop - headerOffset - topPadding;
    } else {
      targetScrollY = absoluteElementTop - headerOffset - 10;
    }

    const maxScrollY = Math.max(0, document.documentElement.scrollHeight - windowHeight);
    targetScrollY = Math.max(0, Math.min(targetScrollY, maxScrollY));

    window.scrollTo({
      top: targetScrollY,
      behavior: 'smooth'
    });
  }


  // ============================================================================
  // PHẦN 2: THUẬT TOÁN QUÉT VIDEO TRÊN YOUTUBE (CỘT BÊN PHẢI & TRANG CHỦ)
  // ============================================================================

  function scanYouTubeVideos() {
    const pathname = window.location.pathname;
    const isWatchPage = pathname.startsWith('/watch');
    const results = [];
    const seenHrefs = new Set();
    const seenElements = new Set();

    // Xác định khu vực chứa video
    let containerRoots = [];
    if (isWatchPage) {
      // Ưu tiên tìm trong cột bên phải: #secondary, #related, ytd-watch-next-secondary-results-renderer
      const secondary = document.querySelector('#secondary, #related, ytd-watch-next-secondary-results-renderer, #secondary-inner, ytd-item-section-renderer[section-identifier="related-items"]');
      if (secondary) containerRoots.push(secondary);
    }
    // Nếu không tìm thấy hoặc ở trang chủ/tìm kiếm, tìm toàn trang
    if (containerRoots.length === 0) {
      containerRoots.push(document);
    }

    for (const root of containerRoots) {
      // 1. Quét TẤT CẢ các thẻ card video / playlist / mix / shorts / ads trên YouTube theo thứ tự trực quan
      const videoCardSelectors = `
        ytd-compact-video-renderer,
        ytd-compact-playlist-renderer,
        ytd-compact-radio-renderer,
        ytd-playlist-panel-video-renderer,
        ytd-video-renderer,
        ytd-grid-video-renderer,
        ytd-playlist-renderer,
        ytd-radio-renderer,
        ytd-rich-item-renderer,
        ytd-reel-item-renderer,
        yt-shorts-item-view-model,
        ytd-rich-grid-shorts-renderer,
        ytd-ad-slot-renderer,
        ytd-in-feed-ad-layout-renderer,
        yt-lockup-view-model,
        ytd-lockup-view-model
      `;

      const allCards = Array.from(root.querySelectorAll(videoCardSelectors));

      if (allCards.length > 0) {
        // Lọc chỉ lấy thẻ cha cấp ngoài cùng để tránh bị quét trùng các thẻ con lồng nhau
        const topLevelCards = allCards.filter(card => {
          return !allCards.some(other => other !== card && other.contains(card));
        });

        for (const card of topLevelCards) {
          // Bỏ qua phần tử ẩn hoàn toàn
          if (card.offsetParent === null && card.getBoundingClientRect().height === 0) {
            continue;
          }

          // Tìm liên kết (Video thường, Shorts, Playlist, Mix, Ads, v.v.)
          const linkEl = card.querySelector(
            'a#thumbnail[href], a#video-title-link, a.yt-lockup-metadata-view-model-wiz__title, a[href*="/watch"], a[href*="/shorts/"], a[href*="/playlist"], a[href*="/live/"], a.ytd-thumbnail, a[href]'
          );
          if (!linkEl || !linkEl.href) continue;

          const rawHref = linkEl.href;
          if (seenHrefs.has(rawHref) || seenElements.has(card)) continue;
          seenHrefs.add(rawHref);
          seenElements.add(card);

          // Tìm thumbnail container để gắn con trỏ đỏ lên góc thumbnail
          const thumbEl = card.querySelector(
            'ytd-thumbnail, yt-thumbnail-view-model, #thumbnail, a#thumbnail, .yt-lockup-view-model__thumbnail, ytd-playlist-thumbnail, .yt-core-image, img'
          ) || card;

          results.push({
            element: card,
            thumbEl: thumbEl,
            href: rawHref,
            type: 'youtube'
          });
        }
      }

      // 2. Dự phòng: Nếu giao diện YouTube thay đổi thẻ lạ, quét trực tiếp tất cả link video / shorts / playlist
      if (results.length === 0) {
        const allLinks = Array.from(root.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"], a[href*="/playlist"]'));
        for (const a of allLinks) {
          const rawHref = a.href;
          if (!rawHref || seenHrefs.has(rawHref)) continue;

          const container = a.closest('ytd-compact-video-renderer, ytd-compact-playlist-renderer, yt-lockup-view-model, ytd-rich-item-renderer, ytd-video-renderer, ytd-reel-item-renderer, div#dismissible, [class*="lockup"]') || a;
          if (seenElements.has(container)) continue;

          seenHrefs.add(rawHref);
          seenElements.add(container);

          const thumbEl = container.querySelector('ytd-thumbnail, yt-thumbnail-view-model, #thumbnail, img') || container;

          results.push({
            element: container,
            thumbEl: thumbEl,
            href: rawHref,
            type: 'youtube'
          });
        }
      }
    }

    return results;
  }


  // ============================================================================
  // PHẦN 3: THUẬT TOÁN QUÉT TỔNG HỢP (YOUTUBE / GOOGLE / DIỄN ĐÀN)
  // ============================================================================

  function scanPageItems() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    // ------------------------------------------------------------------------
    // TRƯỜNG HỢP 1: YOUTUBE
    // ------------------------------------------------------------------------
    if (hostname.includes('youtube.com')) {
      pageMode = 'youtube';
      return scanYouTubeVideos();
    }

    // ------------------------------------------------------------------------
    // TRƯỜNG HỢP 2: GOOGLE SEARCH
    // ------------------------------------------------------------------------
    if (hostname.includes('google.') && pathname.startsWith('/search')) {
      pageMode = 'google';
      const results = [];
      const seenHrefs = new Set();
      const links = Array.from(document.querySelectorAll('#search a, #rso a, .MjjYud a, .g a'));

      for (const a of links) {
        const titleEl = a.querySelector('h3');
        if (!titleEl) continue;

        const href = a.href;
        if (!href || href.startsWith('javascript:') || href.includes('google.com/search')) continue;

        const cleanHref = href.split('#')[0];
        if (seenHrefs.has(cleanHref)) continue;

        const rect = a.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && a.offsetParent === null) continue;

        seenHrefs.add(cleanHref);
        const container = a.closest('.MjjYud, .g, .Ww4FFb, .hlcw0c') || a;

        results.push({
          element: container,
          targetEl: titleEl,
          href: href,
          type: 'google'
        });
      }
      return results;
    }

    // ------------------------------------------------------------------------
    // TRƯỜNG HỢP 3: DIỄN ĐÀN - ĐỌC BÀI VIẾT & CÁC BÌNH LUẬN (COMMENTS / POSTS)
    // ------------------------------------------------------------------------
    const commentSelectors = [
      '.block--messages article.message--post',
      'article.message--post',
      'article.message[data-content="message"]',
      'article.message.js-post',
      '#posts .postcontainer',
      '.postcontainer',
      '.postbit',
      'li.postbitlegacy',
      '.post-stream .topic-post',
      '.topic-post',
      'article.boxed',
      'shreddit-comment',
      'div[data-testid="comment"]',
      '.commentlist li.comment',
      '.comment-list .comment',
      '.comments-area article.comment'
    ];

    for (const selector of commentSelectors) {
      const posts = Array.from(document.querySelectorAll(selector));
      const visiblePosts = posts.filter(el => el.offsetParent !== null);

      if (visiblePosts.length >= 1) {
        pageMode = 'comments';
        return visiblePosts.map(el => {
          const header = el.querySelector('.message-attribution-main, .message-attribution, .message-userDetails, .username, .author, .comment-author, h3, h4') || el;
          const permalink = el.querySelector('a.message-attribution-gadget, a[href*="/threads/"], a[rel="bookmark"], a.bnt-post-number');
          const firstContentLink = el.querySelector('.message-body a, .comment-content a, .post-content a');

          return {
            element: el,
            targetEl: header,
            href: permalink ? permalink.href : (firstContentLink ? firstContentLink.href : null),
            type: 'comment'
          };
        });
      }
    }

    // ------------------------------------------------------------------------
    // TRƯỜNG HỢP 4: DIỄN ĐÀN - XEM DANH SÁCH CHỦ ĐỀ (THREAD LIST)
    // ------------------------------------------------------------------------
    const threadListSelectors = [
      '.block-body .structItem--thread .structItem-title a[data-tp-primary]',
      '.block-body .structItem--thread .structItem-title a:not(.labelLink)',
      'tr.topic-list-item a.title',
      '#threadslist .threadbit .threadtitle a',
      '.threadbit .threadtitle a',
      'shreddit-feed shreddit-post a[slot="full-post-link"]',
      '.main-content article h2 a',
      'main article h2 a'
    ];

    for (const selector of threadListSelectors) {
      const links = Array.from(document.querySelectorAll(selector));
      const visibleLinks = links.filter(a => {
        if (a.closest('.similar-threads, [data-widget-key*="similar"], .widget-similar')) return false;
        return a.offsetParent !== null;
      });

      if (visibleLinks.length >= 2) {
        pageMode = 'thread_list';
        const results = [];
        const seenHrefs = new Set();

        for (const a of visibleLinks) {
          if (!a.href || seenHrefs.has(a.href)) continue;
          seenHrefs.add(a.href);

          const container = a.closest('.structItem, tr.topic-list-item, .threadbit, shreddit-post, article') || a;
          results.push({
            element: container,
            targetEl: a,
            href: a.href,
            type: 'thread'
          });
        }

        if (results.length > 0) return results;
      }
    }

    pageMode = 'generic';
    return [];
  }


  // ============================================================================
  // PHẦN 4: ĐIỀU HƯỚNG VÀ HIGHLIGHT CON TRỎ
  // ============================================================================

  function highlightIndex(index, shouldScroll = true) {
    if (currentItems.length === 0) return;

    currentIndex = Math.max(0, Math.min(index, currentItems.length - 1));

    // Xóa active cũ
    document.querySelectorAll('.smart-nav-active-item, .smart-nav-yt-active').forEach(el => {
      el.classList.remove('smart-nav-active-item');
      el.classList.remove('smart-nav-yt-active');
    });

    const item = currentItems[currentIndex];
    if (!item) return;

    if (pageMode === 'youtube') {
      // ----------------------------------------------------------------------
      // HIỂN THỊ CON TRỎ ĐỎ RỰC TRÊN YOUTUBE
      // ----------------------------------------------------------------------
      item.element.classList.add('smart-nav-yt-active');

      const ytPointer = getOrCreateYtPointer();
      ytPointer.innerHTML = `<span>▶</span> <span>#${currentIndex + 1}</span>`;

      // Gắn con trỏ trực tiếp lên góc Thumbnail của video
      const thumb = item.thumbEl || item.element;
      if (thumb) {
        thumb.style.position = 'relative';
        thumb.appendChild(ytPointer);
      }
    } else {
      // ----------------------------------------------------------------------
      // HIỂN THỊ CON TRỎ CHO DIỄN ĐÀN & GOOGLE
      // ----------------------------------------------------------------------
      item.element.classList.add('smart-nav-active-item');

      const badge = getOrCreateBadge();
      badge.textContent = (pageMode === 'comments') ? `💬 #${currentIndex + 1}` : `➤ #${currentIndex + 1}`;

      if (item.targetEl && item.targetEl.parentNode) {
        item.targetEl.prepend(badge);
      }
    }

    if (shouldScroll) {
      smartScrollToElement(item.element);
    }
  }

  function createHelpOverlay() {
    if (document.querySelector('.smart-nav-help-hud') || currentItems.length === 0) return;

    const hud = document.createElement('div');
    hud.className = 'smart-nav-help-hud';

    let hintHtml = '';
    if (pageMode === 'youtube') {
      hintHtml = `
        <span><kbd>Tab</kbd> Video tiếp</span>
        <span><kbd>Shift+Tab</kbd> Lùi</span>
        <span><kbd>Enter</kbd> Mở tab ngầm</span>
        <span><kbd>c</kbd> Copy link</span>
        <span><kbd>/</kbd> Tìm kiếm</span>
      `;
    } else if (pageMode === 'comments') {
      hintHtml = `
        <span><kbd>Tab</kbd> / <kbd>↓</kbd> Tiếp</span>
        <span><kbd>Shift+Tab</kbd> / <kbd>↑</kbd> Lùi</span>
        <span><kbd>Shift+→</kbd> Sang trang</span>
      `;
    } else if (pageMode === 'thread_list' || pageMode === 'google') {
      hintHtml = `
        <span><kbd>Tab</kbd> Bài tiếp</span>
        <span><kbd>Shift+Tab</kbd> Lùi</span>
        <span><kbd>Enter</kbd> Mở tab ngầm</span>
      `;
    }

    if (hintHtml) {
      hud.innerHTML = hintHtml;
      document.body.appendChild(hud);
    }
  }

  function init() {
    currentItems = scanPageItems();
    if (currentItems.length > 0) {
      highlightIndex(0, false);
      createHelpOverlay();
    }
    if (window.location.hostname.includes('youtube.com')) {
      attachCopyButtonsToYouTube();
    }
    if (window.location.hostname.includes('facebook.com')) {
      attachCopyButtonsToFacebook();
    }
  }

  // Khởi tạo và tự động retry cho YouTube khi cột bên phải đang tải bất đồng bộ
  function initYouTubeAutoRetry() {
    if (!window.location.hostname.includes('youtube.com')) return;

    let attempts = 0;
    if (ytRetryInterval) clearInterval(ytRetryInterval);

    ytRetryInterval = setInterval(() => {
      attempts++;
      attachCopyButtonsToYouTube();
      const items = scanYouTubeVideos();
      if (items.length > 0) {
        currentItems = items;
        pageMode = 'youtube';
        highlightIndex(0, false);
        createHelpOverlay();
        clearInterval(ytRetryInterval);
      } else if (attempts >= 15) {
        clearInterval(ytRetryInterval);
      }
    }, 400);
  }


  // ============================================================================
  // PHẦN 5: THUẬT TOÁN CHUYỂN TRANG
  // ============================================================================

  function findPaginationTarget(direction) {
    const isNext = (direction === 'next');

    const relSelector = isNext ? 'link[rel="next"], a[rel="next"]' : 'link[rel="prev"], a[rel="prev"]';
    const relEl = document.querySelector(relSelector);
    if (relEl && relEl.href) return { url: relEl.href, element: relEl };

    if (isNext) {
      const gNext = document.querySelector('#pnnext, a[aria-label="Next page"], a[aria-label="Trang sau"]');
      if (gNext) return { url: gNext.href || null, element: gNext };
    } else {
      const gPrev = document.querySelector('#pnprev, a[aria-label="Previous page"], a[aria-label="Trang trước"]');
      if (gPrev) return { url: gPrev.href || null, element: gPrev };
    }

    const selectors = isNext ? [
      '.pageNav-jump--next', '.pageNavSimple-el--next', 'a.pageNav-page--next', '.pageNav-page--current + li a',
      '.pagenav a[title*="Next" i]', '.pagenav a[title*="Tiếp" i]', 'a.next-page', 'a.next', 'a.pagination-next',
      '.pagination .next a', '.pagination .page-item.active + .page-item a', '.pagination li.active + li a',
      '.pagination .active + a', 'a.next.page-numbers', '.nav-links .next',
      '[aria-label="Next" i]', '[aria-label="Trang sau" i]'
    ] : [
      '.pageNav-jump--prev', '.pageNavSimple-el--prev', 'a.pageNav-page--prev',
      '.pagenav a[title*="Prev" i]', '.pagenav a[title*="Trước" i]', 'a.prev-page', 'a.prev', 'a.pagination-prev',
      '.pagination .prev a', 'a.prev.page-numbers', '.nav-links .prev',
      '[aria-label="Previous" i]', '[aria-label="Trang trước" i]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && (el.offsetParent !== null || el.href)) {
        return { url: el.href || null, element: el };
      }
    }

    const keywords = isNext ? 
      ['trang sau', 'tiếp theo', 'tiếp', 'kế tiếp', 'trang kế', 'next', 'next page', 'older', '»', '›', '→', '>'] : 
      ['trang trước', 'trước', 'quay lại', 'lùi', 'prev', 'previous', 'newer', '«', '‹', '←', '<'];

    const buttons = Array.from(document.querySelectorAll('a, button, [role="button"]'));
    for (const btn of buttons) {
      if (btn.offsetParent === null && !btn.href) continue;
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const title = (btn.getAttribute('title') || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();

      for (const kw of keywords) {
        if (text === kw || title === kw || aria === kw ||
            (text.length < 25 && text.includes(kw) && !text.includes('comment') && !text.includes('bình luận'))) {
          return { url: btn.href || null, element: btn };
        }
      }
    }

    const currentUrl = window.location.href;
    const match = currentUrl.match(/([?&]page=)(\d+)/i) || 
                  currentUrl.match(/(\/page[/-])(\d+)/i) || 
                  currentUrl.match(/([?&]p=)(\d+)/i);

    if (match) {
      const prefix = match[1];
      const curPage = parseInt(match[2], 10);
      const targetPage = isNext ? curPage + 1 : Math.max(1, curPage - 1);

      if (targetPage !== curPage) {
        let newUrl;
        if (!isNext && targetPage === 1 && match[1].includes('page')) {
          newUrl = currentUrl.replace(/page-\d+\/?/i, '');
        } else {
          newUrl = currentUrl.replace(match[0], prefix + targetPage);
        }
        return { url: newUrl, element: null };
      }
    }

    return null;
  }

  function navigatePagination(direction) {
    const isNext = (direction === 'next');
    const target = findPaginationTarget(direction);

    if (target) {
      showToast(isNext ? '⏩ Đang sang trang tiếp theo...' : '⏪ Đang quay lại trang trước...');
      if (target.url) {
        window.location.href = target.url;
        return true;
      } else if (target.element && typeof target.element.click === 'function') {
        target.element.click();
        return true;
      }
    }

    showToast(isNext ? '⚠️ Không tìm thấy trang tiếp theo' : '⚠️ Không tìm thấy trang trước');
    return false;
  }


  // ============================================================================
  // PHẦN 6: LẮNG NGHE SỰ KIỆN BÀN PHÍM TOÀN DIỆN
  // ============================================================================

  window.addEventListener('keydown', (e) => {
    const key = e.key;
    const code = e.code;
    const isShift = e.shiftKey;
    const isTab = (key === 'Tab' || code === 'Tab' || e.keyCode === 9);

    // 1. CHUYỂN TRANG: Shift + Mũi tên phải / trái (ngoại trừ YouTube)
    if (isShift && !isTab && pageMode !== 'youtube') {
      if (key === 'ArrowRight' || code === 'ArrowRight') {
        if (isTypingContext(e)) return;
        e.preventDefault();
        e.stopPropagation();
        navigatePagination('next');
        return;
      }
      if (key === 'ArrowLeft' || code === 'ArrowLeft') {
        if (isTypingContext(e)) return;
        e.preventDefault();
        e.stopPropagation();
        navigatePagination('prev');
        return;
      }
    }

    // Quét lại video YouTube ngay lúc bấm phím nếu danh sách chưa có
    if (window.location.hostname.includes('youtube.com')) {
      pageMode = 'youtube';
      if (currentItems.length === 0) {
        currentItems = scanYouTubeVideos();
      }
    } else if (currentItems.length === 0) {
      currentItems = scanPageItems();
    }

    const isTyping = isTypingContext(e);

    // 2. PHÍM TAB & SHIFT + TAB: Di chuyển chọn Video YouTube / Comment / Topic
    if (isTab) {
      // Nếu đang trong ô tìm kiếm YouTube hoặc Google -> blur để bắt đầu chọn
      if (isTyping) {
        if (pageMode === 'youtube' || pageMode === 'google') {
          const active = document.activeElement;
          if (active) active.blur();
        } else {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) {
        document.activeElement.blur();
      }

      if (pageMode === 'youtube' && currentItems.length === 0) {
        currentItems = scanYouTubeVideos();
      }

      if (currentItems.length === 0) return;

      const label = (pageMode === 'youtube') ? 'Video' : 'Bình luận';

      if (isShift) {
        // [Shift + Tab]: LÙI LẠI
        if (currentIndex > 0) {
          highlightIndex(currentIndex - 1, true);
          showToast(`🎬 ${label} #${currentIndex + 1} / ${currentItems.length}`);
        } else {
          if (pageMode === 'comments') {
            const currentUrl = window.location.href;
            if (currentUrl.includes('page-') || currentUrl.includes('page=') || currentUrl.includes('p=')) {
              showToast('⏪ Đang quay lại trang trước...');
              navigatePagination('prev');
            } else {
              highlightIndex(currentItems.length - 1, true);
              showToast(`💬 ${label} #${currentItems.length} / ${currentItems.length}`);
            }
          } else {
            highlightIndex(currentItems.length - 1, true);
            showToast(`🎬 ${label} #${currentItems.length} / ${currentItems.length}`);
          }
        }
      } else {
        // [Tab]: TIẾN TỚI VIDEO TIẾP THEO
        if (currentIndex < currentItems.length - 1) {
          highlightIndex(currentIndex + 1, true);
          showToast(`🎬 ${label} #${currentIndex + 1} / ${currentItems.length}`);
        } else {
          if (pageMode === 'comments') {
            showToast('⏩ Đang sang trang tiếp theo...');
            const transitioned = navigatePagination('next');
            if (!transitioned) highlightIndex(0, true);
          } else {
            highlightIndex(0, true);
            showToast(`🎬 ${label} #1 / ${currentItems.length}`);
          }
        }
      }
      return;
    }

    // 3. PHÍM ENTER: MỞ VIDEO / BÀI VIẾT TRONG TAB MỚI Ở CHẾ ĐỘ NỀN
    if ((key === 'Enter' || code === 'Enter') && !isTyping) {
      if (currentItems.length > 0) {
        const currentItem = currentItems[currentIndex];
        if (currentItem && currentItem.href) {
          e.preventDefault();
          e.stopPropagation();
          openLinkInBackground(currentItem.href);
          return;
        }
      }
    }

    // 4. PHÍM MŨI TÊN (ArrowDown / ArrowUp) hoặc (j / k)
    if (!isTyping && currentItems.length > 0) {
      if (key === 'ArrowDown' || key === 'j') {
        e.preventDefault();
        const nextIdx = (currentIndex + 1) % currentItems.length;
        highlightIndex(nextIdx, true);
        return;
      }
      if (key === 'ArrowUp' || key === 'k') {
        e.preventDefault();
        const prevIdx = (currentIndex - 1 + currentItems.length) % currentItems.length;
        highlightIndex(prevIdx, true);
        return;
      }
    }

    // 5. PHÍM '/' hoặc ESC: Focus nhanh vào ô tìm kiếm
    if ((key === '/' || key === 'Escape') && !isTyping) {
      let searchInput = null;
      if (pageMode === 'youtube') {
        searchInput = document.querySelector('input#search, input[name="search_query"]');
      } else if (pageMode === 'google') {
        searchInput = document.querySelector('textarea[name="q"], input[name="q"]');
      }

      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }
    }

    // 6. PHÍM 'c' / 'C' / Shift + C: Sao chép nhanh link clip YouTube
    if ((key === 'c' || key === 'C') && !isTyping && pageMode === 'youtube') {
      const activeEl = document.activeElement;
      const isInPlayer = activeEl && (activeEl.id === 'movie_player' || activeEl.closest('#movie_player'));

      // Nếu đang focus trong video player và bấm phím 'c' thường (không Shift), để YouTube bật tắt Subtitle CC
      if (key === 'c' && !e.shiftKey && isInPlayer) {
        return;
      }

      let targetUrl = null;
      let targetLabel = '';

      if (currentItems.length > 0 && currentItems[currentIndex] && currentItems[currentIndex].href) {
        targetUrl = currentItems[currentIndex].href;
        targetLabel = `video #${currentIndex + 1}`;
      } else if (window.location.pathname.startsWith('/watch')) {
        targetUrl = window.location.href;
        targetLabel = 'video đang phát';
      }

      if (targetUrl) {
        e.preventDefault();
        e.stopPropagation();
        const cleanUrl = getCleanYouTubeUrl(targetUrl);
        copyToClipboard(cleanUrl).then(success => {
          if (success) {
            const videoId = extractYouTubeVideoId(cleanUrl) || extractYouTubeVideoId(targetUrl);
            if (videoId) {
              markVideoAsCopied(videoId);
            }

            showToast(`📋 Đã copy link ${targetLabel} & Đã báo YouTube: Đã xem!`);
            if (currentItems[currentIndex] && currentItems[currentIndex].element) {
              const card = currentItems[currentIndex].element;
              dismissVideoAsWatched(card);

              const btn = card.querySelector('.smart-nav-copy-btn');
              if (btn) {
                btn.classList.add('flash-copied');
                setTimeout(() => {
                  btn.classList.remove('flash-copied');
                  if (videoId) applyButtonCopiedState(btn, copiedVideoIds.has(videoId));
                }, 1200);
              }
            }
          } else {
            showToast('⚠️ Không thể copy link vào clipboard');
          }
        });
        return;
      }
    }
  }, true);


  // ============================================================================
  // PHẦN 7: THEO DÕI VÀ TỰ ĐỘNG CẬP NHẬT KHI YOUTUBE TẢI XONG CỘT BÊN PHẢI
  // ============================================================================

  // Tải danh sách video đã xem từ bộ nhớ
  loadCopiedVideoIds();

  // Lắng nghe thay đổi storage từ các tab YouTube khác
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.copiedVideoIds) {
          const newIds = changes.copiedVideoIds.newValue;
          if (Array.isArray(newIds)) {
            newIds.forEach(id => copiedVideoIds.add(id));
            updateAllVideoButtonsState();
          }
        }
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      initYouTubeAutoRetry();
      attachCopyButtonsToYouTube();
      attachCopyButtonsToFacebook();
    });
  } else {
    init();
    initYouTubeAutoRetry();
    attachCopyButtonsToYouTube();
    attachCopyButtonsToFacebook();
  }

  // Lắng nghe sự kiện chuyển video trong YouTube (Single Page Application)
  window.addEventListener('yt-navigate-finish', () => {
    initYouTubeAutoRetry();
    attachCopyButtonsToYouTube();
  });
  window.addEventListener('yt-page-data-updated', () => {
    initYouTubeAutoRetry();
    attachCopyButtonsToYouTube();
  });

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (window.location.hostname.includes('youtube.com')) {
        attachCopyButtonsToYouTube();
      }
      if (window.location.hostname.includes('facebook.com')) {
        attachCopyButtonsToFacebook();
      }
      const updated = scanPageItems();
      if (updated.length > 0 && (updated.length !== currentItems.length || pageMode === 'youtube')) {
        currentItems = updated;
        if (!document.querySelector('.smart-nav-yt-active') && !document.querySelector('.smart-nav-active-item')) {
          highlightIndex(currentIndex, false);
        }
      }
    }, 400);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log('[Smart Web, YouTube & Forum Navigator] Tiện ích sẵn sàng: Chọn video bằng Tab & Copy link video siêu tốc!');
})();
