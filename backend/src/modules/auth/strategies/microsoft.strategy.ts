import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-microsoft";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, "microsoft") {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get("MICROSOFT_CLIENT_ID"),
      clientSecret: configService.get("MICROSOFT_CLIENT_SECRET"),
      callbackURL: `${configService.get("APP_URL")}/api/v1/auth/microsoft/callback`,
      scope: ["user.read"],
      tenant: "common",
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: Function,
  ): Promise<any> {
    const { name, emails, photos, id } = profile;

    const user = {
      microsoftId: id,
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      avatar: photos[0].value,
      accessToken,
      refreshToken,
    };

    done(null, user);
  }
}
