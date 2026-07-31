#!/usr/bin/env python3
"""
PostForge Python Local Development Server
Serves static index.html and provides API endpoints (/api/auth/login, /api/auth/register, /api/drafts)
Connected to MongoDB Atlas with automatic offline fallback (users_fallback.json).
"""

import http.server
import socketserver
import json
import os
import urllib.parse
import sys

# MongoDB URI & Settings
MONGO_URI = "mongodb+srv://Pritesh0525:Pritesh123@cluster0.5herxdg.mongodb.net/FS?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "FS"
COLLECTION_NAME = "FS1"

# Try importing pymongo
try:
    from pymongo import MongoClient
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    # Test connection
    client.admin.command('ping')
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    mongo_connected = True
    print("[PostForge Server] Successfully connected to MongoDB Atlas!")
except Exception as err:
    mongo_connected = False
    print(f"[PostForge Server] MongoDB Atlas connection notice: {err}")
    print("[PostForge Server] Operating in resilient Local Fallback Mode (users_fallback.json).")

FALLBACK_FILE = os.path.join(os.path.dirname(__file__), 'users_fallback.json')

def load_fallback_data():
    if os.path.exists(FALLBACK_FILE):
        try:
            with open(FALLBACK_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"users": [], "drafts": []}

def save_fallback_data(data):
    try:
        with open(FALLBACK_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print("Failed to save fallback data:", e)

def format_name(name_str):
    if not name_str:
        return 'Creator'
    cleaned = name_str.replace('.', ' ').replace('_', ' ').replace('-', ' ')
    words = [w.capitalize() for w in cleaned.split() if w]
    return ' '.join(words) if words else 'Creator'

class PostForgeHandler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == '/api/health':
            self.send_json_response(200, {
                "status": "ok",
                "service": "PostForge Engine",
                "mongoConnected": mongo_connected
            })
            return

        if parsed.path == '/api/drafts':
            query = urllib.parse.parse_qs(parsed.query)
            email = query.get('email', [''])[0]
            
            if not email:
                self.send_json_response(400, {"error": "Email query param required"})
                return

            if mongo_connected:
                try:
                    user_doc = collection.find_one({"type": "user", "email": email})
                    drafts_cursor = collection.find({"type": "draft", "userEmail": email})
                    user_drafts = []
                    for d in drafts_cursor:
                        d['id'] = str(d.get('_id', d.get('id')))
                        d.pop('_id', None)
                        user_drafts.append(d)
                    self.send_json_response(200, {"drafts": user_drafts})
                    return
                except Exception as e:
                    print("MongoDB GET drafts error:", e)

            # Local fallback
            data = load_fallback_data()
            user_drafts = [d for d in data.get('drafts', []) if d.get('userEmail') == email]
            self.send_json_response(200, {"drafts": user_drafts})
            return

        # Default static file handler (serves index.html, src/*, etc.)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length)
        
        try:
            body = json.loads(body_bytes.decode('utf-8')) if body_bytes else {}
        except Exception:
            body = {}

        if parsed.path == '/api/auth/login':
            email = body.get('email')
            password = body.get('password')
            if not email or not password:
                self.send_json_response(400, {"success": False, "message": "Email and password required"})
                return

            if mongo_connected:
                try:
                    doc = collection.find_one({"type": "user", "email": email, "password": password})
                    if doc:
                        raw_name = doc.get('name') or email.split('@')[0]
                        user_info = {"email": doc.get('email'), "name": format_name(raw_name)}
                        self.send_json_response(200, {"success": True, "user": user_info})
                        return
                except Exception as e:
                    print("MongoDB login error:", e)

            # Fallback check
            data = load_fallback_data()
            users = data.get('users', [])
            matched = next((u for u in users if u.get('email') == email and u.get('password') == password), None)
            if matched:
                user_info = {"email": matched['email'], "name": format_name(matched.get('name') or matched['email'].split('@')[0])}
                self.send_json_response(200, {"success": True, "user": user_info})
            else:
                # Accept login for demo
                user_info = {"email": email, "name": format_name(email.split('@')[0])}
                self.send_json_response(200, {"success": True, "user": user_info})
            return

        if parsed.path == '/api/auth/register':
            email = body.get('email')
            password = body.get('password')
            name = body.get('name', email.split('@')[0] if email else 'User')
            
            if not email or not password:
                self.send_json_response(400, {"success": False, "message": "Email and password required"})
                return

            user_doc = {"type": "user", "email": email, "password": password, "name": name}

            if mongo_connected:
                try:
                    existing = collection.find_one({"type": "user", "email": email})
                    if existing:
                        self.send_json_response(400, {"success": False, "message": "User with this email already exists"})
                        return
                    collection.insert_one(user_doc)
                    self.send_json_response(200, {"success": True, "user": {"email": email, "name": name}})
                    return
                except Exception as e:
                    print("MongoDB register error:", e)

            # Fallback save
            data = load_fallback_data()
            data.setdefault('users', []).append(user_doc)
            save_fallback_data(data)
            self.send_json_response(200, {"success": True, "user": {"email": email, "name": name}})
            return

        if parsed.path == '/api/drafts':
            draft_id = body.get('id')
            user_email = body.get('userEmail')
            if not draft_id or not user_email:
                self.send_json_response(400, {"error": "Invalid draft payload"})
                return

            body['type'] = 'draft'

            if mongo_connected:
                try:
                    collection.update_one(
                        {"type": "draft", "id": draft_id, "userEmail": user_email},
                        {"$set": body},
                        upsert=True
                    )
                    self.send_json_response(200, {"success": True})
                    return
                except Exception as e:
                    print("MongoDB save draft error:", e)

            # Local fallback save
            data = load_fallback_data()
            drafts_list = data.setdefault('drafts', [])
            idx = next((i for i, d in enumerate(drafts_list) if d.get('id') == draft_id), -1)
            if idx >= 0:
                drafts_list[idx] = body
            else:
                drafts_list.append(body)
            save_fallback_data(data)
            self.send_json_response(200, {"success": True})
            return

        self.send_json_response(404, {"error": "Endpoint not found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/drafts':
            query = urllib.parse.parse_qs(parsed.query)
            draft_id = query.get('id', [''])[0]
            email = query.get('email', [''])[0]

            if mongo_connected and draft_id:
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
                    print("MongoDB delete draft error:", e)

            # Fallback local delete
            data = load_fallback_data()
            if 'drafts' in data:
                data['drafts'] = [d for d in data['drafts'] if str(d.get('id')) != str(draft_id)]
                save_fallback_data(data)

            self.send_json_response(200, {"success": True})
            return

        self.send_json_response(404, {"error": "Endpoint not found"})

    def send_json_response(self, status, payload):
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

handler = PostForgeHandler

def run_server(port=8000):
    os.chdir(os.path.dirname(__file__))
    server_address = ('', port)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(server_address, PostForgeHandler)
    print(f"[PostForge Server] Running on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[PostForge Server] Shutting down...")
        httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
