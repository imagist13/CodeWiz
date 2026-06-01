import json
import urllib.request
import urllib.parse
from typing import Any, Dict


def execute_api_tool(config: Dict[str, Any], parameters: Dict[str, Any]) -> str:
    """Execute an API tool based on its configuration and parameters.

    Args:
        config: Tool configuration dict with keys: url, method, headers, timeout
        parameters: Arguments passed by the LLM

    Returns:
        JSON string with the API response or error info
    """
    url = config.get("url", "")
    method = config.get("method", "GET").upper()
    headers = config.get("headers", {}) or {}
    timeout = config.get("timeout", 30)

    if not url:
        return json.dumps({"error": "API tool config is missing 'url'"})

    try:
        req_headers = dict(headers)
        body = None

        if method == "GET":
            if parameters:
                query = urllib.parse.urlencode(parameters)
                url = f"{url}?{query}"
        elif method in ("POST", "PUT", "PATCH"):
            req_headers.setdefault("Content-Type", "application/json")
            body = json.dumps(parameters).encode("utf-8")
        elif method == "DELETE":
            if parameters:
                query = urllib.parse.urlencode(parameters)
                url = f"{url}?{query}"

        req = urllib.request.Request(
            url,
            data=body,
            headers=req_headers,
            method=method,
        )

        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            content_type = response.headers.get("Content-Type", "")

            if "application/json" in content_type:
                try:
                    parsed = json.loads(raw)
                    return json.dumps(parsed, ensure_ascii=False)
                except json.JSONDecodeError:
                    return json.dumps({"raw": raw}, ensure_ascii=False)
            else:
                return json.dumps({"raw": raw}, ensure_ascii=False)

    except urllib.error.HTTPError as e:
        try:
            error_body = e.read().decode("utf-8")
        except Exception:
            error_body = ""
        return json.dumps({
            "error": f"HTTP {e.code}: {e.reason}",
            "status": e.code,
            "body": error_body,
        }, ensure_ascii=False)

    except urllib.error.URLError as e:
        return json.dumps({
            "error": f"Request failed: {e.reason}"
        }, ensure_ascii=False)

    except Exception as e:
        return json.dumps({
            "error": f"Request failed: {str(e)}"
        }, ensure_ascii=False)
