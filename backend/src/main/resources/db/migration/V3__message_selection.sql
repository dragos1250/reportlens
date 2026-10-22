-- Select & explain: the text the reader selected in the PDF and its page. Set on the
-- question and on the answer of a selection turn; NULL for ordinary questions.
ALTER TABLE messages ADD COLUMN selection_page integer CHECK (selection_page >= 1);
ALTER TABLE messages ADD COLUMN selection_text text;
