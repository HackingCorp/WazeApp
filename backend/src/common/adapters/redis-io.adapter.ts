import { IoAdapter } from "@nestjs/platform-socket.io";
import { INestApplication, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplication,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const host = this.configService.get("REDIS_HOST", "localhost");
    const port = this.configService.get<number>("REDIS_PORT", 6379);
    const password = this.configService.get("REDIS_PASSWORD");

    const opts = {
      host,
      port: Number(port),
      password: password || undefined,
    };

    const pubClient = new Redis(opts);
    const subClient = new Redis(opts);

    this.adapterConstructor = createAdapter(pubClient, subClient) as any;
    this.logger.log("Redis adapter for Socket.io connected");
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
