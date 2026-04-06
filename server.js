// server.js - NULL PROTOCOL API for Render
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
  ADMIN: {
    USERNAME: process.env.ADMIN_USERNAME || 'Shahid_Ansari',
    PASSWORD: process.env.ADMIN_PASSWORD || 'Tracker@3739',
    PIN: process.env.ADMIN_PIN || '2744',
    SECURITY_KEY: process.env.ADMIN_SECURITY_KEY || 'NULL_PROTOCOL'
  },
  API_TOKEN: process.env.API_TOKEN || null,
  MAX_REQUESTS_PER_DAY: parseInt(process.env.MAX_REQUESTS_PER_DAY) || 5000,
  GOOGLE_SHEETS: {
    ENABLED: process.env.GOOGLE_SHEETS_ENABLED === 'true',
    SHEET_ID: process.env.GOOGLE_SHEETS_SHEET_ID || '',
    LOG_SHEET_NAME: process.env.GOOGLE_SHEETS_LOG_SHEET_NAME || 'SearchLogs',
    ACTIVITY_SHEET_NAME: process.env.GOOGLE_SHEETS_ACTIVITY_SHEET_NAME || 'UserActivity',
    SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : ''
  },
  BRANDING: {
    ENABLE_REMOVAL: true,
    GLOBAL_BLACKLIST: [],
    FOOTER_FIELDS: { developer: 'Shahid Ansari', powered_by: 'NULL PROTOCOL' }
  },
  ENDPOINTS: {
    phone: { url: 'https://ayaanmods.site/number.php?key=annonymous&number={}', param: 'number', desc: 'Mobile number lookup', extra_blacklist: ['channel_link', 'channel_name', 'API_Developer'] },
    aadhaar: { url: 'https://users-xinfo-admin.vercel.app/api?key=7demo&type=aadhar&term={}', param: 'match', desc: 'Aadhaar lookup', extra_blacklist: ['tag'] },
    ration: { url: 'https://number8899.vercel.app/?type=family&aadhar={}', param: 'id', desc: 'Ration card lookup', extra_blacklist: ['developer', 'credit'] },
    vehicle: { url: 'https://vehicle-info-aco-api.vercel.app/info?vehicle={}', param: 'vehicle', desc: 'Vehicle RC lookup', extra_blacklist: [] },
    vehicle_chalan: { url: 'https://api.b77bf911.workers.dev/vehicle?registration={}', param: 'registration', desc: 'Vehicle chalan lookup', extra_blacklist: [] },
    vehicle_pro: { url: 'https://users-xinfo-admin.vercel.app/api?key=7demo&type=vehicle&term={}', param: 'rc', desc: 'Vehicle pro lookup', extra_blacklist: ['tag', 'owner'] },
    ifsc: { url: 'https://ab-ifscinfoapi.vercel.app/info?ifsc={}', param: 'ifsc', desc: 'IFSC code lookup', extra_blacklist: [] },
    email: { url: 'https://abbas-apis.vercel.app/api/email?mail={}', param: 'mail', desc: 'Email lookup', extra_blacklist: [] },
    pincode: { url: 'https://api.postalpincode.in/pincode/{}', param: 'pincode', desc: 'Pincode lookup', extra_blacklist: [] },
    gst: { url: 'https://api.b77bf911.workers.dev/gst?number={}', param: 'number', desc: 'GST number lookup', extra_blacklist: ['source'] },
    tg_to_num: { url: 'https://rootx-tg-num-multi.satyamrajsingh562.workers.dev/3/{}?key=root', param: 'userid', desc: 'Telegram to number lookup', extra_blacklist: ['by'] },
    ip_info: { url: 'https://abbas-apis.vercel.app/api/ip?ip={}', param: 'ip', desc: 'IP address lookup', extra_blacklist: [] },
    ff_info: { url: 'https://abbas-apis.vercel.app/api/ff-info?uid={}', param: 'uid', desc: 'Free Fire info lookup', extra_blacklist: ['channel', 'Developer', 'channel'] },
    ff_ban: { url: 'https://abbas-apis.vercel.app/api/ff-ban?uid={}', param: 'uid', desc: 'Free Fire ban check', extra_blacklist: [] },
    tg_info_pro: { url: 'https://tg-to-num-six.vercel.app/?key=rootxsuryansh&q={}', param: 'user', desc: 'Telegram pro lookup', extra_blacklist: ['note', 'help_group', 'admin', 'owner', 'credit', 'response_time'] },
    tg_info: { url: 'https://api.b77bf911.workers.dev/telegram?user={}', param: 'user', desc: 'Telegram info lookup', extra_blacklist: ['source'] },
    insta_info: { url: 'https://mkhossain.alwaysdata.net/instanum.php?username={}', param: 'username', desc: 'Instagram info lookup', extra_blacklist: [] },
    github_info: { url: 'https://abbas-apis.vercel.app/api/github?username={}', param: 'username', desc: 'GitHub info lookup', extra_blacklist: [] }
  }
};

// Generate API token if not set
if (!CONFIG.API_TOKEN) {
  CONFIG.API_TOKEN = 'NP_' + crypto.randomBytes(10).toString('hex');
  console.log(`🔑 Generated API Token: ${CONFIG.API_TOKEN}`);
}

// Rate limiting (in-memory)
let requestCounts = new Map();
let lastResetDate = new Date().toDateString();

// Google Sheets client (will be initialized asynchronously)
let googleSheetsClient = null;

// ============================================================
// ASYNC INITIALIZATION (no top-level await)
// ============================================================
async function initGoogleSheets() {
  if (!CONFIG.GOOGLE_SHEETS.ENABLED || !CONFIG.GOOGLE_SHEETS.SHEET_ID || !CONFIG.GOOGLE_SHEETS.SERVICE_ACCOUNT_EMAIL) {
    console.log('📝 Google Sheets logging disabled');
    return;
  }
  try {
    const { GoogleSpreadsheet } = require('google-spreadsheet');
    const doc = new GoogleSpreadsheet(CONFIG.GOOGLE_SHEETS.SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: CONFIG.GOOGLE_SHEETS.SERVICE_ACCOUNT_EMAIL,
      private_key: CONFIG.GOOGLE_SHEETS.PRIVATE_KEY,
    });
    await doc.loadInfo();
    googleSheetsClient = doc;
    console.log('✅ Google Sheets connected');
  } catch (err) {
    console.error('❌ Google Sheets init failed:', err.message);
  }
}

// Call the async init (no await at top-level)
initGoogleSheets();

// ============================================================
// RATE LIMITING FUNCTIONS
// ============================================================
function checkRateLimit() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    requestCounts.clear();
    lastResetDate = today;
  }
  const todayCount = requestCounts.get(today) || 0;
  return todayCount < CONFIG.MAX_REQUESTS_PER_DAY;
}

function incrementRequestCount() {
  const today = new Date().toDateString();
  const current = requestCounts.get(today) || 0;
  requestCounts.set(today, current + 1);
}

// ============================================================
// EXTERNAL API CALL
// ============================================================
async function callExternalAPI(apiConfig, query) {
  try {
    const url = apiConfig.url.replace('{}', encodeURIComponent(query));
    console.log(`📡 Calling ${apiConfig.desc}: ${url}`);
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    return response.data;
  } catch (error) {
    console.error(`❌ ${apiConfig.desc} failed:`, error.message);
    return { error: `${apiConfig.desc} failed`, message: error.message, api_type: apiConfig.desc };
  }
}

// ============================================================
// RESPONSE CLEANING (Blacklist + Branding)
// ============================================================
function enhanceResponse(data, apiType, removeBranding = true, extraBlacklist = []) {
  if (!data || typeof data !== 'object') {
    data = { response: data };
  }
  
  const cleanData = JSON.parse(JSON.stringify(data));
  
  if (removeBranding) {
    const globalBlacklist = CONFIG.BRANDING.GLOBAL_BLACKLIST.map(k => k.toLowerCase());
    const apiSpecificBlacklist = extraBlacklist.map(k => k.toLowerCase());
    
    function removeUnwanted(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const key in obj) {
        const lowerKey = key.toLowerCase();
        if (globalBlacklist.includes(lowerKey) || apiSpecificBlacklist.includes(lowerKey)) {
          delete obj[key];
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          removeUnwanted(obj[key]);
        }
      }
    }
    removeUnwanted(cleanData);
  }
  
  // Add footer branding
  if (!cleanData["___________________________"]) {
    cleanData["___________________________"] = "___________________________";
  }
  cleanData.developer = CONFIG.BRANDING.FOOTER_FIELDS.developer;
  cleanData.powered_by = CONFIG.BRANDING.FOOTER_FIELDS.powered_by;
  
  return cleanData;
}

// ============================================================
// GOOGLE SHEETS LOGGING (async, don't await in request)
// ============================================================
async function logToGoogleSheets(logData, userInfo, responseData, extraData) {
  if (!googleSheetsClient) return false;
  try {
    let sheet = googleSheetsClient.sheetsByTitle[CONFIG.GOOGLE_SHEETS.LOG_SHEET_NAME];
    if (!sheet) {
      sheet = await googleSheetsClient.addSheet({ title: CONFIG.GOOGLE_SHEETS.LOG_SHEET_NAME });
      await sheet.setHeaderRow([
        'Timestamp', 'API Type', 'Query', 'User IP', 'User Agent', 'Country', 'City', 'ISP',
        'Browser', 'OS', 'Device', 'Screen Resolution', 'Status', 'Response Time (ms)', 'API Used',
        'Response Data', 'HTTP Headers', 'Content Type', 'Post Data', 'Query String', 'Path Info',
        'TLS Version', 'Request ID', 'Orientation', 'Color Depth', 'Pixel Ratio', 'Platform',
        'Connection Type', 'Device Memory (GB)', 'CPU Cores', 'Timezone Offset (min)',
        'Local Time', 'Cookies Enabled', 'Do Not Track', 'Battery Level (%)', 'Battery Charging',
        'Touch Support', 'Full Referrer', 'Page Load Time (ms)', 'Geolocation',
        'Canvas Fingerprint', 'WebGL Renderer', 'Plugins', 'Session ID', 'User Token', 'Request Method',
        'Referrer', 'Language', 'Timezone'
      ]);
    }
    await sheet.addRow([
      new Date().toISOString(),
      logData.apiType || 'unknown',
      logData.query || '',
      userInfo.userIp || '',
      userInfo.userAgent || '',
      userInfo.country || '',
      userInfo.city || '',
      userInfo.isp || '',
      userInfo.browser || '',
      userInfo.os || '',
      userInfo.device || '',
      userInfo.screen || '',
      logData.status || 'success',
      logData.responseTime || 0,
      logData.apiUsed || '',
      (responseData || '').substring(0, 50000),
      userInfo.httpHeaders || '',
      userInfo.contentType || '',
      userInfo.postData || '',
      userInfo.queryString || '',
      userInfo.pathInfo || '',
      userInfo.tlsVersion || '',
      userInfo.requestId || '',
      extraData.orientation || '',
      extraData.colorDepth || '',
      extraData.pixelRatio || '',
      extraData.platform || '',
      extraData.connection || '',
      extraData.memory || '',
      extraData.cores || '',
      extraData.timezoneOffset || '',
      extraData.localTime || '',
      extraData.cookiesEnabled || '',
      extraData.doNotTrack || '',
      extraData.batteryLevel || '',
      extraData.batteryCharging || '',
      extraData.touchSupport || '',
      extraData.referrer || '',
      extraData.pageLoadTime || '',
      extraData.geolocation || '',
      extraData.canvasFingerprint || '',
      extraData.webglRenderer || '',
      extraData.plugins || '',
      userInfo.sessionId || '',
      userInfo.userToken || '',
      logData.method || 'GET',
      userInfo.referrer || '',
      userInfo.language || '',
      userInfo.timezone || ''
    ]);
    return true;
  } catch (err) {
    console.error('Logging error:', err.message);
    return false;
  }
}

async function logUserActivity(activityData) {
  if (!googleSheetsClient) return false;
  try {
    let sheet = googleSheetsClient.sheetsByTitle[CONFIG.GOOGLE_SHEETS.ACTIVITY_SHEET_NAME];
    if (!sheet) {
      sheet = await googleSheetsClient.addSheet({ title: CONFIG.GOOGLE_SHEETS.ACTIVITY_SHEET_NAME });
      await sheet.setHeaderRow(['Timestamp', 'User ID', 'Action', 'IP Address', 'Session Time (s)', 'Browser', 'OS', 'Screen', 'Country', 'ISP']);
    }
    await sheet.addRow([
      new Date().toISOString(),
      activityData.userId || 'guest',
      activityData.action || 'unknown',
      activityData.ip || '',
      activityData.sessionTime || 0,
      activityData.browser || '',
      activityData.os || '',
      activityData.screen || '',
      activityData.country || '',
      activityData.isp || ''
    ]);
    return true;
  } catch (err) {
    console.error('Activity logging error:', err.message);
    return false;
  }
}

// ============================================================
// API REQUEST HANDLER
// ============================================================
async function handleAPIRequest(params, req) {
  const { type, query, token, extra, remove_branding } = params;
  
  if (!token || token !== CONFIG.API_TOKEN) {
    return { error: 'Invalid token', code: 'INVALID_TOKEN', message: 'Use valid token from admin login', ...CONFIG.BRANDING.FOOTER_FIELDS };
  }
  
  if (!type || !query) {
    return { error: 'Missing parameters', required: ['type', 'query'], code: 'MISSING_PARAMS', ...CONFIG.BRANDING.FOOTER_FIELDS };
  }
  
  if (query.length > 100) {
    return { error: 'Query too long', max_length: 100, code: 'QUERY_TOO_LONG', ...CONFIG.BRANDING.FOOTER_FIELDS };
  }
  
  const apiConfig = CONFIG.ENDPOINTS[type.toLowerCase()];
  if (!apiConfig) {
    return { error: 'Unknown API type', supported_apis: Object.keys(CONFIG.ENDPOINTS), code: 'UNKNOWN_API', ...CONFIG.BRANDING.FOOTER_FIELDS };
  }
  
  const startTime = Date.now();
  const result = await callExternalAPI(apiConfig, query);
  const responseTime = Date.now() - startTime;
  
  // Parse extra data from frontend
  let extraData = {};
  if (extra) {
    try {
      extraData = JSON.parse(extra);
    } catch (e) {}
  }
  
  // Log to Google Sheets (async, don't await)
  const userInfo = {
    userIp: req.ip || req.headers['x-forwarded-for'] || '',
    userAgent: req.headers['user-agent'] || '',
    browser: extraData.browser || '',
    os: extraData.os || '',
    device: extraData.device || '',
    screen: extraData.screen || '',
    country: extraData.country || '',
    city: extraData.city || '',
    isp: extraData.isp || '',
    referrer: req.headers.referer || '',
    language: req.headers['accept-language'] || '',
    timezone: extraData.timezone || ''
  };
  
  logToGoogleSheets({
    apiType: type,
    query: query,
    status: result.error ? 'failed' : 'success',
    responseTime: responseTime,
    apiUsed: type,
    method: 'GET'
  }, userInfo, JSON.stringify(result).substring(0, 50000), extraData);
  
  incrementRequestCount();
  
  const removeBrandingFlag = remove_branding !== 'false';
  return enhanceResponse(result, type, removeBrandingFlag, apiConfig.extra_blacklist || []);
}

// ============================================================
// EXPRESS ROUTES
// ============================================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    total_apis: Object.keys(CONFIG.ENDPOINTS).length,
    requests_today: requestCounts.get(new Date().toDateString()) || 0,
    daily_limit: CONFIG.MAX_REQUESTS_PER_DAY,
    sheets_connected: !!googleSheetsClient,
    ...CONFIG.BRANDING.FOOTER_FIELDS
  });
});

// Admin verification
app.get('/admin-verify', async (req, res) => {
  const { user, pass, pin, key, ip, ua, os, screen, country, isp } = req.query;
  
  if (!user || !pass || !pin || !key) {
    return res.json({ success: false, message: 'All fields required', ...CONFIG.BRANDING.FOOTER_FIELDS });
  }
  
  if (user === CONFIG.ADMIN.USERNAME && pass === CONFIG.ADMIN.PASSWORD && 
      pin === CONFIG.ADMIN.PIN && key === CONFIG.ADMIN.SECURITY_KEY) {
    // Log activity if sheets enabled
    await logUserActivity({
      userId: user,
      action: 'admin_login_success',
      ip: ip || '',
      browser: ua || '',
      os: os || '',
      screen: screen || '',
      country: country || '',
      isp: isp || ''
    });
    res.json({
      success: true,
      message: 'Access granted',
      token: CONFIG.API_TOKEN,
      total_apis: Object.keys(CONFIG.ENDPOINTS).length,
      timestamp: new Date().toISOString(),
      ...CONFIG.BRANDING.FOOTER_FIELDS
    });
  } else {
    await logUserActivity({
      userId: user || 'unknown',
      action: 'admin_login_failed',
      ip: ip || '',
      browser: ua || '',
      os: os || ''
    });
    res.json({ success: false, message: 'Invalid credentials', ...CONFIG.BRANDING.FOOTER_FIELDS });
  }
});

// Main API endpoint
app.get('/api', async (req, res) => {
  try {
    if (!checkRateLimit()) {
      return res.status(429).json({
        error: 'Daily limit reached',
        message: 'Try again tomorrow',
        max_requests: CONFIG.MAX_REQUESTS_PER_DAY,
        ...CONFIG.BRANDING.FOOTER_FIELDS
      });
    }
    
    const { action, type, query, token, extra, remove_branding } = req.query;
    
    if (action === 'api') {
      const result = await handleAPIRequest({ type, query, token, extra, remove_branding }, req);
      return res.json(result);
    } else {
      return res.json({
        error: 'Invalid action',
        supported_actions: ['api'],
        ...CONFIG.BRANDING.FOOTER_FIELDS
      });
    }
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      ...CONFIG.BRANDING.FOOTER_FIELDS
    });
  }
});

// Activity logging endpoint (optional)
app.post('/log-activity', express.json(), async (req, res) => {
  if (!googleSheetsClient) {
    return res.json({ success: false, message: 'Sheets not configured', ...CONFIG.BRANDING.FOOTER_FIELDS });
  }
  try {
    await logUserActivity({
      userId: req.body.user_id || 'guest',
      action: req.body.action || 'unknown',
      ip: req.body.ip || '',
      sessionTime: req.body.session_time || 0,
      browser: req.body.browser || '',
      os: req.body.os || '',
      screen: req.body.screen || '',
      country: req.body.country || '',
      isp: req.body.isp || ''
    });
    res.json({ success: true, message: 'Activity logged', ...CONFIG.BRANDING.FOOTER_FIELDS });
  } catch (err) {
    res.json({ success: false, error: err.message, ...CONFIG.BRANDING.FOOTER_FIELDS });
  }
});

// Serve frontend for any unmatched route (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 NULL PROTOCOL API running on port ${PORT}`);
  console.log(`📊 Total APIs: ${Object.keys(CONFIG.ENDPOINTS).length}`);
  console.log(`🔑 API Token: ${CONFIG.API_TOKEN}`);
  console.log(`📝 Sheets logging: ${CONFIG.GOOGLE_SHEETS.ENABLED && googleSheetsClient ? 'Enabled' : 'Disabled'}`);
});
