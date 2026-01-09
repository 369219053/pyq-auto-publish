#!/bin/bash

echo "�� 开始优化duixueqiu_friends表..."
echo ""

# Supabase配置
SUPABASE_URL="https://pxmopubswbienvjzaskc.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4bW9wdWJzd2JpZW52anphc2tjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA3MTI3NzAsImV4cCI6MjA0NjI4ODc3MH0.VJWuUIG_r7x7vYEqUnits3Uw_zcKkKPOJqTEMCqPLbI"

# 1. 创建组合索引
echo "1️⃣ 创建组合索引..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_user_name ON duixueqiu_friends(user_id, friend_name);"}'
echo ""
echo "✅ 组合索引创建完成"
echo ""

# 2. 创建覆盖索引
echo "2️⃣ 创建覆盖索引(可能需要1-2分钟)..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"CREATE INDEX IF NOT EXISTS idx_duixueqiu_friends_covering ON duixueqiu_friends(user_id, friend_name) INCLUDE (id, friend_remark, avatar_url, wechat_account_index, wechat_account_name, is_selected);"}'
echo ""
echo "✅ 覆盖索引创建完成"
echo ""

# 3. 优化表统计
echo "3️⃣ 优化表统计信息..."
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"VACUUM ANALYZE duixueqiu_friends;"}'
echo ""
echo "✅ 表统计优化完成"
echo ""

echo "🎉 优化完成!"
