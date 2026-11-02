import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** A person in lists, chats and profile actions. */
export class UserCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({
    description:
      'They hid their page: shown only to the list owner and admins, without a link',
  })
  pageHidden!: boolean;
}

/** Public counters of a page; only active accounts are counted. */
export class SocialCountsDto {
  @ApiProperty() followers!: number;
  @ApiProperty() following!: number;
  @ApiProperty() friends!: number;
}

/** The viewer's relation to a page owner and the actions it allows. */
export class RelationDto {
  @ApiProperty({ description: 'The viewer follows this user' })
  following!: boolean;
  @ApiProperty({ description: 'This user follows the viewer' })
  followsYou!: boolean;
  @ApiProperty({ description: 'Mutual follow' })
  friends!: boolean;
  @ApiProperty({ description: 'The viewer blocked this user' })
  blocked!: boolean;
  @ApiProperty() canFollow!: boolean;
  @ApiProperty({ description: 'Friends can message each other' })
  canMessage!: boolean;
}

export const SOCIAL_LISTS = ['friends', 'followers', 'following'] as const;
export type SocialList = (typeof SOCIAL_LISTS)[number];

export class SocialListQueryDto {
  @ApiPropertyOptional({
    enum: SOCIAL_LISTS,
    enumName: 'SocialList',
    default: 'friends',
  })
  @IsOptional()
  @IsIn(SOCIAL_LISTS)
  list?: SocialList;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** A person's videos, as counted on their shelf. */
export class UserVideoCountsDto {
  @ApiProperty() public!: number;
  @ApiProperty() private!: number;
  @ApiProperty({
    description: 'Received from others (exchanges, shares, bookmarks)',
  })
  received!: number;
}

export class SocialListItemDto extends UserCardDto {
  @ApiProperty({ type: UserVideoCountsDto }) videos!: UserVideoCountsDto;
  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Exchanges completed between this person and the list’s owner; only the owner sees it (null for others)',
  })
  exchanges!: number | null;
}

export class SocialListDto {
  @ApiProperty({ enum: SOCIAL_LISTS, enumName: 'SocialList' })
  list!: SocialList;
  @ApiProperty({ type: [SocialListItemDto] }) items!: SocialListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() offset!: number;
  @ApiProperty({ type: SocialCountsDto }) counts!: SocialCountsDto;
}
