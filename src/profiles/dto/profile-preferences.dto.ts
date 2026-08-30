import { IsEnum, IsBoolean, IsOptional } from "class-validator";
import { ProfileVisibility } from "../entities/profile-visibility.enum";

export class ProfilePreferencesDto {
  @IsOptional()
  @IsEnum(ProfileVisibility)
  visibility?: ProfileVisibility;

  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  showBio?: boolean;

  @IsOptional()
  @IsBoolean()
  showActivity?: boolean;
}