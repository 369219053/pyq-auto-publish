-- 将we-mp-rss中的订阅迁移到wechat_subscriptions表
-- 分配给leonhao用户
-- 执行时间: 2025-11-19

-- leonhao的user_id
-- 2e748b58-8f94-48ba-8a43-a1b0c93ed3a0

-- 插入10个订阅记录
INSERT INTO wechat_subscriptions (user_id, mp_id, mp_name, mp_cover, mp_intro)
VALUES
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3075190689', '刘晓博说趋势', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3547953554', '刘晓博说财经', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3874425459', '刘晓博说楼市', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3906207580', '屋里涛说', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3937899088', '上海买房入学', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3949023801', '港房汤姆', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3237467134', '魔都财观', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3928898756', '沪港纪老板', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3891906515', '生财有术', NULL, NULL),
  ('2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', 'MP_WXS_3198681240', '刀仔说COZE', NULL, NULL)
ON CONFLICT (user_id, mp_id) DO NOTHING;

-- 更新已有文章的user_id
-- 将所有文章分配给leonhao
UPDATE wechat_articles
SET user_id = '2e748b58-8f94-48ba-8a43-a1b0c93ed3a0'
WHERE user_id IS NULL;

