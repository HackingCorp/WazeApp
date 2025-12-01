import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { User } from "../entities/user.entity";

export interface AuthenticatedRequest {
  user: User;
  userId: string;
  email: string;
  organizationId?: string;
  role?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedRequest | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
