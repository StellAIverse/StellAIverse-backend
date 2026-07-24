import { SetMetadata } from "@nestjs/common";
import { ROLES_KEY } from "./roles.guard";

/**
 * Decorator to restrict a route to users with specific roles.
 * @example @Roles('admin', 'operator')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
