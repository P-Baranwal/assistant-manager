import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

let supabase = null;
let currentUser = null;

// Initialize Supabase client
function initSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  }
  return supabase;
}

// Get stored session tokens
async function getStoredTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabase_access_token', 'supabase_refresh_token'], (result) => {
      resolve({
        access_token: result.supabase_access_token,
        refresh_token: result.supabase_refresh_token
      });
    });
  });
}

// Store session tokens
async function storeTokens(accessToken, refreshToken) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      supabase_access_token: accessToken,
      supabase_refresh_token: refreshToken
    }, resolve);
  });
}

// Clear stored tokens
async function clearTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['supabase_access_token', 'supabase_refresh_token'], resolve);
  });
}

// Check if user is authenticated
async function isAuthenticated() {
  const tokens = await getStoredTokens();
  return !!tokens.access_token;
}

// Refresh access token
async function refreshAccessToken() {
  const tokens = await getStoredTokens();
  if (!tokens.refresh_token) {
    return null;
  }

  try {
    const client = initSupabase();
    const { data, error } = await client.auth.refreshSession({
      refresh_token: tokens.refresh_token
    });

    if (error) {
      console.error('Token refresh failed:', error);
      await clearTokens();
      return null;
    }

    if (data.session) {
      await storeTokens(data.session.access_token, data.session.refresh_token);
      return data.session.access_token;
    }

    return null;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

// Make authenticated API request
async function apiRequest(url, options = {}) {
  let tokens = await getStoredTokens();
  
  if (!tokens.access_token) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${tokens.access_token}`,
    ...options.headers
  };

  let response = await fetch(url, { ...options, headers });

  // If 401, try refreshing token
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    } else {
      throw new Error('Authentication expired');
    }
  }

  return response;
}

// Create task via Supabase API
async function createTask(taskData) {
  const client = initSupabase();
  const { data, error } = await client
    .from('tasks')
    .insert([taskData])
    .select();

  if (error) {
    throw error;
  }

  return data[0];
}

// Get tasks due today for badge count
async function getTasksDueToday() {
  const client = initSupabase();
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await client
    .from('tasks')
    .select('id')
    .eq('deadline', today)
    .in('status', ['active', 'todo', 'in_progress']);

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  return data || [];
}

// Update badge count
async function updateBadgeCount() {
  try {
    const authed = await isAuthenticated();
    if (!authed) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const tasks = await getTasksDueToday();
    const count = tasks.length;
    
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#6366f1' : '#94a3b8' });
  } catch (error) {
    console.error('Badge update error:', error);
    chrome.action.setBadgeText({ text: '' });
  }
}

// Setup context menus
function setupContextMenus() {
  chrome.contextMenus.create({
    id: 'clerify-capture',
    title: 'Send to Clerify',
    contexts: ['selection', 'link', 'page']
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'clerify-capture') {
    let data = {};
    
    if (info.selectionText) {
      data.selectedText = info.selectionText;
    }
    
    if (info.linkUrl) {
      data.linkUrl = info.linkUrl;
    }
    
    if (tab) {
      data.pageTitle = tab.title;
      data.pageUrl = tab.url;
    }

    // Store capture data and open popup
    chrome.storage.local.set({ captureData: data }, () => {
      chrome.action.openPopup();
    });
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CAPTURE_DATA') {
    chrome.storage.local.get('captureData', (result) => {
      sendResponse(result.captureData || {});
    });
    return true;
  }

  if (message.type === 'CLEAR_CAPTURE_DATA') {
    chrome.storage.local.remove('captureData', () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'AUTHENTICATE') {
    // Open auth page in new tab
    chrome.tabs.create({ url: 'https://your-app-url.com/auth' });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'LOGOUT') {
    clearTokens().then(() => {
      updateBadgeCount();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CREATE_TASK') {
    createTask(message.taskData)
      .then(task => {
        updateBadgeCount();
        sendResponse({ success: true, task });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'CHECK_AUTH') {
    isAuthenticated().then(authed => {
      sendResponse({ authenticated: authed });
    });
    return true;
  }

  if (message.type === 'GET_TASKS_DUE_TODAY') {
    getTasksDueToday().then(tasks => {
      sendResponse({ tasks });
    });
    return true;
  }
});

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  updateBadgeCount();
  
  // Set up periodic badge updates
  chrome.alarms.create('updateBadge', { periodInMinutes: 15 });
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateBadge') {
    updateBadgeCount();
  }
});

// Handle auth state changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.supabase_access_token) {
    updateBadgeCount();
  }
});

// Initial setup
updateBadgeCount();
