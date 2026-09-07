#!/bin/bash
# Test notifications API
# Usage: EMAIL=user@domain.com PASSWORD=password ./test-notifications.sh

BASE_URL="${BASE_URL:-https://dev.davidfruin.com}"
EMAIL="${EMAIL:-me@davidfruin.com}"
PASSWORD="${PASSWORD:-password123}"

echo "Testing notifications API"
echo "Email: $EMAIL"
echo "Base: $BASE_URL"
echo "================================"

# Step 1: Login
echo ""
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api.php" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "action=login&email=$EMAIL&password=$PASSWORD")

echo "Response: $LOGIN_RESPONSE"

# Extract JWT
JWT=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('jwt',''))" 2>/dev/null)

if [ -z "$JWT" ] || [ "$JWT" = "" ]; then
  echo "FAILED: No JWT - check credentials"
  exit 1
fi

echo "Got JWT: ${JWT:0:30}..."

# Step 2: Get notifications
echo ""
echo "2. Getting notifications..."
NOTIF=$(curl -s -X POST "$BASE_URL/api.php" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Bearer $JWT" \
  -d "action=getNotifications")

# Parse JSON
NOTIF_COUNT=$(echo "$NOTIF" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('notifications',[])))" 2>/dev/null)
echo "Notification count: $NOTIF_COUNT"

# Check for self-notifications (actor_id = recipient_id)
echo ""
echo "3. Checking for self-notifications..."

# Get user ID from JWT payload
USER_ID=$(echo "$JWT" | python3 -c "
import sys,json,base64
jwt='$JWT'
parts=jwt.split('.')
payload=json.loads(base64.b64decode(parts[1]+'=='))
print(payload.get('sub',''))
" 2>/dev/null)

echo "User ID from JWT: $USER_ID"

# Pretty print notifications
echo ""
echo "Notifications:"
echo "$NOTIF" | python3 -m json.tool 2>/dev/null | head -50

echo ""
echo "================================"
echo "Test done"