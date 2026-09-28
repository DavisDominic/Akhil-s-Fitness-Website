-- Optional occupation on trial leads (not in the original PRD form spec; added so Akhil can prepare his pitch
-- for the trial). Never shown publicly — trial leads are never rendered on the site.
ALTER TABLE leads ADD COLUMN occupation TEXT;
