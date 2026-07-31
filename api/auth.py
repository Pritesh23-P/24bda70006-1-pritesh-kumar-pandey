"""
Vercel Serverless Function Handler for PostForge API
Official Vercel Python Runtime specification (BaseHTTPRequestHandler)
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.parse

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb+srv://Pritesh0525:Pritesh123@cluster0.5herxdg.mongodb.net/FS?retryWrites=true&w=majority&appName=Cluster0"
)
DB_NAME = "FS"
COLLECTION_NAME = "FS1"

def get_collection():
    try:
        from pymongo import MongoClient
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=4000, connectTimeoutMS=4000)
        return client[DB_NAME][COLLECTION_NAME]
    except Exception as e:
        print("Vercel PyMongo warning:", e)
        return None

def format_name(name_str):
    if not name_str:
        return 'Creator'
    cleaned = name_str.replace('.', ' ').replace('_', ' ').replace('-', ' ')
    words = [w.capitalize() for w in cleaned.split() if w]
    return ' '.join(words) if words else 'Creator'

class handler(BaseHTTPRequestHandler):

    def send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # Serve index.html for root or static non-API paths
        if parsed.path == '/' or (not 'api' in parsed.path and not 'draft' in parsed.path and not 'health' in parsed.path and not 'login' in parsed.path and not 'register' in parsed.path):
            index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'index.html')
            if os.path.exists(index_path):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                with open(index_path, 'rb') as f:
                    self.wfile.write(f.read())
                return

        if 'health' in parsed.path:
            col = get_collection()
            self.send_json(200, {"status": "ok", "service": "PostForge Vercel Engine", "mongoConnected": col is not None})
            return

        if 'draft' in parsed.path:
            params = urllib.parse.parse_qs(parsed.query)
            email = params.get('email', [''])[0]

            drafts_list = []
            col = get_collection()
            if col is not None and email:
                try:
                    cursor = col.find({"type": "draft", "userEmail": email})
                    for d in cursor:
                        d['id'] = str(d.get('_id', d.get('id')))
                        d.pop('_id', None)
                        drafts_list.append(d)
                except Exception as e:
                    print("Drafts GET error:", e)

            self.send_json(200, {"drafts": drafts_list})
            return

        self.send_json(404, {"error": "Not Found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        
        try:
            length_hdr = self.headers.get('Content-Length') or self.headers.get('content-length') or '0'
            content_length = int(length_hdr)
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}

        if 'login' in parsed.path:
            email = body.get('email', '')
            password = body.get('password', '')
            
            if not email:
                self.send_json(400, {"success": False, "message": "Email is required"})
                return

            col = get_collection()
            if col is not None and password:
                try:
                    user = col.find_one({"type": "user", "email": email, "password": password})
                    if user:
                        name = format_name(user.get('name') or email.split('@')[0])
                        self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
                        return
                    else:
                        # Auto register user for frictionless auth
                        name = format_name(email.split('@')[0])
                        col.insert_one({"type": "user", "email": email, "password": password, "name": name})
                        self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
                        return
                except Exception as e:
                    print("Login DB error:", e)

            # Fallback auth return
            name = format_name(email.split('@')[0])
            self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
            return

        if 'register' in parsed.path:
            email = body.get('email', '')
            password = body.get('password', '')
            raw_name = body.get('name') or email.split('@')[0] if email else 'User'
            name = format_name(raw_name)

            if not email:
                self.send_json(400, {"success": False, "message": "Email is required"})
                return

            col = get_collection()
            if col is not None:
                try:
                    existing = col.find_one({"type": "user", "email": email})
                    if existing:
                        self.send_json(200, {"success": True, "user": {"email": email, "name": format_name(existing.get('name') or name)}})
                        return
                    col.insert_one({"type": "user", "email": email, "password": password, "name": name})
                    self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
                    return
                except Exception as e:
                    print("Register DB error:", e)

            self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
            return

        if 'draft' in parsed.path:
            draft_id = body.get('id')
            user_email = body.get('userEmail')
            col = get_collection()
            if col is not None and draft_id and user_email:
                try:
                    body['type'] = 'draft'
                    col.update_one(
                        {"type": "draft", "id": draft_id, "userEmail": user_email},
                        {"$set": body},
                        upsert=True
                    )
                except Exception as e:
                    print("Draft POST error:", e)

            self.send_json(200, {"success": True})
            return

        self.send_json(404, {"error": "Not Found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if 'draft' in parsed.path:
            params = urllib.parse.parse_qs(parsed.query)
            draft_id = params.get('id', [''])[0]
            email = params.get('email', [''])[0]

            col = get_collection()
            if col is not None and draft_id:
                try:
                    from bson.objectid import ObjectId
                    or_list = [{"id": draft_id}, {"_id": draft_id}]
                    if ObjectId.is_valid(draft_id):
                        or_list.append({"_id": ObjectId(draft_id)})

                    filter_query = {"type": "draft", "$or": or_list}
                    if email:
                        filter_query["userEmail"] = email

                    col.delete_many(filter_query)
                except Exception as e:
                    print("Draft DELETE error:", e)

            self.send_json(200, {"success": True})
            return

        self.send_json(404, {"error": "Not Found"})
