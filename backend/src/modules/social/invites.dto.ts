import { ApiProperty } from '@nestjs/swagger';

/** My invitation link. */
export class InviteDto {
  @ApiProperty({ description: 'The link opens at /invite/<code>' })
  code!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() maxUses!: number;
  @ApiProperty() uses!: number;
}

export class InviterDto {
  @ApiProperty() username!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({
    description: 'They hid their page: show the name without a link',
  })
  pageHidden!: boolean;
}

/** What the person opening a link sees. */
export class InvitePreviewDto {
  @ApiProperty({ type: InviterDto }) inviter!: InviterDto;
  @ApiProperty({
    enum: ['valid', 'expired', 'usedUp'],
    enumName: 'InviteState',
    description: 'A link replaced by a newer one counts as expired',
  })
  state!: 'valid' | 'expired' | 'usedUp';
}

export class InviteAcceptDto {
  @ApiProperty({
    enum: ['friends', 'pending'],
    enumName: 'InviteOutcome',
    description:
      'friends: done; pending: the friendship comes once the email is confirmed',
  })
  outcome!: 'friends' | 'pending';
  @ApiProperty({ type: InviterDto }) inviter!: InviterDto;
}
