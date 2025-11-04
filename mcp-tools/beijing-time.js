#!/usr/bin/env node

/**
 * 北京时间查询工具
 * 作者：小牛马团队
 */

function getBeijingTime() {
  const now = new Date();
  const beijingTime = now.toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long'
  });

  return {
    city: '北京',
    country: '中国',
    timezone: 'Asia/Shanghai',
    timezone_name: '中国标准时间',
    timezone_offset: '+08:00',
    current_time: beijingTime,
    timestamp: now.getTime(),
    iso_string: now.toISOString(),
    unix_timestamp: Math.floor(now.getTime() / 1000),
    query_time: new Date().toISOString(),
    description: '北京时间（中国标准时间）'
  };
}

function getMultipleCityTimes() {
  const cities = [
    { name: '北京', timezone: 'Asia/Shanghai', country: '中国' },
    { name: '纽约', timezone: 'America/New_York', country: '美国' },
    { name: '伦敦', timezone: 'Europe/London', country: '英国' },
    { name: '东京', timezone: 'Asia/Tokyo', country: '日本' },
    { name: '悉尼', timezone: 'Australia/Sydney', country: '澳大利亚' }
  ];

  const now = new Date();
  return cities.map(city => ({
    city: city.name,
    country: city.country,
    timezone: city.timezone,
    current_time: now.toLocaleString('zh-CN', { timeZone: city.timezone }),
    timestamp: now.getTime()
  }));
}

function generateWeather(city = '北京') {
  const conditions = ['晴天', '多云', '阴天', '小雨', '大雨'];
  const airQuality = ['优', '良', '轻度污染', '中度污染'];
  
  return {
    city: city,
    current_time: getBeijingTime().current_time,
    weather: {
      temperature: Math.floor(Math.random() * 30) + 5,
      humidity: Math.floor(Math.random() * 50) + 30,
      condition: conditions[Math.floor(Math.random() * conditions.length)],
      wind_speed: Math.floor(Math.random() * 20) + 5,
      air_quality: airQuality[Math.floor(Math.random() * airQuality.length)]
    },
    note: '模拟天气数据，仅供测试'
  };
}

// 命令行处理
const args = process.argv.slice(2);
const command = args[0] || 'beijing';

switch (command) {
  case 'beijing':
  case 'time':
    console.log(JSON.stringify(getBeijingTime(), null, 2));
    break;
    
  case 'world':
  case 'cities':
    console.log(JSON.stringify(getMultipleCityTimes(), null, 2));
    break;
    
  case 'weather':
    const city = args[1] || '北京';
    console.log(JSON.stringify(generateWeather(city), null, 2));
    break;
    
  case 'help':
  default:
    console.log('🕐 北京时间查询工具');
    console.log('');
    console.log('使用方法:');
    console.log('  node beijing-time.js beijing    # 获取北京时间');
    console.log('  node beijing-time.js world      # 获取多个城市时间');
    console.log('  node beijing-time.js weather    # 获取天气信息');
    console.log('');
    console.log('示例:');
    console.log('  node beijing-time.js beijing');
    console.log('  node beijing-time.js weather 上海');
    break;
}
