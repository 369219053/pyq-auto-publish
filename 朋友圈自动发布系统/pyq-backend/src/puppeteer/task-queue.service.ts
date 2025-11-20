import { Injectable, Logger } from '@nestjs/common';
import { AutomationGateway } from '../automation/automation.gateway';

/**
 * 任务类型
 */
export enum TaskType {
  SCRIPT1 = 'script1', // 短任务
  SCRIPT3 = 'script3', // 短任务
  SCRIPT4_IMMEDIATE = 'script4_immediate', // 短任务(立即发布)
  SCRIPT4_SCHEDULED = 'script4_scheduled', // 长任务(定时发布)
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  HIGH = 1, // 短任务,优先执行
  LOW = 2, // 长任务,可以被打断
}

/**
 * 任务接口
 */
export interface QueueTask {
  taskId: string;
  type: TaskType;
  priority: TaskPriority;
  execute: () => Promise<void>;
  createdAt: Date;
}

/**
 * 浏览器状态
 */
export enum BrowserStatus {
  IDLE = 'idle', // 空闲
  BUSY = 'busy', // 正在执行任务
  WAITING = 'waiting', // 等待定时任务
}

/**
 * 智能任务队列服务
 * 
 * 核心功能:
 * 1. 任务优先级管理 - 短任务优先执行
 * 2. 智能穿插调度 - 利用Script 4的等待间隙执行其他任务
 * 3. 浏览器状态管理 - 确保同一时间只有一个任务使用浏览器
 */
@Injectable()
export class TaskQueueService {
  private readonly logger = new Logger(TaskQueueService.name);

  // 任务队列 (按优先级排序)
  private taskQueue: QueueTask[] = [];

  // 浏览器状态
  private browserStatus: BrowserStatus = BrowserStatus.IDLE;

  // 当前正在执行的任务
  private currentTask: QueueTask | null = null;

  // 是否正在处理队列
  private isProcessing = false;

  constructor(private readonly gateway: AutomationGateway) {}

  /**
   * 添加任务到队列
   */
  async addTask(task: QueueTask): Promise<void> {
    this.logger.log(`📥 添加任务到队列: ${task.taskId} (类型: ${task.type}, 优先级: ${task.priority})`);

    // 添加到队列
    this.taskQueue.push(task);

    // 按优先级排序 (优先级数字越小越优先)
    this.taskQueue.sort((a, b) => a.priority - b.priority);

    // 通知前端任务状态
    this.emitQueueStatus(task.taskId, 'queued', this.getTaskPosition(task.taskId));

    // 如果浏览器空闲,立即开始处理队列
    if (this.browserStatus === BrowserStatus.IDLE && !this.isProcessing) {
      await this.processQueue();
    }
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('⚠️ 队列正在处理中,跳过');
      return;
    }

    this.isProcessing = true;
    this.logger.log('🔄 开始处理任务队列...');

    while (this.taskQueue.length > 0) {
      // 等待浏览器空闲
      while (this.browserStatus !== BrowserStatus.IDLE) {
        this.logger.log('⏳ 浏览器忙碌中,等待空闲...');
        await this.sleep(1000);
      }

      // 取出优先级最高的任务
      const task = this.taskQueue.shift();
      if (!task) break;

      this.currentTask = task;
      this.browserStatus = BrowserStatus.BUSY;

      this.logger.log(`▶️ 开始执行任务: ${task.taskId} (类型: ${task.type})`);
      this.emitQueueStatus(task.taskId, 'executing', 0);

      try {
        await task.execute();
        this.logger.log(`✅ 任务执行成功: ${task.taskId}`);
      } catch (error) {
        this.logger.error(`❌ 任务执行失败: ${task.taskId}`, error.stack);
      }

      this.currentTask = null;
      this.browserStatus = BrowserStatus.IDLE;

      // 更新队列中其他任务的位置
      this.updateQueuePositions();
    }

    this.isProcessing = false;
    this.logger.log('✅ 队列处理完成');
  }

  /**
   * 标记浏览器为等待状态 (Script 4等待间隔时调用)
   * 
   * 这个方法允许在Script 4等待间隔期间执行其他短任务
   */
  markBrowserWaiting(): void {
    this.logger.log('⏰ 浏览器进入等待状态 (可以执行短任务)');
    this.browserStatus = BrowserStatus.WAITING;

    // 检查是否有高优先级任务可以执行
    if (this.taskQueue.length > 0 && !this.isProcessing) {
      const nextTask = this.taskQueue[0];
      if (nextTask.priority === TaskPriority.HIGH) {
        this.logger.log(`🚀 发现高优先级任务,立即执行: ${nextTask.taskId}`);
        this.browserStatus = BrowserStatus.IDLE; // 释放浏览器
        this.processQueue(); // 不等待,异步执行
      }
    }
  }

  /**
   * 标记浏览器为空闲状态
   */
  markBrowserIdle(): void {
    this.logger.log('✅ 浏览器空闲');
    this.browserStatus = BrowserStatus.IDLE;

    // 继续处理队列
    if (this.taskQueue.length > 0 && !this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 标记浏览器为忙碌状态
   */
  markBrowserBusy(): void {
    this.logger.log('🔒 浏览器忙碌');
    this.browserStatus = BrowserStatus.BUSY;
  }

  /**
   * 获取任务在队列中的位置
   */
  private getTaskPosition(taskId: string): number {
    const index = this.taskQueue.findIndex(t => t.taskId === taskId);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * 更新队列中所有任务的位置
   */
  private updateQueuePositions(): void {
    this.taskQueue.forEach((task, index) => {
      this.emitQueueStatus(task.taskId, 'queued', index + 1);
    });
  }

  /**
   * 发送队列状态到前端
   */
  private emitQueueStatus(taskId: string, status: 'queued' | 'executing', position: number): void {
    this.gateway.server.emit('queueStatus', {
      taskId,
      status,
      position,
      queueLength: this.taskQueue.length,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 移除任务 (用于停止任务)
   */
  removeTask(taskId: string): boolean {
    const index = this.taskQueue.findIndex(t => t.taskId === taskId);
    if (index > -1) {
      this.taskQueue.splice(index, 1);
      this.logger.log(`🗑️ 任务已从队列移除: ${taskId}`);
      this.updateQueuePositions();
      return true;
    }
    return false;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return {
      browserStatus: this.browserStatus,
      currentTask: this.currentTask ? {
        taskId: this.currentTask.taskId,
        type: this.currentTask.type,
      } : null,
      queueLength: this.taskQueue.length,
      tasks: this.taskQueue.map((task, index) => ({
        taskId: task.taskId,
        type: task.type,
        priority: task.priority,
        position: index + 1,
      })),
    };
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

