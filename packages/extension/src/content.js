// Content script for page capture
// Runs on all pages to capture page information

// Capture page data when extension is activated
function capturePageData() {
  const data = {
    pageTitle: document.title,
    pageUrl: window.location.href,
    selectedText: window.getSelection()?.toString() || '',
    metaDescription: document.querySelector('meta[name="description"]')?.content || '',
    metaKeywords: document.querySelector('meta[name="keywords"]')?.content || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
    ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    timestamp: new Date().toISOString()
  };

  return data;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_PAGE') {
    const pageData = capturePageData();
    sendResponse(pageData);
    return true;
  }

  if (message.type === 'GET_SELECTED_TEXT') {
    const selectedText = window.getSelection()?.toString() || '';
    sendResponse({ selectedText });
    return true;
  }
});

// Auto-capture on page load (optional)
let lastCaptured = null;

function autoCapture() {
  const data = capturePageData();
  if (data.selectedText && data.selectedText !== lastCaptured) {
    lastCaptured = data.selectedText;
    chrome.runtime.sendMessage({
      type: 'AUTO_CAPTURE',
      data: data
    });
  }
}

// Debounced auto-capture
let captureTimeout;
document.addEventListener('selectionchange', () => {
  clearTimeout(captureTimeout);
  captureTimeout = setTimeout(autoCapture, 1000);
});
