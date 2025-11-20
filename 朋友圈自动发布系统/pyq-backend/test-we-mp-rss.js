const axios = require('axios');

const weMpRssUrl = 'http://localhost:8001';
const username = 'admin';
const password = 'admin@123';

async function testWeMpRss() {
  try {
    // 1. 登录
    console.log('🔐 正在登录...');
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);

    const loginResponse = await axios.post(
      `${weMpRssUrl}/api/v1/wx/auth/login`,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = loginResponse.data.data.access_token;
    console.log('✅ 登录成功\n');

    // 2. 获取文章列表
    console.log('📋 获取文章列表...');
    const articlesResponse = await axios.get(
      `${weMpRssUrl}/api/v1/wx/articles`,
      {
        params: {
          offset: 0,
          limit: 1,
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const articles = articlesResponse.data.data.list;
    if (articles.length === 0) {
      console.log('⚠️ 没有文章');
      return;
    }

    const firstArticle = articles[0];
    console.log('\n📄 文章列表返回的第一篇文章:');
    console.log('ID:', firstArticle.id);
    console.log('标题:', firstArticle.title);
    console.log('作者:', firstArticle.author);
    console.log('URL:', firstArticle.url);
    console.log('内容字段:', firstArticle.content ? `有内容(${firstArticle.content.length}字符)` : '无内容');
    console.log('所有字段:', Object.keys(firstArticle));

    // 3. 获取文章详情
    console.log('\n\n📖 获取文章详情...');
    const detailResponse = await axios.get(
      `${weMpRssUrl}/api/v1/wx/articles/${firstArticle.id}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const articleDetail = detailResponse.data.data;
    console.log('\n📄 文章详情返回的数据:');
    console.log('ID:', articleDetail.id);
    console.log('标题:', articleDetail.title);
    console.log('作者:', articleDetail.author);
    console.log('URL:', articleDetail.url);
    console.log('内容字段:', articleDetail.content ? `有内容(${articleDetail.content.length}字符)` : '无内容');
    console.log('所有字段:', Object.keys(articleDetail));
    
    if (articleDetail.content) {
      console.log('\n📝 内容预览:');
      console.log(articleDetail.content.substring(0, 500));
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testWeMpRss();

