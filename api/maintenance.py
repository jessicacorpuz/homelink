from http.server import BaseHTTPRequestHandler
import json, os, urllib.request, urllib.error

SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')

class handler(BaseHTTPRequestHandler):
    def _json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'authorization, content-type')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._json(200, {'ok': True})

    def do_POST(self):
        if not SUPABASE_URL:
            return self._json(500, {'error': 'SUPABASE_URL is not configured on Vercel.'})
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return self._json(401, {'error': 'Authentication required.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            payload = json.loads(self.rfile.read(length) or '{}')
            required = ['property_name', 'unit', 'issue_type', 'title', 'description']
            if any(not str(payload.get(k, '')).strip() for k in required):
                return self._json(400, {'error': 'All maintenance fields are required.'})
            data = {
                'property_name': payload['property_name'].strip(),
                'unit': payload['unit'].strip(),
                'issue_type': payload['issue_type'].strip(),
                'title': payload['title'].strip(),
                'description': payload['description'].strip(),
                'priority': payload.get('priority', 'Normal'),
                'status': 'Open'
            }
            body = json.dumps(data).encode()
            req = urllib.request.Request(
                SUPABASE_URL + '/rest/v1/maintenance_requests',
                data=body,
                method='POST',
                headers={
                    'Authorization': auth,
                    'apikey': os.environ.get('SUPABASE_ANON_KEY', ''),
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                created = json.loads(response.read().decode() or '[]')
            return self._json(201, {'request': created[0] if created else None})
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors='replace')
            return self._json(e.code, {'error': detail})
        except Exception as e:
            return self._json(500, {'error': str(e)})

user_id = user["id"]

request_data = {
    "tenant_id": user_id,
    "property_name": data["property_name"],
    "unit": data["unit"],
    "issue_type": data["issue_type"],
    "title": data["title"],
    "description": data["description"],
    "priority": data.get("priority", "Normal")
}

result = supabase.table("maintenance_requests").insert(request_data).execute()

"tenant_id": user_id,
