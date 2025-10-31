import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * WebSocket Gateway - 用于实时推送跟圈任务执行日志
 */
@WebSocketGateway({
  cors: {
    origin: '*', // 生产环境应该限制为具体域名
    credentials: true,
  },
  namespace: '/automation',
})
export class AutomationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AutomationGateway.name);

  /**
   * 客户端连接时触发
   */
  handleConnection(client: Socket) {
    this.logger.log(`客户端已连接: ${client.id}`);
  }

  /**
   * 客户端断开时触发
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`客户端已断开: ${client.id}`);
  }

  /**
   * 发送日志到所有连接的客户端
   */
  emitLog(taskGroupId: string, log: string) {
    this.logger.log(`[${taskGroupId}] ${log}`);
    this.server.emit('followCircleLog', {
      taskGroupId,
      log,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送任务完成通知
   */
  emitTaskComplete(taskGroupId: string, success: boolean, message?: string) {
    this.logger.log(`[${taskGroupId}] 任务完成: ${success ? '成功' : '失败'}`);
    this.server.emit('followCircleComplete', {
      taskGroupId,
      success,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送脚本1日志到所有连接的客户端
   */
  emitScript1Log(taskId: string, log: string) {
    this.logger.log(`[脚本1-${taskId}] ${log}`);
    this.server.emit('script1Log', {
      taskId,
      log,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送脚本1任务完成通知
   */
  emitScript1Complete(taskId: string, success: boolean, message?: string, data?: any) {
    this.logger.log(`[脚本1-${taskId}] 任务完成: ${success ? '成功' : '失败'}`);
    this.server.emit('script1Complete', {
      taskId,
      success,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送脚本3日志到所有连接的客户端
   */
  emitScript3Log(taskId: string, log: string) {
    this.logger.log(`[脚本3-${taskId}] ${log}`);
    this.server.emit('script3Log', {
      taskId,
      log,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送脚本3任务完成通知
   */
  emitScript3Complete(taskId: string, success: boolean, message?: string, data?: any) {
    this.logger.log(`[脚本3-${taskId}] 任务完成: ${success ? '成功' : '失败'}`);
    this.server.emit('script3Complete', {
      taskId,
      success,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}

