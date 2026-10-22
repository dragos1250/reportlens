package dev.reportlens.backend.speech;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SpokenTextTest {

    @Test
    void citationMarkersAreNotRead() {
        assertThat(SpokenText.of("Revenue grew 8.0% [P2]. Net debt fell [P1, P3].", 400))
                .isEqualTo("Revenue grew 8.0%. Net debt fell.");
    }

    @Test
    void onlyWholeSentencesUpToTheLimit() {
        String answer = "First sentence here. Second sentence is a bit longer. Third.";
        assertThat(SpokenText.of(answer, 40)).isEqualTo("First sentence here.");
        assertThat(SpokenText.of(answer, 53)).isEqualTo("First sentence here. Second sentence is a bit longer.");
    }

    @Test
    void aFirstSentenceLongerThanTheLimitIsCutAtAWord() {
        assertThat(SpokenText.of("Vodafone reported strong growth across all of its segments", 30))
                .isEqualTo("Vodafone reported strong…");
    }

    @Test
    void textWithoutPunctuationAndEmptyText() {
        assertThat(SpokenText.of("Customers, Simplicity and Growth", 400)).isEqualTo("Customers, Simplicity and Growth");
        assertThat(SpokenText.of("  ", 400)).isEmpty();
        assertThat(SpokenText.of(null, 400)).isEmpty();
    }

    @Test
    void theLanguageIsGuessedWhenTheQuestionUsedAuto() {
        assertThat(SpokenText.language("Veniturile au crescut cu 8%.")).isEqualTo("ro");  // no diacritics needed
        assertThat(SpokenText.language("Datoria netă a scăzut.")).isEqualTo("ro");
        assertThat(SpokenText.language("Revenue grew and the report says so.")).isEqualTo("en");
        assertThat(SpokenText.language("")).isEqualTo("en");
    }

    @Test
    void aRequestedLanguageWinsOverTheGuess() {
        assertThat(SpokenText.languageOf("ro", "Revenue grew.")).isEqualTo("ro");
        assertThat(SpokenText.languageOf(null, "Veniturile au crescut.")).isEqualTo("ro");
        assertThat(SpokenText.languageOf("fr", "Revenue grew.")).isEqualTo("en");
    }
}
