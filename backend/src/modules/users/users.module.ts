import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { User, OrganizationMember, AuditLog } from "@/common/entities";
import { AuditService } from "../audit/audit.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, OrganizationMember, AuditLog])],
  controllers: [UsersController],
  providers: [UsersService, AuditService],
  exports: [UsersService],
})
export class UsersModule {}
