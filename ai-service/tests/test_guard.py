from generation.guard import DEFAULT_MIN_SCORE, is_relevant, refusal_message


def test_default_is_near_the_bottom_of_the_e5_score_range():
    # multilingual-e5 cosine scores fall roughly between 0.7 and 1.0
    assert 0.7 <= DEFAULT_MIN_SCORE < 0.8


def test_score_at_or_above_threshold_is_relevant():
    assert is_relevant(0.75, 0.75)
    assert is_relevant(0.9, 0.75)
    assert not is_relevant(0.749, 0.75)


def test_refusal_message_follows_question_language_with_english_fallback():
    assert refusal_message("ro").startswith("Raportul nu pare")
    assert refusal_message("en").startswith("The report does not appear")
    assert refusal_message("de") == refusal_message("en")
