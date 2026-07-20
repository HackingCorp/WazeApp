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

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    // Si l'endpoint autorise l'accès personnel (@AllowIndividualUsers) et que
    // l'utilisateur n'a pas de rôle effectif, on l'autorise — y compris quand un
    // organizationId est présent mais que le rôle est absent du JWT (ancien token
    // ou token émis à l'inscription sans rôle). Les services filtrent de toute
    // façon par userId/organizationId, donc aucun accès cross-tenant.
    if (allowIndividualUsers && !user.role) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
