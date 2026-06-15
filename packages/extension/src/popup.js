import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

let supabase = null;

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

// Get stored tokens
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

// Store tokens
async function storeTokens(accessToken, refreshToken) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      supabase_access_token: accessToken,
      supabase_refresh_token: refreshToken
    }, resolve);
  });
}

// Check authentication
async function checkAuth() {
  const tokens = await getStoredTokens();
  return !!tokens.access_token;
}

// Show screen
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.add('hidden');
  });
  document.getElementById(screenId).classList.remove('hidden');
}

// Show error
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  errorText.textContent = message;
  errorDiv.classList.remove('hidden');
}

// Hide error
function hideError() {
  document.getElementById('error-message').classList.add('hidden');
}

// Set loading state
function setLoading(isLoading) {
  const submitText = document.getElementById('submit-text');
  const submitLoading = document.getElementById('submit-loading');
  const submitBtn = document.getElementById('submit-btn');

  if (isLoading) {
    submitText.classList.add('hidden');
    submitLoading.classList.remove('hidden');
    submitBtn.disabled = true;
  } else {
    submitText.classList.remove('hidden');
    submitLoading.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

// Format date for input
function formatDateForInput(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
}

// Load capture data
async function loadCaptureData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CAPTURE_DATA' }, (response) => {
      resolve(response || {});
    });
  });
}

// Clear capture data
async function clearCaptureData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURE_DATA' }, () => {
      resolve();
    });
  });
}

// Get current tab info
async function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

// Create task
async function createTask(taskData) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'CREATE_TASK',
      taskData: taskData
    }, (response) => {
      if (response.success) {
        resolve(response.task);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

// Handle form submission
async function handleSubmit(event) {
  event.preventDefault();
  hideError();
  setLoading(true);

  const form = event.target;
  const formData = new FormData(form);
  
  const taskData = {
    title: formData.get('title'),
    description: formData.get('description') || '',
    deadline: formData.get('deadline') || null,
    estimated_hours: parseFloat(formData.get('estimatedHours')) || null,
    type: formData.get('type'),
    status: 'active',
    priority_score: 50,
    priority_reasoning: 'Created via browser extension'
  };

  try {
    await createTask(taskData);
    
    // Show success
    document.getElementById('task-form').classList.add('hidden');
    document.getElementById('success-message').classList.remove('hidden');
    
    // Clear capture data
    await clearCaptureData();
  } catch (error) {
    showError(error.message || 'Failed to create task');
  } finally {
    setLoading(false);
  }
}

// Handle add another
function handleAddAnother() {
  document.getElementById('task-form').reset();
  document.getElementById('task-form').classList.remove('hidden');
  document.getElementById('success-message').classList.add('hidden');
  hideError();
}

// Handle login
function handleLogin() {
  chrome.runtime.sendMessage({ type: 'AUTHENTICATE' });
}

// Handle logout
function handleLogout() {
  chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
    showScreen('auth-screen');
  });
}

// Handle retry
function handleRetry() {
  hideError();
  document.getElementById('task-form').requestSubmit();
}

// Initialize popup
async function init() {
  const isAuthed = await checkAuth();
  
  if (!isAuthed) {
    showScreen('auth-screen');
    return;
  }

  showScreen('main-screen');

  // Load capture data
  const captureData = await loadCaptureData();
  
  // Get current tab
  const tab = await getCurrentTab();
  
  // Populate form with captured data
  const titleInput = document.getElementById('title');
  const descriptionInput = document.getElementById('description');
  const sourceUrl = document.getElementById('source-url');

  if (captureData.selectedText) {
    titleInput.value = captureData.selectedText.substring(0, 100);
    descriptionInput.value = captureData.selectedText;
  } else if (tab) {
    titleInput.value = tab.title || '';
    if (captureData.linkUrl) {
      descriptionInput.value = captureData.linkUrl;
    }
  }

  // Show source URL
  if (tab) {
    sourceUrl.textContent = tab.url;
  }

  // Set default deadline to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('deadline').value = formatDateForInput(tomorrow.toISOString());

  // Event listeners
  document.getElementById('task-form').addEventListener('submit', handleSubmit);
  document.getElementById('add-another').addEventListener('click', handleAddAnother);
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('retry-btn').addEventListener('click', handleRetry);

  // Signup link
  document.getElementById('signup-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://your-app-url.com/auth' });
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
