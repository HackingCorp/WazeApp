import { SetMetadata } from "@nestjs/common";

export const ALLOW_INDIVIDUAL_USERS_KEY = "allowIndividualUsers";
export const AllowIndividualUsers = () =>
  SetMetadata(ALLOW_INDIVIDUAL_USERS_KEY, true);
