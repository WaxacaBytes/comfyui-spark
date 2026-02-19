#!/usr/bin/env python3
"""
Patches the ComfyUI frontend JS to replace browser-based model downloads
with server-side downloads via /api/download-model.

Idempotent: skips if already patched (__sfDownloadMgr marker present).
"""

import glob
import os
import re
import sys

ASSETS_DIR = "/app/venv/lib/python3.12/site-packages/comfyui_frontend_package/static/assets"
DOWNLOAD_MANAGER_JS = os.path.join(os.path.dirname(__file__), "download_manager.js")

# The server-side onClick handler that replaces triggerBrowserDownload.
# Uses t.url and t.label from the FileDownload component's setup closure.
ONCLICK_HANDLER = (
    "onClick:function(){"
    "var _btn=arguments[0]&&arguments[0].target?arguments[0].target:null;"
    'var _parts=t.label?t.label.split(" / "):[];'
    'var _dir=_parts.length>1?_parts[0].trim():"checkpoints";'
    'var _fn=_parts.length>1?_parts.slice(1).join("/").trim():(t.url||"").split("/").pop().split("?")[0];'
    'var _key=_dir+"/"+_fn;'
    'if(_btn){_btn.textContent="Starting...";_btn.disabled=true}'
    "var _h=new Headers();"
    '_h.set("Content-Type","application/json");'
    'fetch("/api/download-model",{method:"POST",headers:_h,body:JSON.stringify({url:t.url,directory:_dir,filename:_fn})})'
    ".then(function(r){return r.json()})"
    ".then(function(d){"
    'if(d.status==="started"){'
    'if(_btn){_btn.textContent="Downloading...";_btn.style.color="#fbbf24"}'
    "window.__sfStartTracker(_key,_fn,_btn)"
    '}'
    'else if(d.status==="already_downloading"){'
    'if(_btn){_btn.textContent="Downloading...";_btn.style.color="#fbbf24"}'
    "window.__sfStartTracker(_key,_fn,_btn)"
    '}'
    'else if(d.status==="already_exists"){'
    'if(_btn){_btn.textContent="Already exists";_btn.style.color="#4ade80"}'
    '}'
    "else{"
    'if(_btn){_btn.textContent="Error: "+(d.error||"unknown");_btn.style.color="#f87171";_btn.disabled=false}'
    "}"
    "})"
    ".catch(function(err){"
    'if(_btn){_btn.textContent="Failed";_btn.style.color="#f87171";_btn.disabled=false}'
    "})"
    "}"
)

# Regex to find the onClick handler that calls triggerBrowserDownload.
# Matches: onClick:VARNAME.triggerBrowserDownload
# The variable name is typically a single minified letter.
ONCLICK_PATTERN = re.compile(r"onClick:\w+\.triggerBrowserDownload")


def find_target_file():
    """Find the JS file containing triggerBrowserDownload."""
    pattern = os.path.join(ASSETS_DIR, "*.js")
    for filepath in glob.glob(pattern):
        if filepath.endswith(".map"):
            continue
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        if "triggerBrowserDownload" in content:
            return filepath, content
    return None, None


def main():
    # Find target file
    filepath, content = find_target_file()
    if not filepath:
        print("[comfyui-spark] ERROR: Could not find JS file containing triggerBrowserDownload")
        sys.exit(1)

    print(f"[comfyui-spark] Found target: {os.path.basename(filepath)}")

    # Check idempotency
    if "__sfDownloadMgr" in content:
        print("[comfyui-spark] Already patched (found __sfDownloadMgr). Skipping.")
        return

    # Find and count matches
    matches = ONCLICK_PATTERN.findall(content)
    if not matches:
        print("[comfyui-spark] ERROR: Could not find onClick:*.triggerBrowserDownload pattern")
        sys.exit(1)

    print(f"[comfyui-spark] Found {len(matches)} onClick:triggerBrowserDownload occurrence(s)")

    # Replace the onClick handler (only in FileDownload, not ElectronFileDownload)
    # The FileDownload component is the web version; ElectronFileDownload is for desktop.
    # We replace ALL occurrences since the pattern only appears in FileDownload's template.
    patched = ONCLICK_PATTERN.sub(ONCLICK_HANDLER, content)

    # Load and append the download manager IIFE
    if not os.path.exists(DOWNLOAD_MANAGER_JS):
        print(f"[comfyui-spark] ERROR: {DOWNLOAD_MANAGER_JS} not found")
        sys.exit(1)

    with open(DOWNLOAD_MANAGER_JS, "r", encoding="utf-8") as f:
        dm_code = f.read()

    patched += "\n" + dm_code

    # Write back
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(patched)

    print("[comfyui-spark] Done. Server-side download patch applied successfully.")


if __name__ == "__main__":
    main()
