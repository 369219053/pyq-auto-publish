#!/bin/bash

echo "🔍 检查数据库存储情况..."
echo ""

SUPABASE_URL="https://pxmopubswbienvjzaskc.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bW9wdWJzd2JpZW52anphc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA3MTI3NzAsImV4cCI6MjA0NjI4ODc3MH0.VJWuUIG_r7x7vYEqUnits3Uw_zcKkKPOJqTEMCqPLbI"

# 检查好友表
echo "📊 检查 duixueqiu_friends 表..."
curl -s "${SUPABASE_URL}/rest/v1/duixueqiu_friends?select=count" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact"
echo ""
echo ""

# 检查任务表
echo "📊 检查 follow_circle_tasks 表..."
curl -s "${SUPABASE_URL}/rest/v1/follow_circle_tasks?select=count" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact"
echo ""
echo ""

# 检查文章表
echo "�� 检查 wechat_articles 表..."
curl -s "${SUPABASE_URL}/rest/v1/wechat_articles?select=count" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Prefer: count=exact"
echo ""
echo ""

echo "✅ 检查完成!"
