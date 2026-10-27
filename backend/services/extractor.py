"""
Mailora – Secure Document Text & Email Address Extraction Service.

Extracts candidate email addresses from user-uploaded documents (.txt, .csv, .pdf, .docx, .eml)
with strict security bounds, signature verification, safe in-memory/tempfile processing,
and CWE-safe parsing.
"""

from __future__ import annotations

import csv
import email
import email.policy
import io
import logging
import os
import re
import zipfile
from dataclasses import dataclass, field
from typing import BinaryIO

import pypdf
import docx

logger = logging.getLogger("mailora.extractor")

# Security Constraints
MAX_FILE_BYTES = int(os.environ.get("MAX_UPLOAD_FILE_BYTES", 5 * 1024 * 1024))  # 5 MB per file
MAX_FILES_COUNT = 5  # Max 5 files per extraction batch
MAX_PDF_PAGES = 50   # Max pages to prevent PDF decompression / CPU DoS
MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024  # 25 MB uncompressed limit (anti-zip bomb)
MAX_TOTAL_CANDIDATES = 1000  # Cap on extracted candidate addresses

SUPPORTED_EXTENSIONS = {".txt", ".csv", ".pdf", ".docx", ".eml"}

# Regex for candidate email addresses in text
# Captures standard RFC-compliant local@domain patterns
EMAIL_CANDIDATE_REGEX = re.compile(
    r"[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+",
    re.IGNORECASE,
)

# Trailing characters that are not part of an email address when found in prose
TRAILING_PUNCTUATION = ".,;:!?)>]'\""


class ExtractionError(Exception):
    """Base exception for document extraction failures."""

    def __init__(self, message: str, code: str = "EXTRACTION_ERROR", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class UnsupportedFormatError(ExtractionError):
    def __init__(self, message: str, code: str = "UNSUPPORTED_FORMAT"):
        super().__init__(message, code=code, status_code=400)


class FileSizeExceededError(ExtractionError):
    def __init__(self, message: str, code: str = "FILE_TOO_LARGE"):
        super().__init__(message, code=code, status_code=413)


@dataclass
class SourceReference:
    filename: str
    location: str


@dataclass
class ExtractedCandidate:
    address: str
    normalized: str
    source_file: str
    location: str
    all_sources: list[dict[str, str]] = field(default_factory=list)
    occurrences: int = 1

    def to_dict(self) -> dict:
        return {
            "address": self.address,
            "normalized": self.normalized,
            "source_file": self.source_file,
            "location": self.location,
            "all_sources": self.all_sources,
            "occurrences": self.occurrences,
        }


@dataclass
class ProcessedFileReport:
    filename: str
    size_bytes: int
    status: str  # "success" | "warning" | "error"
    candidates_found: int
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "status": self.status,
            "candidates_found": self.candidates_found,
            "warnings": self.warnings,
        }


def sanitize_filename(raw_filename: str) -> str:
    """Safely extracts the basename of a filename, removing path traversal sequences."""
    clean = os.path.basename(raw_filename).replace("\\", "/").split("/")[-1]
    # Remove control characters and limit length
    clean = re.sub(r"[\x00-\x1f\x7f]", "", clean).strip()
    return clean[:100] if clean else "document"


def clean_candidate(raw: str) -> str:
    """Trims trailing prose punctuation and surrounding whitespace."""
    candidate = raw.strip()
    while candidate and candidate[-1] in TRAILING_PUNCTUATION:
        candidate = candidate[:-1]
    while candidate and candidate[0] in "<(\"':":
        candidate = candidate[1:]
    return candidate.strip()


def normalize_address(candidate: str) -> str:
    """Conservatively normalizes email address to lowercase for deduplication."""
    return candidate.strip().lower()


def decode_text_bytes(data: bytes) -> str:
    """Attempts decoding bytes using UTF-8, then Latin-1/Windows-1252 fallbacks."""
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def validate_file_signature(content: bytes, ext: str, filename: str) -> None:
    """Validates magic bytes / file signatures to prevent disguised executables or archives."""
    if len(content) == 0:
        raise ExtractionError(f"File '{filename}' is empty (0 bytes).", code="EMPTY_FILE")

    # Detect legacy .doc (OLE Compound File binary format)
    if ext == ".doc" or content.startswith(b"\xd0\xcf\x11\xe0"):
        raise UnsupportedFormatError(
            f"File '{filename}' is in legacy binary Word format (.doc). "
            "Please convert or save the file as modern Word (.docx) or plain text (.txt) before uploading.",
            code="LEGACY_DOC_NOT_SUPPORTED",
        )

    # Executable / DLL check
    if content.startswith(b"MZ"):
        raise UnsupportedFormatError(
            f"File '{filename}' appears to be an executable binary and was rejected for security.",
            code="EXECUTABLE_NOT_ALLOWED",
        )

    # Shell script / batch check
    if content.startswith(b"#!") or content.lower().startswith(b"@echo off"):
        raise UnsupportedFormatError(
            f"File '{filename}' contains script headers and was rejected for security.",
            code="SCRIPT_NOT_ALLOWED",
        )

    # PDF signature
    if ext == ".pdf":
        # PDFs must start with %PDF- (or within the first 1024 bytes per spec)
        if not (content.startswith(b"%PDF-") or b"%PDF-" in content[:1024]):
            raise ExtractionError(
                f"File '{filename}' does not have a valid PDF header signature.",
                code="INVALID_PDF_SIGNATURE",
            )

    # DOCX signature (ZIP archive)
    elif ext == ".docx":
        if not content.startswith(b"PK\x03\x04"):
            raise ExtractionError(
                f"File '{filename}' does not have a valid Word .docx (ZIP) header signature.",
                code="INVALID_DOCX_SIGNATURE",
            )


# ----------------------------------------------------------------------
# Parsers for each supported format
# ----------------------------------------------------------------------

def extract_from_txt(content: bytes, filename: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Extracts candidate emails from plain text files."""
    text = decode_text_bytes(content)
    candidates: list[tuple[str, str]] = []

    for line_idx, line in enumerate(text.splitlines(), start=1):
        for match in EMAIL_CANDIDATE_REGEX.finditer(line):
            cleaned = clean_candidate(match.group(0))
            if cleaned and "@" in cleaned:
                candidates.append((cleaned, f"Line {line_idx}"))

    return candidates, []


def extract_from_csv(content: bytes, filename: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Extracts candidate emails from CSV and spreadsheet export files."""
    text = decode_text_bytes(content)
    candidates: list[tuple[str, str]] = []
    warnings: list[str] = []

    # Attempt dialect detection
    sample = text[:4096]
    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
        delimiter = dialect.delimiter
    except Exception:
        if "\t" in sample and "," not in sample:
            delimiter = "\t"
        elif ";" in sample and "," not in sample:
            delimiter = ";"

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    for row_idx, row in enumerate(reader, start=1):
        for col_idx, cell in enumerate(row, start=1):
            if not cell:
                continue
            for match in EMAIL_CANDIDATE_REGEX.finditer(cell):
                cleaned = clean_candidate(match.group(0))
                if cleaned and "@" in cleaned:
                    candidates.append((cleaned, f"Row {row_idx}, Col {col_idx}"))

    return candidates, warnings


def extract_from_pdf(content: bytes, filename: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Extracts text and candidate emails from extractable PDFs."""
    candidates: list[tuple[str, str]] = []
    warnings: list[str] = []

    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
    except Exception as exc:
        raise ExtractionError(
            f"Failed to parse PDF document '{filename}': {str(exc)}",
            code="CORRUPT_PDF",
        )

    if reader.is_encrypted:
        raise ExtractionError(
            f"PDF document '{filename}' is password-protected or encrypted.",
            code="PDF_ENCRYPTED",
        )

    total_pages = len(reader.pages)
    if total_pages == 0:
        return [], ["PDF contains no pages."]

    if total_pages > MAX_PDF_PAGES:
        warnings.append(
            f"PDF contains {total_pages} pages; processed the first {MAX_PDF_PAGES} pages to maintain responsiveness."
        )

    pages_to_process = min(total_pages, MAX_PDF_PAGES)
    total_text_len = 0

    for page_idx in range(pages_to_process):
        try:
            page = reader.pages[page_idx]
            page_text = page.extract_text() or ""
            total_text_len += len(page_text.strip())

            for match in EMAIL_CANDIDATE_REGEX.finditer(page_text):
                cleaned = clean_candidate(match.group(0))
                if cleaned and "@" in cleaned:
                    candidates.append((cleaned, f"Page {page_idx + 1}"))
        except Exception as exc:
            warnings.append(f"Could not extract text on page {page_idx + 1}: {str(exc)}")

    # Check for scanned image PDF (no OCR)
    if total_text_len == 0 and total_pages > 0:
        warnings.append(
            f"No extractable text was found in '{filename}'. Scanned-image PDFs require OCR conversion to searchable text first."
        )

    return candidates, warnings


def extract_from_docx(content: bytes, filename: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Extracts text and candidate emails from Word .docx documents."""
    candidates: list[tuple[str, str]] = []
    warnings: list[str] = []

    # 1. Zip bomb check
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            uncompressed_size = sum(info.file_size for info in z.infolist())
            if uncompressed_size > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise FileSizeExceededError(
                    f"Word document '{filename}' exceeds uncompressed expansion limit (possible decompression bomb).",
                    code="DECOMPRESSION_BOMB_DETECTED",
                )
    except zipfile.BadZipFile:
        raise ExtractionError(f"Word document '{filename}' is corrupted or not a valid docx file.", code="CORRUPT_DOCX")

    # 2. Parse document with python-docx
    try:
        doc = docx.Document(io.BytesIO(content))
    except Exception as exc:
        raise ExtractionError(f"Failed to read Word document '{filename}': {str(exc)}", code="CORRUPT_DOCX")

    # Paragraphs
    for p_idx, p in enumerate(doc.paragraphs, start=1):
        if not p.text:
            continue
        for match in EMAIL_CANDIDATE_REGEX.finditer(p.text):
            cleaned = clean_candidate(match.group(0))
            if cleaned and "@" in cleaned:
                candidates.append((cleaned, f"Paragraph {p_idx}"))

    # Tables
    for t_idx, table in enumerate(doc.tables, start=1):
        for r_idx, row in enumerate(table.rows, start=1):
            for cell in row.cells:
                if not cell.text:
                    continue
                for match in EMAIL_CANDIDATE_REGEX.finditer(cell.text):
                    cleaned = clean_candidate(match.group(0))
                    if cleaned and "@" in cleaned:
                        candidates.append((cleaned, f"Table {t_idx}, Row {r_idx}"))

    return candidates, warnings


def extract_from_eml(content: bytes, filename: str) -> tuple[list[tuple[str, str]], list[str]]:
    """Extracts candidate emails from MIME / RFC 822 .eml messages."""
    candidates: list[tuple[str, str]] = []
    warnings: list[str] = []

    try:
        msg = email.message_from_bytes(content, policy=email.policy.default)
    except Exception as exc:
        raise ExtractionError(f"Failed to parse email message '{filename}': {str(exc)}", code="CORRUPT_EML")

    # 1. Header fields
    target_headers = ["from", "to", "cc", "bcc", "reply-to", "sender"]
    for header in target_headers:
        val = msg.get(header)
        if val:
            for match in EMAIL_CANDIDATE_REGEX.finditer(str(val)):
                cleaned = clean_candidate(match.group(0))
                if cleaned and "@" in cleaned:
                    candidates.append((cleaned, f"Header: {header.title()}"))

    # 2. Body parts
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ("text/plain", "text/html"):
                try:
                    payload = part.get_content()
                    if isinstance(payload, str):
                        for match in EMAIL_CANDIDATE_REGEX.finditer(payload):
                            cleaned = clean_candidate(match.group(0))
                            if cleaned and "@" in cleaned:
                                candidates.append((cleaned, "Message Body"))
                except Exception:
                    pass
    else:
        try:
            payload = msg.get_content()
            if isinstance(payload, str):
                for match in EMAIL_CANDIDATE_REGEX.finditer(payload):
                    cleaned = clean_candidate(match.group(0))
                    if cleaned and "@" in cleaned:
                        candidates.append((cleaned, "Message Body"))
        except Exception:
            pass

    return candidates, warnings


# ----------------------------------------------------------------------
# Central Multi-File Orchestrator
# ----------------------------------------------------------------------

def extract_from_file_stream(
    file_stream: BinaryIO,
    filename: str,
) -> tuple[list[tuple[str, str]], list[str]]:
    """Extracts candidate emails and warnings from a single file stream."""
    safe_name = sanitize_filename(filename)
    _, ext = os.path.splitext(safe_name.lower())

    EXECUTABLE_EXTS = {".exe", ".dll", ".so", ".dylib", ".bin", ".com", ".bat", ".cmd", ".sh", ".msi", ".jar", ".vbs"}
    if ext in EXECUTABLE_EXTS:
        raise UnsupportedFormatError(
            f"File '{safe_name}' is an executable or script and cannot be uploaded for security reasons.",
            code="EXECUTABLE_NOT_ALLOWED",
        )

    if ext not in SUPPORTED_EXTENSIONS and ext != ".doc":
        raise UnsupportedFormatError(
            f"Unsupported file format '{ext}'. Supported formats: .txt, .csv, .pdf, .docx, .eml.",
            code="UNSUPPORTED_FORMAT",
        )

    # Read bounded content into memory
    content = file_stream.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise FileSizeExceededError(
            f"File '{safe_name}' exceeds maximum permitted size of {MAX_FILE_BYTES // (1024 * 1024)} MB.",
            code="FILE_TOO_LARGE",
        )

    # Validate signature / magic bytes
    validate_file_signature(content, ext, safe_name)

    # Dispatch to appropriate parser
    if ext == ".txt":
        return extract_from_txt(content, safe_name)
    elif ext == ".csv":
        return extract_from_csv(content, safe_name)
    elif ext == ".pdf":
        return extract_from_pdf(content, safe_name)
    elif ext == ".docx":
        return extract_from_docx(content, safe_name)
    elif ext == ".eml":
        return extract_from_eml(content, safe_name)

    return [], []


def process_uploaded_files(
    files: list[tuple[BinaryIO, str]],
) -> dict:
    """Processes a batch of uploaded files and returns deduplicated candidate emails.

    Args:
        files: List of (file_stream, filename) tuples.

    Returns:
        Structured extraction summary dictionary.
    """
    if not files:
        raise ExtractionError("No files provided for extraction.", code="NO_FILES_PROVIDED")

    if len(files) > MAX_FILES_COUNT:
        raise ExtractionError(
            f"Number of files ({len(files)}) exceeds maximum limit of {MAX_FILES_COUNT} files per upload.",
            code="TOO_MANY_FILES",
        )

    aggregated_candidates: list[tuple[str, str, str]] = []  # (address, location, filename)
    file_reports: list[ProcessedFileReport] = []
    global_warnings: list[str] = []
    first_exc: ExtractionError | None = None

    for file_stream, raw_name in files:
        safe_name = sanitize_filename(raw_name)
        size_bytes = 0
        file_warnings: list[str] = []
        candidates_found = 0

        try:
            raw_candidates, file_warnings = extract_from_file_stream(file_stream, safe_name)
            candidates_found = len(raw_candidates)

            for addr, loc in raw_candidates:
                aggregated_candidates.append((addr, loc, safe_name))

            file_reports.append(
                ProcessedFileReport(
                    filename=safe_name,
                    size_bytes=size_bytes,
                    status="warning" if file_warnings else "success",
                    candidates_found=candidates_found,
                    warnings=file_warnings,
                )
            )
        except ExtractionError as exc:
            if first_exc is None:
                first_exc = exc
            # Record individual file error and continue processing other files if present
            file_reports.append(
                ProcessedFileReport(
                    filename=safe_name,
                    size_bytes=size_bytes,
                    status="error",
                    candidates_found=0,
                    warnings=[exc.message],
                )
            )
            global_warnings.append(f"{safe_name}: {exc.message}")

    # If all files failed, re-raise the first ExtractionError with its specific code
    if all(r.status == "error" for r in file_reports):
        if first_exc is not None:
            raise first_exc
        raise ExtractionError("All uploaded files failed extraction.", code="ALL_FILES_FAILED")

    # Deduplicate candidates while preserving source references
    dedup_map: dict[str, ExtractedCandidate] = {}
    for addr, loc, filename in aggregated_candidates:
        norm = normalize_address(addr)
        if norm not in dedup_map:
            dedup_map[norm] = ExtractedCandidate(
                address=addr,
                normalized=norm,
                source_file=filename,
                location=loc,
                all_sources=[{"file": filename, "location": loc}],
                occurrences=1,
            )
        else:
            existing = dedup_map[norm]
            existing.occurrences += 1
            if len(existing.all_sources) < 10:  # Cap reference list to avoid bloat
                existing.all_sources.append({"file": filename, "location": loc})

    unique_candidates = list(dedup_map.values())[:MAX_TOTAL_CANDIDATES]
    total_detected = len(aggregated_candidates)
    unique_count = len(unique_candidates)
    duplicates_removed = max(0, total_detected - unique_count)

    logger.info(
        f"Extraction completed: {unique_count} unique candidates found across {len(files)} files "
        f"({duplicates_removed} duplicates removed)"
    )

    return {
        "candidates": [c.to_dict() for c in unique_candidates],
        "unique_count": unique_count,
        "total_detected": total_detected,
        "duplicates_removed": duplicates_removed,
        "files": [r.to_dict() for r in file_reports],
        "warnings": global_warnings,
    }
