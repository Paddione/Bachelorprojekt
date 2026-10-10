#!/usr/bin/env python3
"""secret-derive.py — deterministic secret derivation (HKDF-SHA256).

Derives secret values from a per-brand master seed so both ends (repo
tooling, JSON generator) compute identical values without storing them.
Rotation happens by bumping the version; stale values heal by re-deriving.

Stdlib-only: works without third-party packages. Schema lookups prefer
PyYAML when importable and fall back to a minimal built-in parser for
the known ``environments/schema.yaml`` shape.

Seed layout: ``environments/.secrets/.seed-<brand>`` (gitignored, 0600),
32 random bytes per brand. The seed never leaves the local machine:
derived values are never written by the exporter.
"""

import argparse
import base64
import binascii
import hashlib
import hmac
import os
import string
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_DIR = os.path.join(REPO_ROOT, "environments")
SCHEMA_PATH = os.path.join(ENV_DIR, "schema.yaml")
SECRETS_DIR = os.path.join(ENV_DIR, ".secrets")

DOMAIN_SEPARATOR = b"derived-secrets-v1"
DEFAULT_LENGTH = 32
DEFAULT_VERSION = 1
DEFAULT_ENCODING = "hex"

ALNUM_ALPHABET = string.ascii_letters + string.digits
ENCODINGS = ("hex", "base64url", "alnum")


def hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    """HKDF-Extract (RFC 5869): PRK from salt and input keying material."""
    return hmac.new(salt, ikm, hashlib.sha256).digest()


def hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    """HKDF-Expand (RFC 5869): ``length`` output bytes for ``info``."""
    if length < 1 or length > 255 * hashlib.sha256().digest_size:
        raise ValueError(f"invalid HKDF output length: {length}")
    output = b""
    block = b""
    counter = 1
    while len(output) < length:
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        output += block
        counter += 1
    return output[:length]


def hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    """Full HKDF (extract + expand) returning ``length`` bytes."""
    return hkdf_expand(hkdf_extract(salt, ikm), info, length)


def _encode(raw: bytes, encoding: str, length: int) -> str:
    if encoding == "hex":
        return binascii.hexlify(raw).decode("ascii")[:length]
    if encoding == "base64url":
        text = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
        return text[:length]
    if encoding == "alnum":
        return "".join(ALNUM_ALPHABET[b % len(ALNUM_ALPHABET)] for b in raw[:length])
    raise ValueError(f"unknown encoding: {encoding} (expected one of {', '.join(ENCODINGS)})")


def _raw_bytes_needed(length: int, encoding: str) -> int:
    if encoding == "hex":
        return (length + 1) // 2
    if encoding == "base64url":
        return ((length + 3) // 4) * 3 + 3
    if encoding == "alnum":
        return length
    raise ValueError(f"unknown encoding: {encoding} (expected one of {', '.join(ENCODINGS)})")


def derive(
    seed: bytes,
    brand: str,
    key: str,
    version: int = DEFAULT_VERSION,
    length: int = DEFAULT_LENGTH,
    encoding: str = DEFAULT_ENCODING,
) -> str:
    """Derive the value for ``key`` of ``brand`` from ``seed``.

    Pure function: identical inputs always yield the identical value.
    ``seed`` is the brand master seed (32 random bytes), ``version`` the
    derivation version from the schema, ``length`` the output length in
    characters, ``encoding`` one of ``hex`` (default), ``base64url``,
    ``alnum``.
    """
    if not seed:
        raise ValueError("seed must not be empty")
    if length < 1:
        raise ValueError(f"invalid length: {length}")
    needed = _raw_bytes_needed(length, encoding)
    info = f"v{version}:{brand}:{key}".encode("utf-8")
    raw = hkdf(DOMAIN_SEPARATOR, bytes(seed), info, needed)
    return _encode(raw, encoding, length)


def _coerce_scalar(text: str):
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ("'", '"'):
        return text[1:-1]
    if text == "true":
        return True
    if text == "false":
        return False
    try:
        return int(text)
    except ValueError:
        return text


def parse_schema_minimal(text: str):
    """Minimal parser for the ``secrets:``/``derivation:`` schema shape.

    Fallback when PyYAML is unavailable. Understands top-level sections,
    ``  - name: KEY`` entries and their ``    key: value`` scalar fields.
    Returns ``(entries, derivation_version)``.
    """
    entries: dict = {}
    derivation_version = DEFAULT_VERSION
    section = None
    current = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not line.startswith((" ", "\t")) and stripped.endswith(":"):
            if current is not None:
                entries[current["name"]] = current
                current = None
            section = stripped[:-1]
            continue
        if section == "derivation" and stripped.startswith("version:"):
            try:
                derivation_version = int(stripped.split(":", 1)[1].strip())
            except ValueError:
                pass
            continue
        if section != "secrets":
            continue
        if stripped.startswith("- name:"):
            if current is not None:
                entries[current["name"]] = current
            current = {"name": stripped.split(":", 1)[1].strip().strip("'\"")}
            continue
        if current is not None and line.startswith("    ") and ":" in stripped:
            field, _, value = stripped.partition(":")
            field = field.strip()
            if field in ("length", "generate", "derived", "derive_version", "required"):
                current[field] = _coerce_scalar(value)
    if current is not None:
        entries[current["name"]] = current
    return entries, derivation_version


def load_schema(path: str = SCHEMA_PATH):
    """Load schema entries; returns ``(entries, derivation_version)``.

    Missing schema file yields empty entries and default version so the
    CLI stays usable outside a full checkout.
    """
    if not os.path.exists(path):
        return {}, DEFAULT_VERSION
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(open(path, encoding="utf-8")) or {}
        entries = {e["name"]: e for e in data.get("secrets", [])}
        version = (data.get("derivation") or {}).get("version", DEFAULT_VERSION)
        return entries, version
    except ImportError:
        with open(path, encoding="utf-8") as f:
            return parse_schema_minimal(f.read())


def is_derivable(entry: dict) -> bool:
    """True unless the entry opts out via ``derived: false``."""
    if entry.get("derived") is False:
        return False
    return bool(entry.get("generate", False))


def read_seed(seed_file: str) -> bytes:
    """Read raw seed bytes; raises ``OSError``/``ValueError`` on failure."""
    with open(seed_file, "rb") as f:
        seed = f.read()
    if not seed:
        raise ValueError(f"seed file is empty: {seed_file}")
    return seed


def default_seed_file(brand: str) -> str:
    return os.path.join(SECRETS_DIR, f".seed-{brand}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Derive secrets deterministically (HKDF-SHA256) from a brand seed."
    )
    parser.add_argument("--brand", required=True, help="Brand/tenant id, e.g. mentolder")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--key", help="Derive a single KEY to stdout")
    target.add_argument(
        "--all",
        action="store_true",
        help="Derive all derivable keys as .secrets-compatible mapping",
    )
    parser.add_argument("--seed-file", default=None, help="Seed file (default: .seed-<brand>)")
    parser.add_argument(
        "--format",
        default=DEFAULT_ENCODING,
        choices=list(ENCODINGS),
        help="Output encoding (default: hex)",
    )
    parser.add_argument("--length", type=int, default=None, help="Override schema length")
    parser.add_argument("--version", type=int, default=None, help="Override schema version")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    seed_file = args.seed_file or default_seed_file(args.brand)
    try:
        seed = read_seed(seed_file)
    except (OSError, ValueError) as exc:
        print(f"error: cannot read seed file '{seed_file}': {exc}", file=sys.stderr)
        return 2

    entries, schema_version = load_schema()

    if args.key:
        entry = entries.get(args.key, {})
        if entry.get("derived") is False:
            print(f"error: key '{args.key}' is marked derived:false (must-store)", file=sys.stderr)
            return 2
        version = args.version or entry.get("derive_version") or schema_version
        length = args.length or entry.get("length") or DEFAULT_LENGTH
        try:
            print(derive(seed, args.brand, args.key, version, length, args.format))
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2
        return 0

    names = sorted(n for n, e in entries.items() if is_derivable(e))
    if not names:
        print("error: no derivable keys found in schema", file=sys.stderr)
        return 2
    try:
        for name in names:
            entry = entries[name]
            version = args.version or entry.get("derive_version") or schema_version
            length = args.length or entry.get("length") or DEFAULT_LENGTH
            value = derive(seed, args.brand, name, version, length, args.format)
            print(f'{name}: "{value}"')
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
