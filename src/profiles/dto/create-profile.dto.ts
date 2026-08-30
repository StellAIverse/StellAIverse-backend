import { IsString, IsOptional, Length, IsEmail, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ProfileVisibility } from "../entities/profile-visibility.enum";
import { ProfilePreferencesDto } from "./profile-preferences.dto";

export class CreateProfileDto {
  @IsString()
  @Length(3, 30)
  displayName: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfilePreferencesDto)
  preferences?: ProfilePreferencesDto;
}