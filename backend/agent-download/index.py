"""
Business: Собирает ZIP с Windows-агентом, публикует в S3, заодно синхронизирует scanner.py в agent_versions для самообновления.
Args: event с httpMethod GET; context с request_id
Returns: JSON {success, url, version}
"""

import base64
import io
import json
import os
import re
import zipfile
import boto3
import psycopg2

from agent_files import AGENT_FILES, SCANNER_PY


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    }


def detect_version(src: str) -> int:
    m = re.search(r'AGENT_VERSION\s*=\s*(\d+)', src)
    return int(m.group(1)) if m else 1


def sync_version_to_db(src: str) -> int:
    version = detect_version(src)
    dsn = os.environ.get('DATABASE_URL', '')
    if not dsn:
        return version
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    cur = conn.cursor()
    try:
        b64_src = base64.b64encode(src.encode('utf-8')).decode('ascii')
        marker = 'B64:' + b64_src
        cur.execute(f"SELECT version FROM agent_versions WHERE version = {version}")
        row = cur.fetchone()
        if row:
            cur.execute(
                f"UPDATE agent_versions SET source = '{marker}', "
                f"uploaded_at = CURRENT_TIMESTAMP, notes = 'auto-sync from agent-download' "
                f"WHERE version = {version}"
            )
        else:
            cur.execute(
                f"INSERT INTO agent_versions (version, source, is_current, notes) "
                f"VALUES ({version}, '{marker}', TRUE, 'auto-sync from agent-download')"
            )
        cur.execute("UPDATE agent_versions SET is_current = FALSE")
        cur.execute(f"UPDATE agent_versions SET is_current = TRUE WHERE version = {version}")
    finally:
        cur.close()
        conn.close()
    return version


def handler(event: dict, context) -> dict:
    """Сборка ZIP, публикация в S3, синк скрипта в БД"""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}

    version = sync_version_to_db(SCANNER_PY)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name, content in AGENT_FILES.items():
            zf.writestr(f"network-agent/{name}", content)
    buf.seek(0)

    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    key = 'agent/network-agent.zip'
    s3.put_object(
        Bucket='files',
        Key=key,
        Body=buf.getvalue(),
        ContentType='application/zip',
        ContentDisposition='attachment; filename="network-agent.zip"',
    )
    cdn_url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

    return {
        'statusCode': 200,
        'headers': cors_headers(),
        'body': json.dumps({
            'success': True,
            'url': cdn_url,
            'size': len(buf.getvalue()),
            'version': version,
            'files': list(AGENT_FILES.keys()),
        }),
    }