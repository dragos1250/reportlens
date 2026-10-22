package dev.reportlens.backend.speech;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * What is read aloud from an answer: its first whole sentences, without the [P#] citation
 * markers (the citations stay on screen), up to a character limit. Plain text rules, no
 * LLM call. Also guesses the answer's language when the question was sent with "Auto".
 */
public final class SpokenText {

    private static final Pattern MARKERS = Pattern.compile("\\s*\\[\\s*P\\d+(?:\\s*,\\s*P\\d+)*\\s*]");
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?…])\\s+");
    private static final Pattern ROMANIAN_LETTERS = Pattern.compile("[ăâîșşțţĂÂÎȘŞȚŢ]");
    private static final Set<String> ROMANIAN_WORDS = Set.of(
            "și", "si", "este", "sunt", "în", "din", "pentru", "care", "cu", "la", "nu", "pe", "au", "fost", "raportul");
    private static final Set<String> ENGLISH_WORDS = Set.of(
            "the", "and", "is", "are", "of", "to", "in", "for", "was", "were", "with", "not", "report", "that");

    private SpokenText() {
    }

    public static String of(String content, int maxChars) {
        if (content == null) {
            return "";
        }
        String text = MARKERS.matcher(content).replaceAll("").replaceAll("\\s+", " ").strip();
        StringBuilder spoken = new StringBuilder();
        for (String sentence : SENTENCE_END.split(text)) {
            int length = spoken.isEmpty() ? sentence.length() : spoken.length() + 1 + sentence.length();
            if (length > maxChars) {
                break;
            }
            if (!spoken.isEmpty()) {
                spoken.append(' ');
            }
            spoken.append(sentence);
        }
        if (spoken.isEmpty() && !text.isEmpty()) {
            // The first sentence alone is too long: cut it at a word, and say that it goes on.
            int cut = text.lastIndexOf(' ', maxChars - 1);
            spoken.append(text, 0, cut > 0 ? cut : maxChars - 1).append('…');
        }
        return spoken.toString();
    }

    /**
     * "ro" or "en", for an answer whose language was not given (the "Auto" setting): Romanian
     * letters decide at once, otherwise the more frequent common words.
     */
    public static String language(String text) {
        if (text == null || text.isBlank()) {
            return "en";
        }
        if (ROMANIAN_LETTERS.matcher(text).find()) {
            return "ro";
        }
        int romanian = 0;
        int english = 0;
        for (String word : text.toLowerCase(Locale.ROOT).split("[^\\p{L}]+")) {
            if (ROMANIAN_WORDS.contains(word)) {
                romanian++;
            }
            if (ENGLISH_WORDS.contains(word)) {
                english++;
            }
        }
        return romanian > english ? "ro" : "en";
    }

    /** The language an answer is read in: the one the question asked for, else the guessed one. */
    public static String languageOf(String requestedLang, String spokenText) {
        return "ro".equals(requestedLang) || "en".equals(requestedLang) ? requestedLang : language(spokenText);
    }
}
