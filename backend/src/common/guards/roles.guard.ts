import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../enums";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { ALLOW_INDIVIDUAL_USERS_KEY } from "../decorators/allow-individual-users.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const allowIndividualUsers = this.reflector.getAllAndOverride<boolean>(
      ALLOW_INDIVIDUAL_USERS_KEY,
      [context.getHandler(), context.getClass()],
    );

    console.log("[RolesGuard] Required roles:", requiredRoles);
    console.log("[RolesGuard] Allow individual users:", allowIndividualUsers);
    console.log("[RolesGuard] Handler:", context.getHandler().name);
    console.log("[RolesGuard] Class:", context.getClass().name);

    if (!requiredRoles) {
      console.log("[RolesGuard] No required roles, allowing access");
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    console.log("[RolesGuard] User:", user);

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    // If this endpoint allows individual users and user has no role (individual user), allow access
    if (allowIndividualUsers && !user.role && !user.organizationId) {
      console.log(
        "[RolesGuard] Individual user without organization, allowing access",
      );
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.role === role);
    console.log("[RolesGuard] User role:", user.role);
    console.log("[RolesGuard] Has required role:", hasRole);

    if (!hasRole) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
