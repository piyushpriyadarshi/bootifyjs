# PostHog Step-by-Step Guide - Create Your First Dashboard

This guide walks you through creating a complete API performance dashboard in PostHog.

## 🎯 Goal

Create a dashboard that shows:

- Total API hits
- Average response time
- Error rate
- Complete endpoint statistics table

**Time required:** 10 minutes

---

## Step 1: Create the Dashboard

1. Go to PostHog → **Dashboards**
2. Click **"New Dashboard"**
3. Name it: **"API Performance Dashboard"**
4. Click **"Create"**

---

## Step 2: Add Total API Hits

### Click "Add insight" → "Trends"

**Configuration:**

1. **Select event:** Click the dropdown → Type `api_request` → Select it
2. **Show:** Keep as "Total count"
3. **Date range:** Click date picker → Select "Last 24 hours"
4. **Display:** Click "Line chart" dropdown → Select "Number"
5. **Name:** Click "Untitled" → Type "Total API Hits (24h)"
6. Click **"Save & add to dashboard"**

**Result:** You'll see a big number showing total requests

---

## Step 3: Add Average Response Time

### Click "Add insight" → "Trends"

**Configuration:**

1. **Select event:** `api_request`
2. **Show:** Click "Total count" dropdown → Select "Property value (average)"
3. **Property:** Type `response_time_ms` → Select it
4. **Date range:** Last 24 hours
5. **Display:** Number
6. **Customize:**
   - Click "Customize" tab
   - In "Number format" → Add suffix: ` ms`
7. **Name:** "Average Response Time"
8. Click **"Save & add to dashboard"**

**Result:** Shows average response time with "ms" suffix

---

## Step 4: Add Error Rate

### Click "Add insight" → "Trends"

**Configuration:**

1. **Series A:**

   - Event: `api_request`
   - Show: Total count
   - Label: "Total Requests"

2. **Add Series B:** Click "+ Add graph series"

   - Event: `api_request`
   - Show: Total count
   - **Add filter:** Click "Add filter"
     - Property: `is_error`
     - Operator: `= equals`
     - Value: `true`
   - Label: "Errors"

3. **Add Formula:** Click "Formula" tab

   - Formula: `(B / A) * 100`
   - Label: "Error Rate %"

4. **Display:** Number
5. **Customize:**

   - Add suffix: ` %`
   - Decimal places: 2

6. **Name:** "Error Rate"
7. Click **"Save & add to dashboard"**

**Result:** Shows error percentage (e.g., "0.52%")

---

## Step 5: Add Complete Endpoint Statistics Table

### Click "Add insight" → "Trends"

**Configuration:**

1. **Series A - Total Hits:**

   - Event: `api_request`
   - Show: Total count
   - Break down by: `endpoint`

2. **Series B - Average Response Time:**

   - Click "+ Add graph series"
   - Event: `api_request`
   - Show: Property value (average)
   - Property: `response_time_ms`
   - Break down by: `endpoint`

3. **Series C - Total Errors:**

   - Click "+ Add graph series"
   - Event: `api_request`
   - Show: Total count
   - Add filter: `is_error = true`
   - Break down by: `endpoint`

4. **Series D - 4xx Errors:**

   - Click "+ Add graph series"
   - Event: `api_request`
   - Show: Total count
   - Add filter: `is_client_error = true`
   - Break down by: `endpoint`

5. **Series E - 5xx Errors:**

   - Click "+ Add graph series"
   - Event: `api_request`
   - Show: Total count
   - Add filter: `is_server_error = true`
   - Break down by: `endpoint`

6. **Display:** Click dropdown → Select "Table"

7. **Sort:** Click column header "Total count" → Sort descending

8. **Name:** "Endpoint Performance Summary"

9. Click **"Save & add to dashboard"**

**Result:** Complete table with all endpoint statistics

---

## Step 6: Add Response Time Trend

### Click "Add insight" → "Trends"

**Configuration:**

1. **Select event:** `api_request`
2. **Show:** Property value (average)
3. **Property:** `response_time_ms`
4. **Date range:** Last 24 hours
5. **Interval:** Click "Day" → Select "Hour"
6. **Display:** Line chart
7. **Name:** "Response Time Trend (24h)"
8. Click **"Save & add to dashboard"**

**Result:** Line chart showing response time over 24 hours

---

## Step 7: Add Top 10 Endpoints

### Click "Add insight" → "Trends"

**Configuration:**

1. **Select event:** `api_request`
2. **Show:** Total count
3. **Break down by:** `endpoint`
4. **Date range:** Last 24 hours
5. **Display:** Bar chart (horizontal)
6. **Limit:** Click "Show all" → Select "Show top 10"
7. **Sort:** Descending (default)
8. **Name:** "Top 10 Endpoints by Traffic"
9. Click **"Save & add to dashboard"**

**Result:** Bar chart showing top 10 most-used endpoints

---

## Step 8: Add Error Trend

### Click "Add insight" → "Trends"

**Configuration:**

1. **Select event:** `api_request`
2. **Add filter:** `is_error = true`
3. **Show:** Total count
4. **Date range:** Last 24 hours
5. **Interval:** Hour
6. **Display:** Line chart
7. **Customize:**
   - Line color: Red
   - Fill area: Yes
8. **Name:** "Error Count Over Time"
9. Click **"Save & add to dashboard"**

**Result:** Red line chart showing errors over time

---

## Step 9: Arrange Dashboard

1. **Drag and drop** insights to arrange them
2. **Resize** insights by dragging corners
3. **Recommended layout:**

```
┌─────────────────────────────────────────────────────────┐
│ Row 1: Numbers (1/4 width each)                         │
│ [Total Hits] [Avg Response] [Error Rate] [Active Users]│
├─────────────────────────────────────────────────────────┤
│ Row 2: Full width table                                 │
│ [Endpoint Performance Summary - Full Width]             │
├─────────────────────────────────────────────────────────┤
│ Row 3: Half width charts                                │
│ [Response Time Trend]  [Top 10 Endpoints]               │
├─────────────────────────────────────────────────────────┤
│ Row 4: Full width chart                                 │
│ [Error Count Over Time - Full Width]                    │
└─────────────────────────────────────────────────────────┘
```

---

## Step 10: Add Dashboard Filters

1. Click **"Add filter"** at top of dashboard
2. Add these filters:

   - **Time range:** Quick filter for date ranges
   - **Endpoint:** Filter by specific endpoint
   - **Environment:** Filter by environment
   - **Service:** Filter by service name

3. Click **"Save"**

---

## Step 11: Set Up Alerts (Optional)

### High Error Rate Alert

1. Go to the "Error Rate" insight
2. Click **"..."** menu → **"Create alert"**
3. Configure:
   - **Condition:** When value is above `5`
   - **Check frequency:** Every 5 minutes
   - **Notification:** Email / Slack / Webhook
4. Click **"Create alert"**

### Slow Response Time Alert

1. Go to "Average Response Time" insight
2. Click **"..."** → **"Create alert"**
3. Configure:
   - **Condition:** When value is above `500` (ms)
   - **Check frequency:** Every 10 minutes
4. Click **"Create alert"**

---

## Step 12: Share Dashboard

1. Click **"Share"** button at top right
2. Options:
   - **Share link:** Copy link to share with team
   - **Subscribe:** Set up email reports (daily/weekly)
   - **Export:** Download as PDF or image
   - **Embed:** Get embed code for external tools

---

## 🎉 You're Done!

Your dashboard is now ready. You should see:

✅ Real-time API metrics
✅ Endpoint performance breakdown
✅ Response time trends
✅ Error monitoring
✅ Traffic patterns

---

## 📱 Access on Mobile

1. Download PostHog mobile app (iOS/Android)
2. Log in with your account
3. Navigate to Dashboards → "API Performance Dashboard"
4. Pin it to favorites for quick access

---

## 🔄 Keep It Updated

**Refresh frequency:**

- Dashboard auto-refreshes every 5 minutes
- Click "Refresh" button for manual refresh
- Set auto-refresh interval in dashboard settings

**Maintenance:**

- Review insights weekly
- Update filters as needed
- Add new insights for new endpoints
- Archive old/unused insights

---

## 💡 Pro Tips

### Tip 1: Use Dashboard Templates

PostHog has templates for common use cases. Check "Templates" when creating a dashboard.

### Tip 2: Duplicate Insights

Right-click any insight → "Duplicate" → Modify for variations

### Tip 3: Compare Time Periods

In any insight, click "Compare to" → Select "Previous period" to see trends

### Tip 4: Export Data

Click "..." on any insight → "Export to CSV" for deeper analysis

### Tip 5: Keyboard Shortcuts

- `Cmd/Ctrl + K` - Quick search
- `Cmd/Ctrl + S` - Save insight
- `Esc` - Close modal

---

## 🐛 Troubleshooting

### No data showing?

**Check 1:** Verify events are being sent

```
Go to Events → Search for "api_request"
```

**Check 2:** Check date range

```
Expand date range to "All time"
```

**Check 3:** Verify property names

```
Click event → View properties → Check spelling
```

### Wrong numbers?

**Check 1:** Verify filters

```
Review all filters in insight
```

**Check 2:** Check aggregation

```
Ensure using correct aggregation (count vs average)
```

**Check 3:** Check breakdown

```
Verify breakdown property is correct
```

### Slow loading?

**Solution 1:** Reduce date range

```
Use shorter time periods (24h instead of 30d)
```

**Solution 2:** Limit breakdowns

```
Show top 10 instead of all values
```

**Solution 3:** Use sampling

```
Enable sampling in insight settings
```

---

## 📚 Next Steps

1. **Explore more insights:**

   - User journey funnels
   - Retention analysis
   - Session recordings

2. **Integrate with tools:**

   - Slack notifications
   - PagerDuty alerts
   - Datadog integration

3. **Advanced features:**
   - Cohort analysis
   - Feature flags
   - A/B testing

---

## 🔗 Helpful Resources

- [PostHog Docs](https://posthog.com/docs)
- [Insights Guide](https://posthog.com/docs/product-analytics/insights)
- [Dashboard Guide](https://posthog.com/docs/product-analytics/dashboards)
- [Alerts Guide](https://posthog.com/docs/product-analytics/alerts)

---

**Questions?** Check our other guides:

- [POSTHOG_QUERIES.md](./POSTHOG_QUERIES.md) - All available queries
- [POSTHOG_QUICK_REFERENCE.md](./POSTHOG_QUICK_REFERENCE.md) - Quick reference
- [POSTHOG_ANALYTICS.md](./POSTHOG_ANALYTICS.md) - Analytics guide
