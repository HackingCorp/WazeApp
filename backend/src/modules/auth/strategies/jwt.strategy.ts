import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId?: string;
  role?: string;
  type: "access" | "refresh" | "verification";
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }

    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("User account is deactivated");
    }

    // Set currentOrganizationId from JWT payload (can be null for users without organization)
    user.currentOrganizationId = payload.organizationId || null;

    return {
      userId: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId || null,
      role: payload.role || null,
      user,
    };
  }
}
