import { IsNotEmpty, IsString } from 'class-validator';

export class ImportContactsDto {
  /**
   * Raw CSV content. Expected header row (case-insensitive, any order):
   * phoneNumber, firstName, lastName, email, company, city
   */
  @IsString()
  @IsNotEmpty()
  csv!: string;
}
