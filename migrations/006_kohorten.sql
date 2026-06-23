-- Plan 7: Klassen als stabile Kohorten (Zug + Einschulungsjahr)
-- Eine Klasse ist nicht mehr ein wanderndes Label, sondern eine stabile Gruppe,
-- definiert durch Zug (track) + Einschulungsjahr (start_year). Das Stufen-Label
-- ("2m") wird aus dem aktuellen Schuljahr berechnet.
-- label bleibt als Fallback/Anzeige für Legacy-Klassen (start_year null).
alter table class_options add column if not exists track      text not null default '';
alter table class_options add column if not exists start_year int;   -- Einschulungsjahr; null = legacy
