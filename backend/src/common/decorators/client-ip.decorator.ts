import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * The address the request really came from.
 *
 * Behind Cloudflare, Express's `req.ip` is the edge node that relayed the
 * request (172.70.x.x…), so an API key restricted to a partner's server was
 * rejected every time. Cloudflare states the origin in `cf-connecting-ip`;
 * a generic proxy puts it first in `x-forwarded-for`.
 */
export function resolveClientIp(req: any): string {
  const headers = req?.headers || {};
  const cf = headers["cf-connecting-ip"];
  if (cf) return String(Array.isArray(cf) ? cf[0] : cf).trim();
  const xff = headers["x-forwarded-for"];
  if (xff) {
    const first = String(Array.isArray(xff) ? xff[0] : xff).split(",")[0].trim();
    if (first) return first;
  }
  const real = headers["x-real-ip"];
  if (real) return String(Array.isArray(real) ? real[0] : real).trim();
  return String(req?.ip || req?.socket?.remoteAddress || "").replace(/^::ffff:/, "");
}

export const ClientIp = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return resolveClientIp(ctx.switchToHttp().getRequest());
});
