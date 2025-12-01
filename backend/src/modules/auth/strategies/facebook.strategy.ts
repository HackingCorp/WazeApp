import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-facebook";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, "facebook") {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get("FACEBOOK_CLIENT_ID"),
      clientSecret: configService.get("FACEBOOK_CLIENT_SECRET"),
      callbackURL: `${configService.get("APP_URL")}/api/v1/auth/facebook/callback`,
      scope: "email",
      profileFields: ["emails", "name", "picture"],
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
      facebookId: id,
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
