from storage.setup import State, commands, steps_for


def state(**overrides):
    ready = dict(has_pdf=True, has_chunks=True, vectors_up_to_date=True, loaded_chunks_sha="abc", chunks_sha="abc")
    return State(**{**ready, **overrides})


def test_a_ready_report_needs_nothing():
    assert steps_for(state()) == []


def test_a_fresh_instance_runs_every_step_in_order():
    fresh = State(has_pdf=False, has_chunks=False, vectors_up_to_date=False, loaded_chunks_sha=None, chunks_sha=None)
    assert steps_for(fresh) == ["download", "ingest", "embed", "load"]


def test_a_new_download_redoes_everything_after_it():
    assert steps_for(state(has_pdf=False)) == ["download", "ingest", "embed", "load"]


def test_stale_vectors_are_rebuilt_without_reloading_unchanged_chunks():
    assert steps_for(state(vectors_up_to_date=False)) == ["embed"]


def test_chunks_changed_since_the_load_are_loaded_again():
    assert steps_for(state(loaded_chunks_sha="old")) == ["load"]


def test_a_report_missing_from_the_database_is_loaded():
    assert steps_for(state(loaded_chunks_sha=None)) == ["load"]


def test_each_step_is_the_documented_cli():
    assert commands("d", "ingest")[1:] == ["-m", "ingestion.ingest", commands("d", "ingest")[3], "--doc-id", "d"]
    assert commands("d", "ingest")[3].endswith("d.pdf")
    assert commands("d", "load")[1:] == ["-m", "storage.load", "--doc-id", "d"]
    assert commands("d", "download")[-1] == "d"
