import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Proof that the owner really wants the account gone. */
export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: 'Current password; required when the account has one',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({
    description:
      'The username typed again; required for accounts without a password (Google only)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  confirm?: string;
}
