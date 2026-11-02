import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Visibility } from '../../generated/prisma/enums.js';
import { MESSAGE_MAX } from '../social/social-rules.js';

export const SEND_BLOCKERS = ['notFriends', 'unavailable'] as const;

/** The other side of a chat; a deleted account keeps its id but shows as "Deleted user". */
export class ChatUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({
    description: 'The account was deleted (show "Deleted user", no links)',
  })
  deleted!: boolean;
  @ApiProperty({
    description: 'They hid their page: show the name without a link',
  })
  pageHidden!: boolean;
}

/** A video attached to a message, shown as a card linking to the sender’s copy. */
export class ChatVideoDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'Short link code: the video opens at /<code>',
  })
  code!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) thumbnailUrl!: string | null;
  @ApiProperty({
    description: 'Marked sensitive: blur the card',
  })
  sensitive!: boolean;
  @ApiProperty({ nullable: true, type: Number }) durationSec!: number | null;
  @ApiProperty({ enum: Visibility, enumName: 'Visibility' })
  visibility!: Visibility;
  @ApiProperty({
    description:
      'Whose copy the card opens: /<code> in this holder\u2019s context',
  })
  holderUsername!: string;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty() senderId!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: ChatVideoDto, nullable: true })
  video!: ChatVideoDto | null;
  @ApiProperty({
    description:
      'A video was attached but is no longer available (deleted, hidden or gone)',
  })
  videoUnavailable!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ConversationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: ChatUserDto }) other!: ChatUserDto;
  @ApiProperty({ type: MessageDto, nullable: true })
  lastMessage!: MessageDto | null;
  @ApiProperty({
    description: 'Messages from the other side the viewer has not read',
  })
  unread!: number;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'How far the other side has read (for read marks)',
  })
  otherLastReadMessageId!: string | null;
  @ApiProperty({
    enum: SEND_BLOCKERS,
    enumName: 'SendBlocker',
    nullable: true,
    description: 'Why the viewer cannot send now; null when they can',
  })
  sendBlocker!: (typeof SEND_BLOCKERS)[number] | null;
}

export class ConversationListDto {
  @ApiProperty({ type: [ConversationDto] }) items!: ConversationDto[];
  @ApiProperty() unreadTotal!: number;
}

/** Opening /messages/:username: the person, the conversation if it exists, and whether one can write. */
export class ThreadDto {
  @ApiProperty({ type: ChatUserDto }) other!: ChatUserDto;
  @ApiProperty({ type: ConversationDto, nullable: true })
  conversation!: ConversationDto | null;
  @ApiProperty({ enum: SEND_BLOCKERS, enumName: 'SendBlocker', nullable: true })
  sendBlocker!: (typeof SEND_BLOCKERS)[number] | null;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Return messages older than this id' })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class MessagePageDto {
  @ApiProperty({ type: [MessageDto], description: 'Oldest first' })
  items!: MessageDto[];
  @ApiProperty() hasMore!: boolean;
}

export class SendMessageDto {
  @ApiPropertyOptional({ maxLength: MESSAGE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_MAX)
  body?: string;

  @ApiPropertyOptional({
    description: 'A video from the sender’s collection to attach',
  })
  @IsOptional()
  @IsUUID()
  videoId?: string;
}

export class MarkReadDto {
  @ApiProperty({ description: 'The newest message the reader has seen' })
  @IsUUID()
  messageId!: string;
}

export class ChatUnreadDto {
  @ApiProperty() count!: number;
}
