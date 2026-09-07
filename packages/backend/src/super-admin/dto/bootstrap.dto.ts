import { IsEmail, IsOptional, IsString } from 'class-validator';

export class BootstrapSuperAdminDto {
  @IsEmail()
  email!: string;

  /**
   * Strong secret matching the server's SUPER_ADMIN_BOOTSTRAP_SECRET environment variable.
   * Can be supplied in the request body or via the 'x-bootstrap-secret' request header.
   */
  @IsOptional()
  @IsString()
  secret?: string;
}
