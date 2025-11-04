#!/usr/bin/env node

/**
 * MCP Weather & Time Server
 * 支持实时时间查询、天气信息和时区转换
 * 作者：小牛马团队
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

class WeatherTimeService {
  constructor() {
    this.timezones = {
      'beijing': 'Asia/Shanghai',
      'shanghai': 'Asia/Shanghai',
      'china': 'Asia/Shanghai',
      'utc': 'UTC',
      'london': 'Europe/London',
      'newyork': 'America/New_York',
      'tokyo': 'Asia/Tokyo',
      'sydney': 'Australia/Sydney'
    };
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
      
      return {
        timezone: timezone,
        current_time: timeString,
        timestamp: now.getTime(),
        iso_string: now.toISOString(),
        unix_timestamp: Math.floor(now.getTime() / 1000),
        formatted_time: now.toLocaleString('zh-CN', { timeZone: timezone })
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
      timezone_offset: '+08:00',
      description: '北京时间（中国标准时间）'
    };
  }

  getMultipleTimezones() {
    const timezones = [
      { name: '北京', timezone: 'Asia/Shanghai' },
      { name: '纽约', timezone: 'America/New_York' },
      { name: '伦敦', timezone: 'Europe/London' },
      { name: '东京', timezone: 'Asia/Tokyo' },
      { name: '悉尼', timezone: 'Australia/Sydney' }
    ];

    return timezones.map(tz => ({
      city: tz.name,
      ...this.getCurrentTime(tz.timezone)
    }));
  }

  async getWeatherInfo(city = '北京') {
    // 模拟天气API调用（实际使用时需要接入真实的天气API）
    const weatherData = {
      city: city,
      country: city === '北京' ? '中国' : '未知',
      current_time: this.getCurrentTime('Asia/Shanghai').formatted_time,
      weather: {
        temperature: Math.floor(Math.random() * 30) + 5, // 模拟温度 5-35度
        humidity: Math.floor(Math.random() * 50) + 30, // 模拟湿度 30-80%
        condition: ['晴天', '多云', '阴天', '小雨', '大雨'][Math.floor(Math.random() * 5)],
        wind_speed: Math.floor(Math.random() * 20) + 5, // 模拟风速 5-25 km/h
        air_quality: ['优', '良', '轻度污染', '中度污染'][Math.floor(Math.random() * 4)]
      },
      forecast: [
        { day: '今天', high: 25, low: 15, condition: '晴天' },
        { day: '明天', high: 27, low: 17, condition: '多云' },
        { day: '后天', high: 23, low: 14, condition: '小雨' }
      ],
      update_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    };

    return weatherData;
  }

  convertTimezone(time, fromTimezone, toTimezone) {
    try {
      const date = new Date(time);
      const fromTime = date.toLocaleString('zh-CN', { timeZone: fromTimezone });
      const toTime = date.toLocaleString('zh-CN', { timeZone: toTimezone });
      
      return {
        original_time: time,
        from_timezone: fromTimezone,
        to_timezone: toTimezone,
        from_time: fromTime,
        to_time: toTime,
        conversion_timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`时区转换失败: ${error.message}`);
    }
  }

  getAvailableTimezones() {
    return {
      supported_timezones: this.timezones,
      popular_cities: [
        { city: '北京', timezone: 'Asia/Shanghai', offset: '+08:00' },
        { city: '上海', timezone: 'Asia/Shanghai', offset: '+08:00' },
        { city: '纽约', timezone: 'America/New_York', offset: '-05:00' },
        { city: '伦敦', timezone: 'Europe/London', offset: '+00:00' },
        { city: '东京', timezone: 'Asia/Tokyo', offset: '+09:00' },
        { city: '悉尼', timezone: 'Australia/Sydney', offset: '+11:00' }
      ]
    };
  }
}

class WeatherTimeServer {
  constructor() {
    this.server = new Server(
      {
        name: 'weather-time-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.service = new WeatherTimeService();
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_beijing_time',
            description: '获取北京时间（中国标准时间）',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_current_time',
            description: '获取指定时区的当前时间',
            inputSchema: {
              type: 'object',
              properties: {
                timezone: {
                  type: 'string',
                  description: '时区名称（如：Asia/Shanghai, America/New_York）',
                  default: 'Asia/Shanghai'
                },
              },
            },
          },
          {
            name: 'get_multiple_timezones',
            description: '获取多个城市的当前时间',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_weather_info',
            description: '获取指定城市的天气信息',
            inputSchema: {
              type: 'object',
              properties: {
                city: {
                  type: 'string',
                  description: '城市名称',
                  default: '北京'
                },
              },
            },
          },
          {
            name: 'convert_timezone',
            description: '时区转换工具',
            inputSchema: {
              type: 'object',
              properties: {
                time: {
                  type: 'string',
                  description: '要转换的时间（ISO格式或时间戳）',
                },
                from_timezone: {
                  type: 'string',
                  description: '源时区',
                },
                to_timezone: {
                  type: 'string',
                  description: '目标时区',
                },
              },
              required: ['time', 'from_timezone', 'to_timezone'],
            },
          },
          {
            name: 'get_available_timezones',
            description: '获取支持的时区列表',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_beijing_time':
            const beijingTime = this.service.getBeijingTime();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(beijingTime, null, 2),
                },
              ],
            };

          case 'get_current_time':
            const currentTime = this.service.getCurrentTime(args.timezone);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(currentTime, null, 2),
                },
              ],
            };

          case 'get_multiple_timezones':
            const multipleTimezones = this.service.getMultipleTimezones();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(multipleTimezones, null, 2),
                },
              ],
            };

          case 'get_weather_info':
            const weather = await this.service.getWeatherInfo(args.city);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(weather, null, 2),
                },
              ],
            };

          case 'convert_timezone':
            const conversion = this.service.convertTimezone(
              args.time,
              args.from_timezone,
              args.to_timezone
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(conversion, null, 2),
                },
              ],
            };

          case 'get_available_timezones':
            const timezones = this.service.getAvailableTimezones();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(timezones, null, 2),
                },
              ],
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `工具执行失败: ${error.message}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Weather & Time MCP Server 已启动');
  }
}

const server = new WeatherTimeServer();
server.run().catch(console.error);
