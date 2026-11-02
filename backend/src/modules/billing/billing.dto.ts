import { ApiProperty } from '@nestjs/swagger';

export class BillingPriceDto {
  @ApiProperty({ example: 'pri_01h…' }) id!: string;
  @ApiProperty({ enum: ['month', 'year'] }) interval!: 'month' | 'year';
  @ApiProperty({
    description: 'In the lowest unit of the currency (cents), VAT included',
  })
  amount!: number;
  @ApiProperty({ example: 'EUR' }) currency!: string;
}

/** What the Pro page needs to show prices and open Paddle's checkout (cloud only). */
export class BillingConfigDto {
  @ApiProperty({ enum: ['sandbox', 'production'] })
  environment!: 'sandbox' | 'production';
  @ApiProperty({ description: 'Paddle.js client-side token (public)' })
  clientToken!: string;
  @ApiProperty({ type: BillingPriceDto }) month!: BillingPriceDto;
  @ApiProperty({ type: BillingPriceDto }) year!: BillingPriceDto;
}

/** Signed-in links to Paddle's customer portal; they expire, open them right away. */
export class BillingPortalDto {
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: String }) cancelUrl!: string | null;
  @ApiProperty({ nullable: true, type: String })
  updatePaymentUrl!: string | null;
}
