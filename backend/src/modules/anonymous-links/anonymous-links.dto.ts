import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import {
  ANONYMOUS_NAME_MAX,
  ANONYMOUS_NOTE_MAX,
} from './anonymous-link-rules.js';

/** A new anonymous link to my shelf. */
export class CreateAnonymousLinkDto {
  @ApiPropertyOptional({
    description: `My own note for it ("for Alex"), up to ${ANONYMOUS_NOTE_MAX} characters; nobody else sees it`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(ANONYMOUS_NOTE_MAX)
  note?: string;

  @ApiPropertyOptional({
    description: `The name I go by through it, up to ${ANONYMOUS_NAME_MAX} characters; without one, my display name. Needed when my display name gives away my nickname (nameNeeded); it must not name it either`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(ANONYMOUS_NAME_MAX)
  name?: string;
}

/** One of my anonymous links, in "My links". */
export class MyAnonymousLinkDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The shelf opens at /p/<code>' }) code!: string;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({
    description:
      'The name I go by through it, as others see it; empty = "Anonymous" in their language',
  })
  name!: string;
  @ApiProperty({
    description: 'A name of its own, rather than my display name',
  })
  ownName!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({
    description:
      'It opens: false while the owner is without Pro (the link waits for it to come back)',
  })
  works!: boolean;
}

/** My anonymous links, newest first, and what a new one needs. */
export class MyAnonymousLinksDto {
  @ApiProperty({ type: [MyAnonymousLinkDto] }) links!: MyAnonymousLinkDto[];
  @ApiProperty({
    description:
      'My display name gives away my nickname: a new link needs a name of its own',
  })
  nameNeeded!: boolean;
}
