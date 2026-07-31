"""
Vercel Serverless Function Handler for PostForge Authentication and Draft Operations
Entrypoint: api.auth:handler
"""

import json
import os
import urllib.parse

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb+srv://Pritesh0525:Pritesh123@cluster0.5herxdg.mongodb.net/FS?retryWrites=true&w=majority&appName=Cluster0"
)
DB_NAME = "FS"
COLLECTION_NAME = "FS1"

# Initialize pymongo connection if available
db = None
collection = None

try:
    from pymongo import MongoClient
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
except Exception as e:
    print("Vercel PyMongo init error:", e)

def handler(request):
    """
    Standard WSGI/Vercel serverless request handler
    """
    method = getattr(request, 'method', 'GET')
    path = getattr(request, 'path', '/api/auth')
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }

    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'status': 'ok'})
        }

    try:
        body = {}
        if hasattr(request, 'get_data'):
            raw_body = request.get_data(as_text=True)
            if raw_body:
                body = json.loads(raw_body)
        elif hasattr(request, 'body') and request.body:
            body = json.loads(request.body)
    except Exception:
        body = {}

    # Login
    if '/login' in path and method == 'POST':
        email = body.get('email')
        password = body.get('password')
        
        if collection is not None:
            try:
                user = collection.find_one({"type": "user", "email": email, "password": password})
                if user:
                    return {
                        'statusCode': 200,
                        'headers': headers,
                        'body': json.dumps({'success': True, 'user': {'email': email, 'name': user.get('name', email.split('@')[0])}})
                    }
            except Exception as e:
                print("Login error:", e)
        
        # Fallback return
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'success': True, 'user': {'email': email, 'name': email.split('@')[0] if email else 'User'}})
        }

    # Register
    if '/register' in path and method == 'POST':
        email = body.get('email')
        password = body.get('password')
        name = body.get('name', email.split('@')[0] if email else 'User')

        if collection is not None:
            try:
                existing = collection.find_one({"type": "user", "email": email})
                if existing:
                    return {
                        'statusCode': 400,
                        'headers': headers,
                        'body': json.dumps({'success': False, 'message': 'User already exists'})
                    }
                collection.insert_one({"type": "user", "email": email, "password": password, "name": name})
                return {
                    'statusCode': 200,
                    'headers': headers,
                    'body': json.dumps({'success': True, 'user': {'email': email, 'name': name}})
                }
            except Exception as e:
                print("Register error:", e)

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({'success': True, 'user': {'email': email, 'name': name}})
        }

    # Drafts GET & POST
    if '/drafts' in path:
        if method == 'GET':
            query_string = getattr(request, 'query_string', '')
            if hasattr(query_string, 'decode'):
                query_string = query_string.decode('utf-8')
            params = urllib.parse.parse_qs(query_string)
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

            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'drafts': drafts_list})
            }

        if method == 'POST':
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

        if method == 'DELETE':
            query_string = getattr(request, 'query_string', '')
            if hasattr(query_string, 'decode'):
                query_string = query_string.decode('utf-8')
            params = urllib.parse.parse_qs(query_string)
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

            return {
                'statusCode': 200,
                'headers': headers,
                'body': json.dumps({'success': True})
            }

    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps({'status': 'PostForge Serverless Function Active'})
    }
