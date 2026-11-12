-- migrate:up
-- IRREVERSIBLE. Drops five tables that nothing in api/src reads or writes,
-- and every row in them: MakeOfferPage, Offer_Status, Res2_Status,
-- Resumepage, Resumepage2. Interview_Status is used and is kept.
-- Needs production row counts before merge.

DROP TABLE IF EXISTS `MakeOfferPage`;
DROP TABLE IF EXISTS `Offer_Status`;
DROP TABLE IF EXISTS `Res2_Status`;
DROP TABLE IF EXISTS `Resumepage`;
DROP TABLE IF EXISTS `Resumepage2`;

-- migrate:down