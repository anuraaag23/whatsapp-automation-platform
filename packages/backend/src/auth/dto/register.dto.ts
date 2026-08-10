import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  /** Required unless inviteToken is provided (joining an existing org instead of creating one). */
  @IsOptional()
  @IsString()
  organizationName?: string;

  /** If set, the new account joins the inviting organization instead of creating a new one. */
  @IsOptional()
  @IsString()
  inviteToken?: string;
}
