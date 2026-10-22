-- Assistant messages keep every passage the answer was checked against (not only the cited
-- ones), with its text: the UI lists them as sources, highlights them in the PDF and shows
-- the checked pages when nothing was found. Rows from before this migration have NULL.
ALTER TABLE messages ADD COLUMN passages jsonb;  -- [{marker, docId, page, chunkId, text, cited}]
