#!/usr/bin/env python3
"""
Patch ComfyUI frontend assets so Missing Models downloads run on the server.

For recent ComfyUI frontend versions, the download logic lives in the
missingModelDownload-*.js chunk. Older versions used an inline
triggerBrowserDownload click handler inside the main bundle.

This script supports both:
- Preferred: patch missingModelDownload-*.js
- Fallback: patch legacy triggerBrowserDownload bundles

Idempotent: skips if the server-side patch marker is already present.
"""

from __future__ import annotations

import glob
import importlib.resources
import os
import re
import sys
from pathlib import Path


DOWNLOAD_MANAGER_JS = Path(__file__).with_name("download_manager.js")
PATCH_MARKER = "__sfServerDownloadV2"
ENV_ASSETS_DIR = "COMFYUI_FRONTEND_ASSETS_DIR"


LEGACY_ONCLICK_HANDLER = (
    "onClick:function(){"
    "var _parts=t.label?t.label.split(\" / \"):[];"
    "var _dir=_parts.length>1?_parts[0].trim():\"checkpoints\";"
    "var _fn=_parts.length>1?_parts.slice(1).join(\"/\").trim():(t.url||\"\").split(\"/\").pop().split(\"?\")[0];"
    "if(window.__sfServerDownloadStart){window.__sfServerDownloadStart({url:t.url,directory:_dir,name:_fn})}"
    "}"
)
LEGACY_ONCLICK_PATTERN = re.compile(r"onClick:[^,}]+?\.triggerBrowserDownload")

SERVER_DOWNLOAD_HELPER = r"""
;(()=>{if(typeof window==="undefined"||window.__sfServerDownloadV2)return;window.__sfServerDownloadV2=true;
var _sources=["https://civitai.com/","https://huggingface.co/","https://github.com/","https://raw.githubusercontent.com/","http://localhost:"];
var _suffixes=[".safetensors",".sft",".ckpt",".pth",".pt",".pt2",".bin",".pkl",".gguf",".onnx"];
function _getString(v){return typeof v==="string"?v:""}
function _filenameFromUrl(url){
  try{
    var u=new URL(url);
    var part=u.pathname.split("/").pop()||"";
    return decodeURIComponent(part).trim();
  }catch(_e){
    var raw=_getString(url).split("/").pop()||"";
    return raw.split("?")[0].trim();
  }
}
function _isAllowedSource(url){
  return _sources.some(function(prefix){return _getString(url).startsWith(prefix)});
}
function _isAllowedSuffix(name){
  var lower=_getString(name).toLowerCase();
  return _suffixes.some(function(ext){return lower.endsWith(ext)});
}
window.__sfServerDownloadValidate=function(model){
  if(!model||typeof model!=="object")return false;
  var url=_getString(model.url);
  var name=_getString(model.name)||_filenameFromUrl(url);
  return !!url&&_isAllowedSource(url)&&_isAllowedSuffix(name);
};
window.__sfServerDownloadStart=function(model){
  if(!window.__sfServerDownloadValidate(model))return Promise.resolve({status:"invalid"});
  var url=_getString(model.url);
  var directory=_getString(model.directory)||"checkpoints";
  var filename=_getString(model.name)||_filenameFromUrl(url);
  var key=directory+"/"+filename;
  return fetch("/api/download-model",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({url:url,directory:directory,filename:filename})
  }).then(function(resp){return resp.json()}).then(function(data){
    if((data.status==="started"||data.status==="already_downloading")&&window.__sfStartTracker){
      window.__sfStartTracker(key,filename,null);
    }
    return data;
  }).catch(function(err){
    return {status:"error",error:String(err)};
  });
};
})();
""".strip()


def get_assets_dir() -> Path:
    env_override = os.getenv(ENV_ASSETS_DIR)
    if env_override:
        return Path(env_override)

    try:
        import comfyui_frontend_package

        return Path(importlib.resources.files(comfyui_frontend_package) / "static" / "assets")
    except Exception as exc:  # pragma: no cover - runtime fallback
        print(f"[comfyui-spark] ERROR: unable to locate frontend assets: {exc}")
        sys.exit(1)


def load_download_manager() -> str:
    if not DOWNLOAD_MANAGER_JS.exists():
        print(f"[comfyui-spark] ERROR: {DOWNLOAD_MANAGER_JS} not found")
        sys.exit(1)
    return DOWNLOAD_MANAGER_JS.read_text(encoding="utf-8")


def append_patch_payload(content: str) -> str:
    return content + "\n" + SERVER_DOWNLOAD_HELPER + "\n" + load_download_manager() + "\n"


def find_matching_brace(content: str, open_brace_index: int) -> int:
    depth = 0
    for idx in range(open_brace_index, len(content)):
        ch = content[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return idx
    raise ValueError("Unbalanced braces while patching frontend asset")


def replace_named_function(content: str, name: str, replacement: str) -> tuple[str, bool]:
    marker = f"function {name}("
    start = content.find(marker)
    if start == -1:
        return content, False
    open_brace = content.find("{", start)
    if open_brace == -1:
        raise ValueError(f"Could not find opening brace for {name}")
    end = find_matching_brace(content, open_brace)
    return content[:start] + replacement + content[end + 1 :], True


def patch_download_module(assets_dir: Path) -> bool:
    candidates = list(sorted(assets_dir.glob("missingModelDownload-*.js")))
    candidates.extend(
        path
        for path in sorted(assets_dir.glob("*.js"))
        if path.name.startswith("dialogService-")
    )
    candidates.extend(
        path
        for path in sorted(assets_dir.glob("*.js"))
        if path not in candidates
    )

    for path in candidates:
        content = path.read_text(encoding="utf-8", errors="replace")
        if "function downloadModel(" not in content or "function isModelDownloadable(" not in content:
            continue
        if PATCH_MARKER in content:
            print(f"[comfyui-spark] Already patched: {path.name}")
            return True

        patched, changed_validate = replace_named_function(
            content,
            "isModelDownloadable",
            "function isModelDownloadable(e){return !!(window.__sfServerDownloadValidate&&window.__sfServerDownloadValidate(e))}",
        )
        patched, changed_download = replace_named_function(
            patched,
            "downloadModel",
            "function downloadModel(t,n){return window.__sfServerDownloadStart?window.__sfServerDownloadStart({url:t.url,directory:t.directory,name:t.name}):void 0}",
        )

        if not (changed_validate and changed_download):
            continue

        path.write_text(append_patch_payload(patched), encoding="utf-8")
        print(f"[comfyui-spark] Patched frontend download module: {path.name}")
        return True

    return False


def patch_legacy_bundle(assets_dir: Path) -> bool:
    for path in glob.glob(str(assets_dir / "*.js")):
        if path.endswith(".map"):
            continue
        content = Path(path).read_text(encoding="utf-8", errors="replace")
        if "triggerBrowserDownload" not in content:
            continue
        if PATCH_MARKER in content:
            print(f"[comfyui-spark] Already patched: {os.path.basename(path)}")
            return True

        matches = LEGACY_ONCLICK_PATTERN.findall(content)
        if not matches:
            continue

        patched = LEGACY_ONCLICK_PATTERN.sub(LEGACY_ONCLICK_HANDLER, content)
        Path(path).write_text(append_patch_payload(patched), encoding="utf-8")
        print(f"[comfyui-spark] Patched legacy frontend bundle: {os.path.basename(path)}")
        return True

    return False


def main() -> None:
    assets_dir = get_assets_dir()
    if not assets_dir.is_dir():
        print(f"[comfyui-spark] ERROR: assets directory not found: {assets_dir}")
        sys.exit(1)

    print(f"[comfyui-spark] Frontend assets: {assets_dir}")

    if patch_download_module(assets_dir):
        print("[comfyui-spark] Done. Server-side download patch applied.")
        return

    if patch_legacy_bundle(assets_dir):
        print("[comfyui-spark] Done. Server-side download patch applied.")
        return

    print("[comfyui-spark] ERROR: Could not find a supported frontend download hook to patch")
    sys.exit(1)


if __name__ == "__main__":
    main()
