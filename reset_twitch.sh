#!/bin/bash

# ===== Your Twitch credentials =====
CLIENT_ID="cy8mxu2dkzy13da7yy2zf9anq95vug"
BEARER="y1ybjq0xriyw2vh308tpzzlt8mgsv3"
CALLBACK="https://www.invictusguild.eu/twitch/webhook"
WEBHOOK_SECRET="IlikeBigBallsonfirewhenidipthemintartarsauce543654745"

# ===== Step 1: Delete all existing subscriptions =====
echo "?? Fetching current Twitch EventSub subscriptions..."
curl -s -X GET "https://api.twitch.tv/helix/eventsub/subscriptions" \
  -H "Client-ID: $CLIENT_ID" \
  -H "Authorization: Bearer $BEARER" \
  | jq -r '.data[]?.id' \
  | while read sub_id; do
      if [ -n "$sub_id" ]; then
          curl -s -X DELETE "https://api.twitch.tv/helix/eventsub/subscriptions?id=$sub_id" \
            -H "Client-ID: $CLIENT_ID" \
            -H "Authorization: Bearer $BEARER"
          echo "? Deleted subscription $sub_id"
      fi
    done

# ===== Step 2: Resubscribe to stream.online and stream.offline =====
STREAMER_ID="61462845" # your broadcaster ID

for type in "stream.online" "stream.offline"; do
  echo "?? Subscribing $type for $STREAMER_ID..."
  response=$(curl -s -X POST "https://api.twitch.tv/helix/eventsub/subscriptions" \
    -H "Client-ID: $CLIENT_ID" \
    -H "Authorization: Bearer $BEARER" \
    -H "Content-Type: application/json" \
    -d "{
      \"type\": \"$type\",
      \"version\": \"1\",
      \"condition\": {\"broadcaster_user_id\": \"$STREAMER_ID\"},
      \"transport\": {
        \"method\": \"webhook\",
        \"callback\": \"$CALLBACK\",
        \"secret\": \"$WEBHOOK_SECRET\"
      }
    }")
  echo "?? Response: $response"
done

echo "? Done. All subscriptions reset and resubscribed."
