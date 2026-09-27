from scripts.check_secrets import suspicious


def test_empty_key_lines_are_not_secrets():
    assert not suspicious(b"OPENAI_API_KEY=\nANTHROPIC_API_KEY=\nGOOGLE_API_KEY=\n")


def test_populated_assignment_is_flagged_without_printing_value():
    assert suspicious(b"OPENAI_API_KEY=" + b"x" * 30)
