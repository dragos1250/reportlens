-- Compare two reports: a conversation can have a second document, and a selection
-- remembers which of the two documents it was made in (null = the conversation's doc_id).
ALTER TABLE conversations ADD COLUMN compare_doc_id text CHECK (compare_doc_id <> doc_id);
ALTER TABLE messages ADD COLUMN selection_doc_id text;
