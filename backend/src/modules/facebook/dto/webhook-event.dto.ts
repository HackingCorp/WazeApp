import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsObject, IsArray, IsOptional } from "class-validator";

export class FacebookWebhookVerifyDto {
  @ApiProperty({ description: "Webhook verification mode" })
  @IsString()
  "hub.mode": string;

  @ApiProperty({ description: "Webhook verification token" })
  @IsString()
  "hub.verify_token": string;

  @ApiProperty({ description: "Challenge string to return" })
  @IsString()
  "hub.challenge": string;
}

export class FacebookWebhookEntryDto {
  @ApiProperty({ description: "Page ID" })
  @IsString()
  id: string;

  @ApiProperty({ description: "Event time" })
  time: number;

  @ApiProperty({ description: "Changes array" })
  @IsArray()
  @IsOptional()
  changes?: any[];

  @ApiProperty({ description: "Messaging events" })
  @IsArray()
  @IsOptional()
  messaging?: any[];
}

export class FacebookWebhookEventDto {
  @ApiProperty({ description: "Event object type" })
  @IsString()
  object: string;

  @ApiProperty({ description: "Entry array containing events" })
  @IsArray()
  entry: FacebookWebhookEntryDto[];
}

export class CommentEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  from: {
    id: string;
    name: string;
  };

  @ApiProperty()
  message: string;

  @ApiProperty()
  created_time: string;

  @ApiProperty({ required: false })
  parent?: {
    id: string;
    created_time: string;
  };

  @ApiProperty({ required: false })
  post_id?: string;

  @ApiProperty({ required: false })
  verb?: string; // 'add', 'edit', 'remove', etc.
}
