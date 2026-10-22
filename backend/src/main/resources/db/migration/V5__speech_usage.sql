-- Characters sent to the paid text-to-speech service, per UTC day. The global daily and
-- monthly caps are read from here, so they hold across restarts.
CREATE TABLE speech_usage (
    day   date PRIMARY KEY,
    chars integer NOT NULL DEFAULT 0 CHECK (chars >= 0)
);
