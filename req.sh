#!/bin/bash

# You can now write the prompt on multiple lines naturally
PROMPT="Close-up cyberpunk scene of a young Vietnamese woman,
translucent holographic notification floating before her eyes,
“Welcome back, Linh,” 
neon city lights, photorealistic, ultra-detailed"

# jq will handle the newlines in the $PROMPT variable correctly
PAYLOAD=$(jq -n --arg content "$PROMPT" '
{
  "input": [
    {
      "role": "user",
      "content": $content
    }
  ]
}')

curl -X POST http://localhost:8765/images/client-1 \
     -H "Content-Type: application/json" \
     -d "$PAYLOAD"
