import { PartialType } from "@nestjs/mapped-types";
import { CreateUserDto } from "./create-user.dto";
import { IsOptional, IsString, Length, IsObject } from "class-validator";

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  @Length(3, 30)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  bio?: string;

  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;

  @IsOptional()
  @IsString()
  avatar?: string | null;
}