# API Integration Testing Guide

This guide helps you verify that all API endpoints are working correctly, test error scenarios, and validate data transformations.

## Prerequisites

1. **Backend server running:**
   ```bash
   cd wwebjs-bot
   node src/api/server.js
   # Should see: 🚀 API Server running on http://localhost:3000
   ```

2. **Frontend server running:**
   ```bash
   cd client
   npm run dev
   # Should see: Local: http://localhost:8080
   ```

3. **Environment configured:**
   - Create `.env.local` with `VITE_API_BASE_URL=` (empty for proxy) or `VITE_API_BASE_URL=http://localhost:3000`

## Testing Checklist

### ✅ 1. Health Check Endpoint

**Test:** Verify API server is accessible

```bash
# Using curl
curl http://localhost:3000/api/v1/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2024-...",
#   "service": "delivery-bot-api",
#   "version": "1.0.0"
# }
```

**In Browser:**
- Open browser console
- Navigate to: `http://localhost:8080`
- Check Network tab for `/api/v1/health` request
- Should return 200 status

---

### ✅ 2. Get Deliveries (List)

**Test:** Fetch list of deliveries with pagination

**Manual Test:**
1. Navigate to `/livraisons` page
2. Verify:
   - ✅ Loading skeleton appears initially
   - ✅ Deliveries table loads with data
   - ✅ Pagination controls appear (if more than 1 page)
   - ✅ Status badges display correctly
   - ✅ Amounts formatted correctly (FCFA)

**API Test:**
```bash
curl "http://localhost:3000/api/v1/deliveries?page=1&limit=10"
```

**Verify:**
- ✅ Response has `success: true`
- ✅ `data` array contains delivery objects
- ✅ `pagination` object has correct structure
- ✅ Backend fields mapped to frontend format:
  - `phone` → `telephone`
  - `items` → `produits`
  - `amount_due` → `montant_total`
  - `amount_paid` → `montant_encaisse`
  - `status` → `statut` (mapped: pending→en_cours, delivered→livré, etc.)

---

### ✅ 3. Get Single Delivery

**Test:** Fetch a specific delivery by ID

**Manual Test:**
1. Navigate to `/livraisons` page
2. Click on any delivery row
3. Verify:
   - ✅ Loading skeleton appears
   - ✅ Delivery details load correctly
   - ✅ All fields display properly
   - ✅ History section loads

**API Test:**
```bash
curl "http://localhost:3000/api/v1/deliveries/1"
```

**Verify:**
- ✅ Response has `success: true`
- ✅ Single delivery object returned
- ✅ All required fields present
- ✅ Data transformation correct

---

### ✅ 4. Create Delivery

**Test:** Create a new delivery

**Manual Test:**
1. Navigate to `/livraisons` page
2. Click "Nouvelle livraison" button (if available)
3. Fill in form:
   - Téléphone: `+237 6XX XXX XXX`
   - Produits: `Test product`
   - Montant total: `5000`
   - Quartier: `Test quartier`
4. Submit form
5. Verify:
   - ✅ Success toast notification appears
   - ✅ New delivery appears in list
   - ✅ Form validation works

**API Test:**
```bash
curl -X POST "http://localhost:3000/api/v1/deliveries" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+237 612345678",
    "items": "Test product",
    "amount_due": 5000,
    "quartier": "Test quartier",
    "status": "pending"
  }'
```

**Verify:**
- ✅ Response has `success: true`
- ✅ Created delivery returned with ID
- ✅ All fields saved correctly
- ✅ Frontend receives transformed data

---

### ✅ 5. Update Delivery

**Test:** Update an existing delivery

**Manual Test:**
1. Navigate to delivery details page
2. Click "Modifier" button (if available)
3. Change some fields
4. Submit
5. Verify:
   - ✅ Success toast appears
   - ✅ Changes reflected in UI
   - ✅ History updated

**API Test:**
```bash
curl -X PUT "http://localhost:3000/api/v1/deliveries/1" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_due": 6000,
    "status": "delivered"
  }'
```

**Verify:**
- ✅ Response has `success: true`
- ✅ Updated delivery returned
- ✅ Only specified fields updated
- ✅ Status mapping works (delivered → livré)

---

### ✅ 6. Get Delivery History

**Test:** Fetch history for a delivery

**Manual Test:**
1. Navigate to delivery details page
2. Scroll to "Historique" section
3. Verify:
   - ✅ History entries load
   - ✅ Actions displayed correctly
   - ✅ Dates formatted properly
   - ✅ Actors shown

**API Test:**
```bash
curl "http://localhost:3000/api/v1/deliveries/1/history"
```

**Verify:**
- ✅ Response has `success: true`
- ✅ Array of history entries returned
- ✅ Each entry has: `id`, `action`, `details`, `actor`, `created_at`
- ✅ Frontend transforms correctly

---

### ✅ 7. Get Daily Stats

**Test:** Fetch daily statistics

**Manual Test:**
1. Navigate to `/` (Dashboard)
2. Verify:
   - ✅ Loading skeleton appears
   - ✅ Stats cards load with data
   - ✅ Numbers formatted correctly
   - ✅ Charts display (if applicable)

**API Test:**
```bash
curl "http://localhost:3000/api/v1/stats/daily"
# Or with date:
curl "http://localhost:3000/api/v1/stats/daily?date=2024-01-15"
```

**Verify:**
- ✅ Response has `success: true`
- ✅ Stats object returned with:
  - `total`, `delivered`, `failed`, `pending`, `pickup`
  - `total_collected`, `total_remaining`
- ✅ Frontend transforms to:
  - `totalLivraisons`, `livreesReussies`, `echecs`, `enCours`, etc.
  - `montantTotal`, `montantEncaisse`, `montantRestant`

---

### ✅ 8. Search Deliveries

**Test:** Search deliveries by query

**Manual Test:**
1. Navigate to `/livraisons` page
2. Use search box
3. Enter phone number or product name
4. Verify:
   - ✅ Results filter correctly
   - ✅ Search works across multiple fields

**API Test:**
```bash
curl "http://localhost:3000/api/v1/search?q=612345678"
```

**Verify:**
- ✅ Response has `success: true`
- ✅ Matching deliveries returned
- ✅ `count` field shows number of results
- ✅ `query` field echoes search term

---

### ✅ 9. Error Scenarios

#### 9.1. Network Error

**Test:** Backend server not running

1. Stop backend server
2. Navigate to any page that fetches data
3. Verify:
   - ✅ Error message displayed
   - ✅ Retry button available
   - ✅ Toast notification shows error

#### 9.2. 404 Error

**Test:** Non-existent delivery ID

```bash
curl "http://localhost:3000/api/v1/deliveries/99999"
```

**Verify:**
- ✅ Response has `success: false`
- ✅ Error message in response
- ✅ Frontend shows error UI
- ✅ User-friendly error message

#### 9.3. 400 Error (Bad Request)

**Test:** Invalid data in request

```bash
curl -X POST "http://localhost:3000/api/v1/deliveries" \
  -H "Content-Type: application/json" \
  -d '{"phone": ""}'
```

**Verify:**
- ✅ Response has `success: false`
- ✅ Validation error message
- ✅ Frontend form validation catches it
- ✅ Error displayed to user

#### 9.4. 500 Error (Server Error)

**Test:** Server error handling

1. Temporarily break backend (e.g., database connection)
2. Make API request
3. Verify:
   - ✅ Error boundary catches it (if React error)
   - ✅ Error display component shows message
   - ✅ User can retry or go home

---

### ✅ 10. Data Transformation Validation

**Test:** Verify all field mappings work correctly

**Backend → Frontend Mapping:**

| Backend Field | Frontend Field | Transformation |
|--------------|---------------|----------------|
| `phone` | `telephone` | Direct mapping |
| `items` | `produits` | Direct mapping |
| `amount_due` | `montant_total` | Direct mapping |
| `amount_paid` | `montant_encaisse` | Direct mapping |
| `status` | `statut` | pending→en_cours, delivered→livré, failed→échec |
| `notes` | `instructions` | Direct mapping |
| `quartier` | `quartier` | Direct mapping |
| `created_at` | `date_creation` | Direct mapping |
| `updated_at` | `date_mise_a_jour` | Direct mapping |
| - | `restant` | Calculated: `montant_total - montant_encaisse` |
| - | `type` | Derived: expedition/pickup/livraison |

**Test Cases:**

1. **Status Mapping:**
   - Create delivery with `status: "pending"` → Verify frontend shows `statut: "en_cours"`
   - Update to `status: "delivered"` → Verify frontend shows `statut: "livré"`
   - Update to `status: "failed"` → Verify frontend shows `statut: "échec"`

2. **Type Derivation:**
   - Delivery with `carrier` and `status: "expedition"` → Verify `type: "expedition"`
   - Delivery with `status: "pickup"` → Verify `type: "pickup"`
   - Regular delivery → Verify `type: "livraison"`

3. **Restant Calculation:**
   - Delivery with `amount_due: 10000`, `amount_paid: 3000` → Verify `restant: 7000`
   - Delivery with `amount_due: 5000`, `amount_paid: 5000` → Verify `restant: 0`
   - Delivery with `amount_due: 5000`, `amount_paid: 6000` → Verify `restant: 0` (not negative)

---

### ✅ 11. Pagination

**Test:** Verify pagination works correctly

1. Navigate to `/livraisons` page
2. If more than 10 deliveries exist:
   - ✅ Pagination controls appear
   - ✅ Click "Next" → Next page loads
   - ✅ Click "Previous" → Previous page loads
   - ✅ Page numbers update
   - ✅ Total count displayed correctly

**API Test:**
```bash
curl "http://localhost:3000/api/v1/deliveries?page=2&limit=10"
```

**Verify:**
- ✅ Correct page returned
- ✅ `pagination` object has:
  - `page: 2`
  - `limit: 10`
  - `total: <total_count>`
  - `totalPages: <calculated>`

---

### ✅ 12. Filtering

**Test:** Verify filters work

1. Navigate to `/livraisons` page
2. Test status filter:
   - Select "En cours" → Only pending deliveries shown
   - Select "Livré" → Only delivered deliveries shown
3. Test type filter:
   - Select "Livraison" → Only regular deliveries shown
   - Select "Expédition" → Only expeditions shown
4. Test quartier filter:
   - Select a quartier → Only deliveries from that quartier shown

**API Test:**
```bash
curl "http://localhost:3000/api/v1/deliveries?status=pending"
curl "http://localhost:3000/api/v1/deliveries?startDate=2024-01-01&endDate=2024-01-31"
```

---

## Browser DevTools Testing

### Network Tab

1. Open DevTools (F12)
2. Go to Network tab
3. Filter by "Fetch/XHR"
4. Navigate through the app
5. Verify:
   - ✅ All API requests succeed (200 status)
   - ✅ Request/response payloads correct
   - ✅ Headers include `Content-Type: application/json`
   - ✅ No CORS errors

### Console Tab

1. Open Console tab
2. Check for:
   - ✅ No API-related errors
   - ✅ React Query cache working (check for duplicate requests)
   - ✅ Error messages user-friendly (if any)

### React Query DevTools (Optional)

If installed, verify:
- ✅ Queries cache correctly
- ✅ Mutations invalidate cache
- ✅ Refetching works

---

## Automated Testing Script

See `test-api.js` for a Node.js script that can automate some of these tests.

---

## Common Issues & Solutions

### Issue: CORS Error

**Solution:**
- Ensure backend CORS is configured (already done in `server.js`)
- Use Vite proxy (set `VITE_API_BASE_URL=` empty)
- Or ensure `VITE_API_BASE_URL=http://localhost:3000` matches backend port

### Issue: 404 on API Requests

**Solution:**
- Check backend server is running on port 3000
- Verify `VITE_API_BASE_URL` is correct
- Check Vite proxy configuration in `vite.config.ts`

### Issue: Data Not Transforming

**Solution:**
- Check `data-transform.ts` functions
- Verify backend response structure matches `BackendDelivery` type
- Check browser console for transformation errors

### Issue: Status Not Mapping

**Solution:**
- Verify status values in database match expected values
- Check `mapStatusToFrontend()` function
- Ensure case-insensitive matching works

---

## Success Criteria

All tests should pass:
- ✅ All endpoints return successful responses
- ✅ Data transformations work correctly
- ✅ Error scenarios handled gracefully
- ✅ Loading states appear appropriately
- ✅ User-friendly error messages displayed
- ✅ No console errors
- ✅ No CORS issues
- ✅ Pagination works
- ✅ Filtering works
- ✅ Search works

---

## Next Steps

After completing these tests:
1. Document any issues found
2. Fix any bugs discovered
3. Update this guide with any new test cases
4. Consider adding automated tests (Jest, Vitest, etc.)
















