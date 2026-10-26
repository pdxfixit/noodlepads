#!/usr/bin/env python3
"""Where this Mac keeps Noodle Pads' own things, outside the repo (the repo is
public, so none of them belong in it):

  ~/.config/noodlepads/cloud.json   the Cloudflare account and D1 database ids
                                    ($NOODLEPADS_CONFIG), and `checksKey`, the
                                    deploy checks' proof (the GitHub secret
                                    CHECKS_KEY's value) for `just deploy` here;
                                    tools/cloud.example.json is the template
  ~/.local/state/noodlepads/        the last marked problem-report digest
                                    (logs-digest.json); an older
                                    ~/.local/state/noodle-pads is moved here
                                    the first time it is asked for. Reports and
                                    metrics are read from the telemetry runner's
                                    mirror, not from here (Ben, 2026-10-16)
  Keychain `noodlepads-logs`        a read-only Cloudflare token, for a harvest
                                    run by hand (site/harvest.conf keychain=); an
                                    item under the older `noodle-pads-logs` still
                                    works, with a hint to rename it

Stdlib only, Python 3.8+.
"""
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

EXAMPLE = Path(__file__).resolve().parent / "cloud.example.json"
KEYCHAIN = "noodlepads-logs"
OLD_KEYCHAIN = "noodle-pads-logs"
FIELDS = ("account_id", "database_id")


class ConfigError(Exception):
    """The cloud config is missing or not filled in; the message says how to fix it."""


def config_path():
    return Path(os.environ.get("NOODLEPADS_CONFIG") or "~/.config/noodlepads/cloud.json").expanduser()


def how_to_make(path):
    return (f"mkdir -p {path.parent} && cp tools/cloud.example.json {path}, then fill in the ids "
            "(docs/deploy-cloudflare.md, Problem reports)")


def load(path=None):
    """The cloud config: account_id, database_id and keychain_service (default noodlepads-logs)."""
    path = Path(path or config_path())
    try:
        cfg = json.loads(path.read_text())
    except FileNotFoundError:
        raise ConfigError(f"no cloud config at {path}: {how_to_make(path)}")
    except ValueError as e:
        raise ConfigError(f"{path} is not valid JSON: {e}")
    for field in FIELDS:
        value = str(cfg.get(field) or "")
        if not value or value.startswith("<"):
            raise ConfigError(f"{path}: fill in {field} (docs/deploy-cloudflare.md, Problem reports)")
    cfg.setdefault("keychain_service", KEYCHAIN)
    return cfg


def state_dir(home=None):
    """~/.local/state/noodlepads, moving the older noodle-pads folder there once."""
    base = Path(home or Path.home()) / ".local/state"
    new, old = base / "noodlepads", base / "noodle-pads"
    if old.is_dir() and not new.exists():
        old.rename(new)
        print(f"📦 moved {old} to {new}", file=sys.stderr)
    return new


def _find(service):
    p = subprocess.run(["security", "find-generic-password", "-s", service, "-w"],
                       capture_output=True, text=True)
    token = p.stdout.strip()
    return token if p.returncode == 0 and token else None


def keychain_token(service=KEYCHAIN, find=_find, err=sys.stderr):
    """The token in the Keychain under `service`. The older item name still
    works for the default service, with a one-line hint to rename it."""
    token = find(service)
    if token:
        return token
    if service == KEYCHAIN:
        token = find(OLD_KEYCHAIN)
        if token:
            print(f"💡 the logs token is under the old Keychain name {OLD_KEYCHAIN}; rename it once:\n"
                  f"   security add-generic-password -s {KEYCHAIN} -a cloudflare -w "
                  f"\"$(security find-generic-password -s {OLD_KEYCHAIN} -w)\" "
                  f"&& security delete-generic-password -s {OLD_KEYCHAIN}", file=err)
            return token
    raise ConfigError(f"no Cloudflare token in the Keychain under service {service!r} "
                      f"(security add-generic-password -s {service} -a cloudflare -w)")


def exports(cfg, environ=None):
    """Shell lines that give flarepress the ids site/wrangler.toml names as
    ${NAME} (D1_DATABASE_ID) and the account. A value already in the
    environment (a GitHub secret) wins, so nothing is printed for it."""
    environ = os.environ if environ is None else environ
    lines = []
    for name, field in (("D1_DATABASE_ID", "database_id"), ("CLOUDFLARE_ACCOUNT_ID", "account_id")):
        if not environ.get(name):
            lines.append(f"export {name}={shlex.quote(str(cfg[field]))}")
    return "\n".join(lines)


def checks_export(cfg, environ=None, path=None):
    """The shell line that gives the deploy checks their proof, CHECKS_KEY
    (worker/cloud.js provenCheck), from cloud.json's `checksKey`, trimmed. A
    value already in the environment wins (exported again, trimmed, as
    deploy.yml and look-cloud.mjs trim it). None in either is a ConfigError saying how to add it: once the Worker holds the
    secret, checks sent without it are refused (400 id), so `just deploy`
    stops before the upload instead of going red after it."""
    environ = os.environ if environ is None else environ
    value = environ.get("CHECKS_KEY", "").strip() or str(cfg.get("checksKey") or "").strip()
    if not value or value.startswith("<"):
        where = path or config_path()
        raise ConfigError(
            f"no checksKey in {where}: the live checks after the upload would be refused. "
            f"Add \"checksKey\": \"<the GitHub secret CHECKS_KEY's value>\" to it (a new value: "
            "`openssl rand -hex 24`, then set the GitHub secret to the same; this deploy puts it "
            "into the Worker), or export CHECKS_KEY first (docs/deploy-cloudflare.md, Ben's fallback)")
    return f"export CHECKS_KEY={shlex.quote(value)}"


if __name__ == "__main__":
    # `python3 tools/cloud_config.py`: one line for just doctor; exit 1 when missing.
    # `--exports`: the ids as shell exports, for the recipes that run wrangler.
    # `--checks-key`: CHECKS_KEY as a shell export, for `just deploy`; exit 1 when missing.
    quiet = sys.argv[1:] in (["--exports"], ["--checks-key"])
    try:
        if sys.argv[1:] == ["--checks-key"]:
            # The environment's wins before cloud.json is even read (CI has none).
            print(checks_export({} if os.environ.get("CHECKS_KEY", "").strip() else load()))
        else:
            cfg = load()
            print(exports(cfg) if quiet else f"cloud config: {config_path()}")
    except ConfigError as e:
        print(e, file=sys.stderr if quiet else sys.stdout)
        sys.exit(1)
