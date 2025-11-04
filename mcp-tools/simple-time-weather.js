#!/usr/bin/env node

/**
 * 简化版时间天气服务器 - 无需额外依赖
 * 提供北京时间查询、时区转换和模拟天气信息
 * 作者：小牛马团队
 */

class SimpleTimeWeatherService {
  constructor() {
    this.timezones = {
      'beijing': 'Asia/Shanghai',
      'shanghai': 'Asia/Shanghai', 
      'china': 'Asia/Shanghai',
      'utc': 'UTC',
      'london': 'Europe/London',
      'newyork': 'America/New_York',
      'tokyo': 'Asia/Tokyo',
      'sydney': 'Australia/Sydney',
      'paris': 'Europe/Paris',
      'moscow': 'Europe/Moscow',
      'dubai': 'Asia/Dubai',
      'singapore': 'Asia/Singapore'
    };

    this.weatherConditions = ['晴天', '多云', '阴天', '小雨', '大雨', '雪天', '雾霾'];
    this.airQualityLevels = ['优', '良', '轻度污染', '中度污染', '重度污染'];
  }

  getCurrentTime(timezone = 'Asia/Shanghai') {
    try {
      const now = new Date();
      const options = {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'long'
      };
      
      const formatter = new Intl.DateTimeFormat('zh-CN', options);
      const timeString = formatter.format(now);
      
      // 获取时区偏移
      const offsetMinutes = now.getTimezoneOffset();
      const offsetHours = Math.abs(offsetMinutes / 60);
      const offsetSign = offsetMinutes <= 0 ? '+' : '-';
      const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:00`;
      
      return {
        timezone: timezone,
        current_time: timeString,
        timestamp: now.getTime(),
        iso_string: now.toISOString(),
        unix_timestamp: Math.floor(now.getTime() / 1000),
        formatted_time: now.toLocaleString('zh-CN', { timeZone: timezone }),
        timezone_offset: offsetString,
        query_time: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`时间获取失败: ${error.message}`);
    }
  }

  getBeijingTime() {
    const timeInfo = this.getCurrentTime('Asia/Shanghai');
    return {
      ...timeInfo,
      city: '北京',
      country: '中国',
      timezone_name: '中国标准时间',
      timezone_abbreviation: 'CST',
      timezone_offset: '+08:00',
      description: '北京时间（中国标准时间）',
      is_daylight_saving: false
    };
  }

  getMultipleTimezones() {
    const cities = [
      { name: '北京', timezone: 'Asia/Shanghai', country: '中国' },
      { name: '纽约', timezone: 'America/New_York', country: '美国' },
      { name: '伦敦', timezone: 'Europe/London', country: '英国' },
      { name: '东京', timezone: 'Asia/Tokyo', country: '日本' },
      { name: '悉尼', timezone: 'Australia/Sydney', country: '澳大利亚' },
      { name: '巴黎', timezone: 'Europe/Paris', country: '法国' },
      { name: '新加坡', timezone: 'Asia/Singapore', country: '新加坡' }
    ];

    return {
      world_times: cities.map(city => ({
        city: city.name,
        country: city.country,
        ...this.getCurrentTime(city.timezone)
      })),
      query_time: new Date().toISOString(),
      total_cities: cities.length
    };
  }

  generateWeatherInfo(city = '北京') {
    // 生成模拟天气数据
    const temperature = Math.floor(Math.random() * 35) + 5; // 5-40度
    const humidity = Math.floor(Math.random() * 50) + 30; // 30-80%
    const windSpeed = Math.floor(Math.random() * 20) + 5; // 5-25 km/h
    const condition = this.weatherConditions[Math.floor(Math.random() * this.weatherConditions.length)];
    const airQuality = this.airQualityLevels[Math.floor(Math.random() * this.airQualityLevels.length)];

    return {
      city: city,
      country: city === '北京' ? '中国' : '未知',
      current_time: this.getCurrentTime('Asia/Shanghai').formatted_time,
      weather: {
        temperature: temperature,
        feels_like: temperature + Math.floor(Math.random() * 6) - 3,
        humidity: humidity,
        condition: condition,
        wind_speed: windSpeed,
        wind_direction: ['北风', '南风', '东风', '西风', '东北风', '西南风'][Math.floor(Math.random() * 6)],
        air_quality: airQuality,
        visibility: Math.floor(Math.random() * 20) + 5, // 5-25公里
        uv_index: Math.floor(Math.random() * 11) + 1 // 1-11
      },
      forecast: [
        { 
          day: '今天', 
          high: temperature + 3, 
          low: temperature - 8, 
          condition: condition,
          rain_chance: Math.floor(Math.random() * 100)
        },
        { 
          day: '明天', 
          high: temperature + Math.floor(Math.random() * 6) - 3, 
          low: temperature - Math.floor(Math.random() * 10) - 5, 
          condition: this.weatherConditions[Math.floor(Math.random() * this.weatherConditions.length)],
          rain_chance: Math.floor(Math.random() * 100)
        },
        { 
          day: '后天', 
          high: temperature + Math.floor(Math.random() * 6) - 3, 
          low: temperature - Math.floor(Math.random() * 10) - 5, 
          condition: this.weatherConditions[Math.floor(Math.random() * this.weatherConditions.length)],
          rain_chance: Math.floor(Math.random() * 100)
        }
      ],
      update_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      data_source: '模拟数据（仅供测试）',
      note: '这是模拟的天气数据，实际使用请接入真实的天气API'
    };
  }

  convertTimezone(time, fromTimezone, toTimezone) {
    try {
      let date;
      
      // 尝试解析不同格式的时间
      if (typeof time === 'number') {
        date = new Date(time);
      } else if (typeof time === 'string') {
        date = new Date(time);
      } else {
        throw new Error('无效的时间格式');
      }

      if (isNaN(date.getTime())) {
        throw new Error('无法解析的时间格式');
      }

      const fromTime = date.toLocaleString('zh-CN', { timeZone: fromTimezone });
      const toTime = date.toLocaleString('zh-CN', { timeZone: toTimezone });
      
      return {
        original_time: time,
        from_timezone: fromTimezone,
        to_timezone: toTimezone,
        from_time: fromTime,
        to_time: toTime,
        from_iso: date.toLocaleString('en-CA', { timeZone: fromTimezone }),
        to_iso: date.toLocaleString('en-CA', { timeZone: toTimezone }),
        conversion_timestamp: Date.now(),
        conversion_time: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`时区转换失败: ${error.message}`);
    }
  }

  getAvailableTimezones() {
    return {
      supported_timezones: this.timezones,
      popular_cities: [
        { city: '北京', timezone: 'Asia/Shanghai', offset: '+08:00', country: '中国' },
        { city: '上海', timezone: 'Asia/Shanghai', offset: '+08:00', country: '中国' },
        { city: '纽约', timezone: 'America/New_York', offset: '-05:00', country: '美国' },
        { city: '伦敦', timezone: 'Europe/London', offset: '+00:00', country: '英国' },
        { city: '东京', timezone: 'Asia/Tokyo', offset: '+09:00', country: '日本' },
        { city: '悉尼', timezone: 'Australia/Sydney', offset: '+11:00', country: '澳大利亚' },
        { city: '巴黎', timezone: 'Europe/Paris', offset: '+01:00', country: '法国' },
        { city: '新加坡', timezone: 'Asia/Singapore', offset: '+08:00', country: '新加坡' }
      ],
      total_supported: Object.keys(this.timezones).length,
      query_time: new Date().toISOString()
    };
  }

  getTimeComparison(cities = ['beijing', 'newyork', 'london', 'tokyo']) {
    const results = cities.map(city => {
      const timezone = this.timezones[city.toLowerCase()] || city;
      try {
        return {
          city: city,
          timezone: timezone,
          ...this.getCurrentTime(timezone),
          success: true
        };
      } catch (error) {
        return {
          city: city,
          timezone: timezone,
          error: error.message,
          success: false
        };
      }
    });

    return {
      time_comparison: results,
      successful_queries: results.filter(r => r.success).length,
      failed_queries: results.filter(r => !r.success).length,
      query_time: new Date().toISOString()
    };
  }
}

// 命令行接口
async function main() {
  const service = new SimpleTimeWeatherService();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'beijing':
        console.log(JSON.stringify(service.getBeijingTime(), null, 2));
        break;
        
      case 'time':
        const timezone = args[1] || 'Asia/Shanghai';
        console.log(JSON.stringify(service.getCurrentTime(timezone), null, 2));
        break;
        
      case 'world':
        console.log(JSON.stringify(service.getMultipleTimezones(), null, 2));
        break;
        
      case 'weather':
        const city = args[1] || '北京';
        console.log(JSON.stringify(service.generateWeatherInfo(city), null, 2));
        break;
        
      case 'convert':
        if (args.length < 4) {
          console.log('使用方法: node simple-time-weather.js convert <时间> <源时区> <目标时区>');
          break;
        }
        const result = service.convertTimezone(args[1], args[2], args[3]);
        console.log(JSON.stringify(result, null, 2));
        break;
        
      case 'timezones':
        console.log(JSON.stringify(service.getAvailableTimezones(), null, 2));
        break;
        
      case 'compare':
        const cities = args.slice(1);
        if (cities.length === 0) {
          cities.push('beijing', 'newyork', 'london', 'tokyo');
        }
        console.log(JSON.stringify(service.getTimeComparison(cities), null, 2));
        break;
        
      default:
        console.log('🕐 简化版时间天气服务器');
        console.log('');
        console.log('使用方法:');
        console.log('  node simple-time-weather.js beijing           # 获取北京时间');
        console.log('  node simple-time-weather.js time [时区]       # 获取指定时区时间');
        console.log('  node simple-time-weather.js world             # 获取世界主要城市时间');
        console.log('  node simple-time-weather.js weather [城市]    # 获取天气信息');
        console.log('  node simple-time-weather.js convert <时间> <源时区> <目标时区>');
        console.log('  node simple-time-weather.js timezones         # 查看支持的时区');
        console.log('  node simple-time-weather.js compare [城市...]  # 时间对比');
        console.log('');
        console.log('示例:');
        console.log('  node simple-time-weather.js beijing');
        console.log('  node simple-time-weather.js time Asia/Tokyo');
        console.log('  node simple-time-weather.js weather 上海');
        console.log('  node simple-time-weather.js convert "2024-10-15 12:00:00" Asia/Shanghai America/New_York');
        break;
    }
  } catch (error) {
    console.error('错误:', error.message);
  }
}

// 如果直接运行此文件
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default SimpleTimeWeatherService;
