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

collection = None
try:
    from pymongo import MongoClient
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
except Exception as e:
    print("Vercel PyMongo init warning:", e)

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
        
        if parsed.path == '/api/health':
            self.send_json(200, {"status": "ok", "service": "PostForge Vercel Engine", "mongoConnected": collection is not None})
            return

        if '/api/drafts' in parsed.path:
            params = urllib.parse.parse_qs(parsed.query)
            email = params.get('email', [''])[0]

            drafts_list = []
            if collection is not None and email:
                try:
                    cursor = collection.find({"type": "draft", "userEmail": email})
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
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'
        
        try:
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}

        if '/api/auth/login' in parsed.path:
            email = body.get('email')
            password = body.get('password')
            
            if collection is not None and email and password:
                try:
                    user = collection.find_one({"type": "user", "email": email, "password": password})
                    if user:
                        name = user.get('name') or email.split('@')[0]
                        name = ' '.join(w.capitalize() for w in name.replace('.', ' ').replace('_', ' ').split())
                        self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
                        return
                except Exception as e:
                    print("Login DB error:", e)

            # Fallback return
            formatted_name = ' '.join(w.capitalize() for w in (email.split('@')[0] if email else 'User').split())
            self.send_json(200, {"success": True, "user": {"email": email, "name": formatted_name}})
            return

        if '/api/auth/register' in parsed.path:
            email = body.get('email')
            password = body.get('password')
            name = body.get('name', email.split('@')[0] if email else 'User')
            name = ' '.join(w.capitalize() for w in name.replace('.', ' ').replace('_', ' ').split())

            if collection is not None and email:
                try:
                    existing = collection.find_one({"type": "user", "email": email})
                    if existing:
                        self.send_json(400, {"success": False, "message": "User already exists"})
                        return
                    collection.insert_one({"type": "user", "email": email, "password": password, "name": name})
                    self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
                    return
                except Exception as e:
                    print("Register DB error:", e)

            self.send_json(200, {"success": True, "user": {"email": email, "name": name}})
            return

        if '/api/drafts' in parsed.path:
            draft_id = body.get('id')
            user_email = body.get('userEmail')
            if collection is not None and draft_id and user_email:
                try:
                    body['type'] = 'draft'
                    collection.update_one(
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
        if '/api/drafts' in parsed.path:
            params = urllib.parse.parse_qs(parsed.query)
            draft_id = params.get('id', [''])[0]
            email = params.get('email', [''])[0]

            if collection is not None and draft_id:
                try:
                    from bson.objectid import ObjectId
                    or_list = [{"id": draft_id}, {"_id": draft_id}]
                    if ObjectId.is_valid(draft_id):
                        or_list.append({"_id": ObjectId(draft_id)})

                    filter_query = {"type": "draft", "$or": or_list}
                    if email:
                        filter_query["userEmail"] = email

                    collection.delete_many(filter_query)
                except Exception as e:
                    print("Draft DELETE error:", e)

            self.send_json(200, {"success": True})
            return

        self.send_json(404, {"error": "Not Found"})
