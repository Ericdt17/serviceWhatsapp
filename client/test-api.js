#!/usr/bin/env node

/**
 * API Integration Test Script
 * 
 * This script tests all API endpoints to verify they work correctly.
 * Run with: node test-api.js
 * 
 * Prerequisites:
 * - Backend server running on http://localhost:3000
 * - Node.js installed
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_VERSION = '/api/v1';

let testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 Testing: ${name}`, 'cyan');
}

function logPass(message) {
  log(`  ✅ ${message}`, 'green');
  testResults.passed++;
}

function logFail(message, error = null) {
  log(`  ❌ ${message}`, 'red');
  testResults.failed++;
  if (error) {
    testResults.errors.push({ test: message, error: error.message || error });
    log(`     Error: ${error.message || error}`, 'yellow');
  }
}

async function makeRequest(endpoint, options = {}) {
  try {
    const url = `${API_BASE_URL}${API_VERSION}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const data = await response.json();
    return { response, data, ok: response.ok };
  } catch (error) {
    return { error, ok: false };
  }
}

async function testHealthCheck() {
  logTest('Health Check');
  const { response, data, error } = await makeRequest('/health');
  
  if (error) {
    logFail('Health check failed - server not reachable', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Health check failed - Status: ${response.status}`);
    return false;
  }
  
  if (data.status === 'ok') {
    logPass('Health check passed');
    return true;
  } else {
    logFail('Health check failed - Invalid response');
    return false;
  }
}

async function testGetDeliveries() {
  logTest('Get Deliveries List');
  const { response, data, error } = await makeRequest('/deliveries?page=1&limit=10');
  
  if (error) {
    logFail('Get deliveries failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Get deliveries failed - Status: ${response.status}`);
    return false;
  }
  
  if (data.success && Array.isArray(data.data)) {
    logPass(`Get deliveries passed - Found ${data.data.length} deliveries`);
    
    // Verify data structure
    if (data.data.length > 0) {
      const delivery = data.data[0];
      const requiredFields = ['id', 'phone', 'items', 'amount_due', 'amount_paid', 'status'];
      const missingFields = requiredFields.filter(field => !(field in delivery));
      
      if (missingFields.length === 0) {
        logPass('Delivery data structure valid');
      } else {
        logFail(`Missing fields: ${missingFields.join(', ')}`);
      }
    }
    
    // Verify pagination
    if (data.pagination) {
      const paginationFields = ['page', 'limit', 'total', 'totalPages'];
      const missingPaginationFields = paginationFields.filter(field => !(field in data.pagination));
      
      if (missingPaginationFields.length === 0) {
        logPass('Pagination structure valid');
      } else {
        logFail(`Missing pagination fields: ${missingPaginationFields.join(', ')}`);
      }
    }
    
    return true;
  } else {
    logFail('Get deliveries failed - Invalid response structure');
    return false;
  }
}

async function testGetDeliveryById() {
  logTest('Get Delivery By ID');
  
  // First, get a list to find an ID
  const { data: listData } = await makeRequest('/deliveries?limit=1');
  
  if (!listData || !listData.success || !listData.data || listData.data.length === 0) {
    logFail('Cannot test - No deliveries found');
    return false;
  }
  
  const deliveryId = listData.data[0].id;
  const { response, data, error } = await makeRequest(`/deliveries/${deliveryId}`);
  
  if (error) {
    logFail('Get delivery by ID failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Get delivery by ID failed - Status: ${response.status}`);
    return false;
  }
  
  if (data.success && data.data && data.data.id === deliveryId) {
    logPass(`Get delivery by ID passed - ID: ${deliveryId}`);
    return true;
  } else {
    logFail('Get delivery by ID failed - Invalid response');
    return false;
  }
}

async function testCreateDelivery() {
  logTest('Create Delivery');
  
  const testDelivery = {
    phone: `+237 6${Math.floor(Math.random() * 100000000)}`,
    items: 'Test Product - API Test',
    amount_due: 5000,
    quartier: 'Test Quartier',
    status: 'pending'
  };
  
  const { response, data, error } = await makeRequest('/deliveries', {
    method: 'POST',
    body: JSON.stringify(testDelivery)
  });
  
  if (error) {
    logFail('Create delivery failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Create delivery failed - Status: ${response.status}`, data);
    return false;
  }
  
  if (data.success && data.data && data.data.id) {
    logPass(`Create delivery passed - Created ID: ${data.data.id}`);
    return data.data.id; // Return ID for cleanup
  } else {
    logFail('Create delivery failed - Invalid response');
    return false;
  }
}

async function testUpdateDelivery(deliveryId) {
  if (!deliveryId) {
    logTest('Update Delivery');
    logFail('Cannot test - No delivery ID provided');
    return false;
  }
  
  logTest('Update Delivery');
  
  const updates = {
    amount_due: 6000,
    status: 'delivered'
  };
  
  const { response, data, error } = await makeRequest(`/deliveries/${deliveryId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
  
  if (error) {
    logFail('Update delivery failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Update delivery failed - Status: ${response.status}`, data);
    return false;
  }
  
  if (data.success && data.data) {
    logPass(`Update delivery passed - Updated ID: ${deliveryId}`);
    return true;
  } else {
    logFail('Update delivery failed - Invalid response');
    return false;
  }
}

async function testGetDeliveryHistory(deliveryId) {
  if (!deliveryId) {
    logTest('Get Delivery History');
    logFail('Cannot test - No delivery ID provided');
    return false;
  }
  
  logTest('Get Delivery History');
  
  const { response, data, error } = await makeRequest(`/deliveries/${deliveryId}/history`);
  
  if (error) {
    logFail('Get delivery history failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Get delivery history failed - Status: ${response.status}`);
    return false;
  }
  
  if (data.success && Array.isArray(data.data)) {
    logPass(`Get delivery history passed - Found ${data.data.length} history entries`);
    return true;
  } else {
    logFail('Get delivery history failed - Invalid response');
    return false;
  }
}

async function testGetStats() {
  logTest('Get Daily Stats');
  const { response, data, error } = await makeRequest('/stats/daily');
  
  if (error) {
    logFail('Get stats failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Get stats failed - Status: ${response.status}`);
    return false;
  }
  
  if (data.success && data.data) {
    const stats = data.data;
    const requiredFields = ['total', 'delivered', 'failed', 'pending', 'total_collected', 'total_remaining'];
    const missingFields = requiredFields.filter(field => !(field in stats));
    
    if (missingFields.length === 0) {
      logPass('Get stats passed - All fields present');
      return true;
    } else {
      logFail(`Missing stats fields: ${missingFields.join(', ')}`);
      return false;
    }
  } else {
    logFail('Get stats failed - Invalid response');
    return false;
  }
}

async function testSearch() {
  logTest('Search Deliveries');
  const { response, data, error } = await makeRequest('/search?q=test');
  
  if (error) {
    logFail('Search failed', error);
    return false;
  }
  
  if (!response.ok) {
    logFail(`Search failed - Status: ${response.status}`);
    return false;
  }
  
  if (data.success && Array.isArray(data.data)) {
    logPass(`Search passed - Found ${data.data.length} results`);
    return true;
  } else {
    logFail('Search failed - Invalid response');
    return false;
  }
}

async function testErrorHandling() {
  logTest('Error Handling');
  
  // Test 404
  const { response: notFoundResponse } = await makeRequest('/deliveries/99999');
  if (notFoundResponse && notFoundResponse.status === 404) {
    logPass('404 error handled correctly');
  } else {
    logFail('404 error not handled correctly');
  }
  
  // Test invalid request
  const { response: badRequestResponse } = await makeRequest('/deliveries', {
    method: 'POST',
    body: JSON.stringify({ phone: '' }) // Invalid - empty phone
  });
  
  if (badRequestResponse && (badRequestResponse.status === 400 || badRequestResponse.status === 422)) {
    logPass('400/422 error handled correctly');
  } else {
    logFail('400/422 error not handled correctly');
  }
}

async function runAllTests() {
  log('\n🚀 Starting API Integration Tests', 'blue');
  log(`📍 API Base URL: ${API_BASE_URL}${API_VERSION}\n`, 'yellow');
  
  // Test health check first
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    log('\n❌ Backend server is not reachable. Please start the server first.', 'red');
    log('   Run: cd wwebjs-bot && node src/api/server.js\n', 'yellow');
    process.exit(1);
  }
  
  // Run all tests
  await testGetDeliveries();
  const deliveryId = await testGetDeliveryById();
  const createdId = await testCreateDelivery();
  if (createdId) {
    await testUpdateDelivery(createdId);
    await testGetDeliveryHistory(createdId);
  }
  await testGetStats();
  await testSearch();
  await testErrorHandling();
  
  // Summary
  log('\n' + '='.repeat(50), 'blue');
  log('📊 Test Summary', 'blue');
  log('='.repeat(50), 'blue');
  log(`✅ Passed: ${testResults.passed}`, 'green');
  log(`❌ Failed: ${testResults.failed}`, 'red');
  log('='.repeat(50) + '\n', 'blue');
  
  if (testResults.errors.length > 0) {
    log('Errors:', 'yellow');
    testResults.errors.forEach(({ test, error }) => {
      log(`  - ${test}: ${error}`, 'yellow');
    });
    log('');
  }
  
  if (testResults.failed === 0) {
    log('🎉 All tests passed!', 'green');
    process.exit(0);
  } else {
    log('⚠️  Some tests failed. Please review the errors above.', 'yellow');
    process.exit(1);
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  log('❌ This script requires Node.js 18+ (for native fetch support)', 'red');
  log('   Or install node-fetch: npm install node-fetch', 'yellow');
  process.exit(1);
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
















