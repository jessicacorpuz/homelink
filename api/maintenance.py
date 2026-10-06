from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

class handler(BaseHTTPRequestHandler):

    def _json(self, status, body):
        data = json.dumps(body).encode()

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

        self.wfile.write(data)

    def do_OPTIONS(self):
        self._json(200, {"ok": True})

    def do_POST(self):
        if not SUPABASE_URL:
            return self._json(500, {
                "error": "SUPABASE_URL is not configured on Vercel."
            })

        if not SUPABASE_ANON_KEY:
            return self._json(500, {
                "error": "SUPABASE_ANON_KEY is not configured on Vercel."
            })

        auth = self.headers.get("Authorization", "")

        if not auth.startswith("Bearer "):
            return self._json(401, {
                "error": "Authentication required. Please log in again."
            })

        try:
            user_request = urllib.request.Request(
                SUPABASE_URL + "/auth/v1/user",
                method="GET",
                headers={
                    "Authorization": auth,
                    "apikey": SUPABASE_ANON_KEY
                }
            )

            with urllib.request.urlopen(user_request, timeout=15) as user_response:
                user = json.loads(
                    user_response.read().decode() or "{}"
                )

            user_id = user.get("id")

            if not user_id:
                return self._json(401, {
                    "error": "Could not identify the signed-in user."
                })

            content_length = int(
                self.headers.get("Content-Length", "0")
            )

            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body or b"{}")

            required_fields = [
                "property_name",
                "unit",
                "issue_type",
                "title",
                "description"
            ]

            for field in required_fields:
                value = str(
                    payload.get(field, "")
                ).strip()

                if not value:
                    return self._json(400, {
                        "error": f"{field} is required."
                    })

            maintenance_data = {
                "tenant_id": user_id,
                "property_name": str(
                    payload["property_name"]
                ).strip(),
                "unit": str(
                    payload["unit"]
                ).strip(),
                "issue_type": str(
                    payload["issue_type"]
                ).strip(),
                "title": str(
                    payload["title"]
                ).strip(),
                "description": str(
                    payload["description"]
                ).strip(),
                "priority": str(
                    payload.get("priority", "Normal")
                ).strip(),
                "status": "Open"
            }

            request_body = json.dumps(
                maintenance_data
            ).encode()

            supabase_request = urllib.request.Request(
                SUPABASE_URL + "/rest/v1/maintenance_requests",
                data=request_body,
                method="POST",
                headers={
                    "Authorization": auth,
                    "apikey": SUPABASE_ANON_KEY,
                    "Content-Type": "application/json",
                    "Prefer": "return=representation"
                }
            )

            with urllib.request.urlopen(
                supabase_request,
                timeout=15
            ) as response:
                created = json.loads(
                    response.read().decode() or "[]"
                )

            return self._json(201, {
                "success": True,
                "request": created[0] if created else None
            })

        except urllib.error.HTTPError as error:
            detail = error.read().decode(errors="replace")

            return self._json(error.code, {
                "error": detail
            })

        except Exception as error:
            return self._json(500, {
                "error": str(error)
            })
