import {
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  BaseEntity as TypeOrmBaseEntity,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";

export abstract class BaseEntity extends TypeOrmBaseEntity {
  @ApiProperty({ description: "Unique identifier" })
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty({ description: "Creation timestamp" })
  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt: Date;
}
