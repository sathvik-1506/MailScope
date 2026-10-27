"""
Tests for Mailora document extraction service and /api/extract endpoint.
"""

from __future__ import annotations

import io
import zipfile
import pytest
from pypdf import PdfWriter
import docx

from backend.app import create_app
from backend.services.extractor import (
    process_uploaded_files,
    extract_from_txt,
    extract_from_csv,
    extract_from_pdf,
    extract_from_docx,
    extract_from_eml,
    sanitize_filename,
    ExtractionError,
    UnsupportedFormatError,
    FileSizeExceededError,
)


@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ----------------------------------------------------------------------
# 1. Unit Tests for Parsers
# ----------------------------------------------------------------------

def test_extract_from_txt_finds_emails_and_tracks_lines():
    raw_text = (
        "Hello,\n"
        "Contact support@example.com for help.\n"
        "Also reach out to sales.dept@company.org or press@sub.domain.co.uk.\n"
        "Ignore invalid text like notanemail or @nodomain.\n"
    ).encode("utf-8")

    candidates, warnings = extract_from_txt(raw_text, "notes.txt")
    assert len(candidates) == 3
    assert candidates[0] == ("support@example.com", "Line 2")
    assert candidates[1] == ("sales.dept@company.org", "Line 3")
    assert candidates[2] == ("press@sub.domain.co.uk", "Line 3")
    assert len(warnings) == 0


def test_extract_from_csv_handles_delimiters_and_columns():
    csv_data = (
        "Name,Email,Notes\n"
        "Alice,alice@example.com,Team Lead\n"
        "Bob,bob@example.org,Engineering\n"
        "Carol,carol.smith@service.net,Marketing\n"
    ).encode("utf-8")

    candidates, warnings = extract_from_csv(csv_data, "contacts.csv")
    assert len(candidates) == 3
    assert candidates[0] == ("alice@example.com", "Row 2, Col 2")
    assert candidates[1] == ("bob@example.org", "Row 3, Col 2")
    assert candidates[2] == ("carol.smith@service.net", "Row 4, Col 2")


def test_extract_from_synthetic_pdf():
    # Build a minimal valid PDF in memory using pypdf
    writer = PdfWriter()
    page1 = writer.add_blank_page(width=200, height=200)
    # Note: pypdf blank pages have no text, so test empty page warning
    pdf_bytes = io.BytesIO()
    writer.write(pdf_bytes)
    pdf_bytes.seek(0)

    candidates, warnings = extract_from_pdf(pdf_bytes.getvalue(), "report.pdf")
    # Empty blank page generates scanned image / no text warning
    assert len(candidates) == 0
    assert any("Scanned-image PDFs require OCR" in w for w in warnings)


def test_extract_from_synthetic_docx():
    # Build a real docx document in memory
    doc = docx.Document()
    doc.add_heading("Team Contacts", level=1)
    doc.add_paragraph("Please send invoices to billing@acmecorp.com or finance@acmecorp.com.")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Admin"
    table.cell(0, 1).text = "admin@acmecorp.com"
    table.cell(1, 0).text = "Helpdesk"
    table.cell(1, 1).text = "help@acmecorp.com"

    docx_bytes = io.BytesIO()
    doc.save(docx_bytes)
    docx_bytes.seek(0)

    candidates, warnings = extract_from_docx(docx_bytes.getvalue(), "contacts.docx")
    addrs = [c[0] for c in candidates]
    assert "billing@acmecorp.com" in addrs
    assert "finance@acmecorp.com" in addrs
    assert "admin@acmecorp.com" in addrs
    assert "help@acmecorp.com" in addrs
    assert len(warnings) == 0


def test_extract_from_eml():
    eml_raw = (
        "From: sender@example.com\r\n"
        "To: recipient@example.org, copy@example.net\r\n"
        "Subject: Meeting Invitation\r\n"
        "Content-Type: text/plain; charset=utf-8\r\n"
        "\r\n"
        "Hi team,\r\n"
        "Please reply to coordinator@events.org for RSVPs.\r\n"
    ).encode("utf-8")

    candidates, warnings = extract_from_eml(eml_raw, "invite.eml")
    addrs = [c[0] for c in candidates]
    assert "sender@example.com" in addrs
    assert "recipient@example.org" in addrs
    assert "copy@example.net" in addrs
    assert "coordinator@events.org" in addrs


# ----------------------------------------------------------------------
# 2. Security & Edge Case Tests
# ----------------------------------------------------------------------

def test_legacy_doc_format_rejected_with_clear_message():
    # Legacy OLE binary header
    ole_header = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 100
    file_stream = io.BytesIO(ole_header)

    with pytest.raises(UnsupportedFormatError) as exc:
        process_uploaded_files([(file_stream, "old_doc.doc")])
    assert "legacy binary Word format (.doc)" in exc.value.message


def test_executable_rejected():
    exe_content = b"MZ" + b"\x00" * 200
    file_stream = io.BytesIO(exe_content)

    with pytest.raises(UnsupportedFormatError) as exc:
        process_uploaded_files([(file_stream, "malware.exe")])
    assert "executable" in exc.value.message.lower()


def test_unsupported_archive_rejected():
    zip_data = b"PK\x03\x04" + b"\x00" * 50
    file_stream = io.BytesIO(zip_data)

    with pytest.raises(UnsupportedFormatError) as exc:
        process_uploaded_files([(file_stream, "archive.zip")])
    assert "Unsupported file format" in exc.value.message


def test_empty_file_rejected():
    file_stream = io.BytesIO(b"")
    with pytest.raises(ExtractionError) as exc:
        process_uploaded_files([(file_stream, "empty.txt")])
    assert "empty" in exc.value.message.lower()


def test_path_traversal_sanitized():
    sanitized = sanitize_filename("../../etc/passwd/list.csv")
    assert sanitized == "list.csv"
    assert ".." not in sanitized
    assert "/" not in sanitized
    assert "\\" not in sanitized


def test_deduplication_and_source_references():
    content = (
        "alice@example.com\n"
        "ALICE@example.com\n"  # Case variation of same domain
        "alice@example.com\n"
        "bob@example.com\n"
    ).encode("utf-8")

    stream = io.BytesIO(content)
    result = process_uploaded_files([(stream, "subscribers.txt")])

    assert result["unique_count"] == 2
    assert result["total_detected"] == 4
    assert result["duplicates_removed"] == 2

    # Check that alice candidate tracks occurrences
    alice_cand = next(c for c in result["candidates"] if c["normalized"] == "alice@example.com")
    assert alice_cand["occurrences"] == 3
    assert alice_cand["source_file"] == "subscribers.txt"


# ----------------------------------------------------------------------
# 3. HTTP Integration Tests on /api/extract
# ----------------------------------------------------------------------

def test_api_extract_success(client):
    csv_content = b"Name,Email\nJohn,john@example.com\nJane,jane@example.org\n"
    data = {
        "files": (io.BytesIO(csv_content), "users.csv"),
    }
    response = client.post("/api/extract", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    json_data = response.get_json()

    assert json_data["unique_count"] == 2
    assert json_data["total_detected"] == 2
    assert len(json_data["files"]) == 1
    assert json_data["files"][0]["filename"] == "users.csv"
    addrs = [c["address"] for c in json_data["candidates"]]
    assert "john@example.com" in addrs
    assert "jane@example.org" in addrs


def test_api_extract_no_files_returns_400(client):
    response = client.post("/api/extract", data={}, content_type="multipart/form-data")
    assert response.status_code == 400
    json_data = response.get_json()
    assert json_data["code"] == "NO_FILES_PROVIDED"


def test_api_extract_unsupported_format_returns_400(client):
    data = {
        "files": (io.BytesIO(b"binary data"), "document.xyz"),
    }
    response = client.post("/api/extract", data=data, content_type="multipart/form-data")
    assert response.status_code == 400
    json_data = response.get_json()
    assert json_data["code"] == "UNSUPPORTED_FORMAT"


def test_api_extract_executable_returns_400(client):
    data = {
        "files": (io.BytesIO(b"binary data"), "program.exe"),
    }
    response = client.post("/api/extract", data=data, content_type="multipart/form-data")
    assert response.status_code == 400
    json_data = response.get_json()
    assert json_data["code"] == "EXECUTABLE_NOT_ALLOWED"


def test_api_v1_extract_alias(client):
    txt_content = b"Contact: hello@mailora.io\n"
    data = {
        "files": (io.BytesIO(txt_content), "hello.txt"),
    }
    response = client.post("/api/v1/extract", data=data, content_type="multipart/form-data")
    assert response.status_code == 200
    json_data = response.get_json()
    assert json_data["unique_count"] == 1
    assert json_data["candidates"][0]["address"] == "hello@mailora.io"
