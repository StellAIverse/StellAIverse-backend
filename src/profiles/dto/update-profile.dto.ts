import { IsString, IsOptional, Length, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ProfilePreferencesDto } from "./profile-preferences.dto";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 30)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  bio?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfilePreferencesDto)
  preferences?: ProfilePreferencesDto;

  @IsOptional()
  @IsString()
  avatar?: string | null;
}