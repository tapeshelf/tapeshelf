-- The Free plan is cut: videos up to 500 MiB, 5 GiB on the shelf, deleted videos kept 7 days; on Pro
-- they are kept 30 days. The defaults change in code; a stored "tiers" setting still holding
-- the old number takes the new one. A number an admin set to something else stays as it is.
UPDATE "SiteSetting"
SET value = jsonb_set(value::jsonb, '{BASIC,maxFileBytes}', '524288000')
WHERE key = 'tiers' AND (value::jsonb #>> '{BASIC,maxFileBytes}') = '1073741824';

UPDATE "SiteSetting"
SET value = jsonb_set(value::jsonb, '{BASIC,storageQuotaBytes}', '5368709120')
WHERE key = 'tiers' AND (value::jsonb #>> '{BASIC,storageQuotaBytes}') = '21474836480';

UPDATE "SiteSetting"
SET value = jsonb_set(value::jsonb, '{BASIC,trashRetentionDays}', '7')
WHERE key = 'tiers' AND (value::jsonb #>> '{BASIC,trashRetentionDays}') = '30';

UPDATE "SiteSetting"
SET value = jsonb_set(value::jsonb, '{PREMIUM,trashRetentionDays}', '30')
WHERE key = 'tiers' AND (value::jsonb #>> '{PREMIUM,trashRetentionDays}') = '90';
